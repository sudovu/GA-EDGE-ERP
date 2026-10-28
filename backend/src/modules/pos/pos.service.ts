import { PrismaClient, MovementType, PaymentMethod } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { LedgerService } from '../accounting/ledger.service.js';
import { EscPosService, ReceiptPrintData } from './escpos.service.js';

export class POSService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Fast Barcode / SKU / Serial Resolver for Handheld Gun Scanners
   */
  async scanLookup(code: string) {
    const trimmed = code.trim();

    // 1. Check if barcode matches product directly
    let product = await this.prisma.product.findFirst({
      where: {
        OR: [
          { barcode: trimmed },
          { sku: { equals: trimmed, mode: 'insensitive' } },
        ],
      },
      include: {
        serials: {
          where: { isSold: false },
          select: { id: true, serialNo: true, imei: true, macAddress: true },
        },
      },
    });

    if (product) {
      return {
        matchedBy: 'PRODUCT_BARCODE_OR_SKU',
        product,
        assignedSerial: null,
      };
    }

    // 2. Check if scanned string matches an active hardware serial number
    const serialRecord = await this.prisma.productSerial.findFirst({
      where: {
        serialNo: trimmed,
        isSold: false,
      },
      include: {
        product: {
          include: {
            serials: {
              where: { isSold: false },
              select: { id: true, serialNo: true, imei: true, macAddress: true },
            },
          },
        },
      },
    });

    if (serialRecord) {
      return {
        matchedBy: 'HARDWARE_SERIAL',
        product: serialRecord.product,
        assignedSerial: {
          id: serialRecord.id,
          serialNo: serialRecord.serialNo,
          macAddress: serialRecord.macAddress,
          imei: serialRecord.imei,
        },
      };
    }

    throw new Error(`Item not recognized: No product or serial matched scan code "${trimmed}".`);
  }

  /**
   * Atomic Multi-Tender POS Checkout Engine
   */
  async checkout(
    cashierId: string,
    payload: {
      customerId?: string;
      walkInCustomer?: { fullName: string; phone: string };
      items: Array<{ productId: string; quantity: number; serialNos?: string[]; unitPriceOverride?: number }>;
      discount?: number;
      taxRate?: number;
      payments: Array<{ method: PaymentMethod; amount: number; referenceNo?: string }>;
      notes?: string;
    }
  ) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Resolve Customer Entity
      let customerId = payload.customerId;
      if (!customerId) {
        if (payload.walkInCustomer) {
          const customer = await tx.customer.upsert({
            where: { phone: payload.walkInCustomer.phone },
            update: { fullName: payload.walkInCustomer.fullName },
            create: {
              fullName: payload.walkInCustomer.fullName,
              phone: payload.walkInCustomer.phone,
              creditLimit: new Decimal(0.0),
              balanceDue: new Decimal(0.0),
            },
          });
          customerId = customer.id;
        } else {
          // Fallback to default Walk-in Cash Customer
          const walkIn = await tx.customer.upsert({
            where: { phone: '+977-9999999999' },
            update: {},
            create: {
              fullName: 'Walk-in Cash Customer',
              phone: '+977-9999999999',
              creditLimit: new Decimal(0.0),
              balanceDue: new Decimal(0.0),
            },
          });
          customerId = walkIn.id;
        }
      }

      const customer = await tx.customer.findUnique({ where: { id: customerId } });
      if (!customer) throw new Error('Customer profile not found.');

      // 2. Validate Items & Optimistically Lock Stock Quantities
      let calculatedSubTotal = new Decimal(0);
      let calculatedTotalCOGS = new Decimal(0);

      const resolvedLineItems: Array<{
        product: any;
        quantity: number;
        unitPrice: Decimal;
        costPrice: Decimal;
        lineTotal: Decimal;
        serialNos?: string[];
      }> = [];

      for (const item of payload.items) {
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        if (!product) throw new Error(`Product not found: ${item.productId}`);

        if (product.stockQuantity < item.quantity) {
          throw new Error(
            `Insufficient stock for "${product.name}" (SKU: ${product.sku}). Available: ${product.stockQuantity}, Required: ${item.quantity}`
          );
        }

        // Validate serials if product uses them
        if (item.serialNos && item.serialNos.length > 0) {
          if (item.serialNos.length !== item.quantity) {
            throw new Error(
              `Serial count mismatch for "${product.name}". Required: ${item.quantity}, Provided: ${item.serialNos.length}`
            );
          }

          const registered = await tx.productSerial.findMany({
            where: {
              productId: product.id,
              serialNo: { in: item.serialNos },
              isSold: false,
            },
          });

          if (registered.length !== item.quantity) {
            throw new Error(`One or more specified serial numbers for "${product.name}" are invalid or already sold.`);
          }
        }

        const unitPrice = item.unitPriceOverride !== undefined
          ? new Decimal(item.unitPriceOverride)
          : new Decimal(product.retailPrice);

        const lineTotal = unitPrice.times(item.quantity);
        const lineCOGS = new Decimal(product.costPrice).times(item.quantity);

        calculatedSubTotal = calculatedSubTotal.plus(lineTotal);
        calculatedTotalCOGS = calculatedTotalCOGS.plus(lineCOGS);

        resolvedLineItems.push({
          product,
          quantity: item.quantity,
          unitPrice,
          costPrice: product.costPrice,
          lineTotal,
          serialNos: item.serialNos,
        });
      }

      // 3. Tax and Grand Total Derivation
      const discountAmount = new Decimal(payload.discount || 0);
      if (discountAmount.greaterThan(calculatedSubTotal)) {
        throw new Error('Discount cannot exceed subtotal amount.');
      }

      const netTaxable = calculatedSubTotal.minus(discountAmount);
      const taxRate = new Decimal(payload.taxRate ?? 0.13);
      const taxAmount = netTaxable.times(taxRate).toDecimalPlaces(2);
      const grandTotal = netTaxable.plus(taxAmount).toDecimalPlaces(2);

      // 4. Split Tender Payment Reconciliation
      let totalTenderPaid = new Decimal(0);
      let cashTenderPaid = new Decimal(0);
      let nonCashTenderPaid = new Decimal(0);

      for (const p of payload.payments) {
        const amt = new Decimal(p.amount);
        if (amt.lessThanOrEqualTo(0)) throw new Error('Payment amounts must be positive.');
        totalTenderPaid = totalTenderPaid.plus(amt);

        if (p.method === PaymentMethod.CASH) {
          cashTenderPaid = cashTenderPaid.plus(amt);
        } else {
          nonCashTenderPaid = nonCashTenderPaid.plus(amt);
        }
      }

      let changeAmount = new Decimal(0);
      let customerNewCreditDebt = new Decimal(0);

      if (totalTenderPaid.greaterThanOrEqualTo(grandTotal)) {
        // Full or excess payment
        const excess = totalTenderPaid.minus(grandTotal);
        if (excess.greaterThan(0)) {
          if (cashTenderPaid.lessThan(excess)) {
            throw new Error(
              `Non-cash overpayment rejected: Change can only be returned against cash tender. Total non-cash: NPR ${nonCashTenderPaid}, Excess: NPR ${excess}`
            );
          }
          changeAmount = excess;
        }
      } else {
        // Underpayment => Store Credit / Balance Due
        customerNewCreditDebt = grandTotal.minus(totalTenderPaid);

        // Disallow credit for anonymous walk-ins
        if (customer.phone === '+977-9999999999') {
          throw new Error('Credit sales are not allowed for anonymous Walk-in Customer. Full tender required.');
        }

        // Validate Credit Limit
        const projectedBalance = new Decimal(customer.balanceDue).plus(customerNewCreditDebt);
        if (projectedBalance.greaterThan(customer.creditLimit)) {
          throw new Error(
            `Credit limit exceeded for ${customer.fullName}. Limit: NPR ${customer.creditLimit}, Current Due: NPR ${customer.balanceDue}, New Debt: NPR ${customerNewCreditDebt}. Max allowable credit: NPR ${new Decimal(customer.creditLimit).minus(customer.balanceDue)}`
          );
        }

        // Update customer balance due in database
        await tx.customer.update({
          where: { id: customer.id },
          data: { balanceDue: projectedBalance },
        });
      }

      // 5. Generate Sequential Invoice Number: INV-YYYYMMDD-XXXX
      const datePrefix = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const invoiceCount = await tx.invoice.count();
      const invoiceNo = `INV-${datePrefix}-${String(invoiceCount + 1).padStart(4, '0')}`;

      const isFullyPaid = totalTenderPaid.greaterThanOrEqualTo(grandTotal);
      const recordedPaidAmount = isFullyPaid ? grandTotal : totalTenderPaid;

      // 6. Create Invoice & Lines
      const invoice = await tx.invoice.create({
        data: {
          invoiceNo,
          customerId: customer.id,
          userId: cashierId,
          subTotal: calculatedSubTotal,
          discount: discountAmount,
          taxAmount,
          grandTotal,
          paidAmount: recordedPaidAmount,
          changeAmount,
          isPaid: isFullyPaid,
          notes: payload.notes,
          items: {
            create: resolvedLineItems.map((item) => ({
              productId: item.product.id,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              costPrice: item.costPrice,
              totalPrice: item.lineTotal,
            })),
          },
          payments: {
            create: payload.payments.map((p) => ({
              method: p.method,
              amount: new Decimal(p.amount),
              referenceNo: p.referenceNo,
            })),
          },
        },
        include: {
          items: { include: { product: true } },
          payments: true,
          customer: true,
          cashier: true,
        },
      });

      // 7. Atomic Inventory Decrements & Serial Number Dispositions
      for (const item of resolvedLineItems) {
        await tx.product.update({
          where: { id: item.product.id },
          data: { stockQuantity: { decrement: item.quantity } },
        });

        const movement = await tx.stockMovement.create({
          data: {
            productId: item.product.id,
            userId: cashierId,
            movementType: MovementType.SALE_DEDUCTION,
            quantityDelta: -item.quantity,
            unitCost: item.costPrice,
            referenceId: invoice.invoiceNo,
            notes: `POS Sale: ${invoice.invoiceNo}`,
          },
        });

        if (item.serialNos && item.serialNos.length > 0) {
          await tx.productSerial.updateMany({
            where: {
              productId: item.product.id,
              serialNo: { in: item.serialNos },
            },
            data: {
              isSold: true,
              stockMovementId: movement.id,
            },
          });
        }
      }

      // 8. Balanced Double-Entry Accounting Posting
      // -------------------------------------------------------------
      // DEBITS:
      // - 1010 Cash on Hand: cashTenderPaid - changeAmount
      // - 1020 Operating Bank: nonCashTenderPaid
      // - 1200 Accounts Receivable: customerNewCreditDebt
      // - 5010 Cost of Goods Sold: calculatedTotalCOGS
      // CREDITS:
      // - 4010 Retail Hardware Sales: netTaxable (Subtotal - Discount)
      // - 2020 VAT/Tax Payable: taxAmount
      // - 1300 Merchandise Inventory: calculatedTotalCOGS
      // -------------------------------------------------------------
      const netCashReceived = cashTenderPaid.minus(changeAmount);
      const journalLines: Array<{ debitAccountCode?: string; creditAccountCode?: string; amount: Decimal }> = [];

      if (netCashReceived.greaterThan(0)) {
        journalLines.push({ debitAccountCode: '1010', amount: netCashReceived });
      }
      if (nonCashTenderPaid.greaterThan(0)) {
        journalLines.push({ debitAccountCode: '1020', amount: nonCashTenderPaid });
      }
      if (customerNewCreditDebt.greaterThan(0)) {
        journalLines.push({ debitAccountCode: '1200', amount: customerNewCreditDebt });
      }
      if (netTaxable.greaterThan(0)) {
        journalLines.push({ creditAccountCode: '4010', amount: netTaxable });
      }
      if (taxAmount.greaterThan(0)) {
        journalLines.push({ creditAccountCode: '2020', amount: taxAmount });
      }
      if (calculatedTotalCOGS.greaterThan(0)) {
        journalLines.push({ debitAccountCode: '5010', amount: calculatedTotalCOGS });
        journalLines.push({ creditAccountCode: '1300', amount: calculatedTotalCOGS });
      }

      await LedgerService.recordEntry(tx, {
        userId: cashierId,
        reference: invoice.invoiceNo,
        memo: `POS Sales Posting: ${invoice.invoiceNo} (${customer.fullName})`,
        lines: journalLines,
      });

      return invoice;
    });
  }

  /**
   * Retrieves and formats an invoice into raw ESC/POS binary buffer or printable text
   */
  async getThermalReceipt(invoiceId: string, paperWidth: 80 | 58 = 80) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        customer: true,
        cashier: true,
        payments: true,
        items: { include: { product: true } },
      },
    });

    if (!invoice) throw new Error('Invoice not found.');

    const receiptData: ReceiptPrintData = {
      shopName: process.env.SHOP_NAME || 'GA-ERP Solutions',
      shopPhone: process.env.SHOP_PHONE || '+977-1-4455660',
      shopEmail: process.env.SHOP_EMAIL || 'support@nexusedge.internal',
      invoiceNo: invoice.invoiceNo,
      date: invoice.createdAt,
      cashierName: invoice.cashier ? invoice.cashier.fullName : 'Cashier Desk 1',
      customerName: invoice.customer.fullName,
      customerPhone: invoice.customer.phone,
      items: invoice.items.map((i) => ({
        name: i.product.name,
        sku: i.product.sku,
        quantity: i.quantity,
        unitPrice: new Decimal(i.unitPrice).toFixed(2),
        totalPrice: new Decimal(i.totalPrice).toFixed(2),
      })),
      subTotal: new Decimal(invoice.subTotal).toFixed(2),
      discount: new Decimal(invoice.discount).toFixed(2),
      taxAmount: new Decimal(invoice.taxAmount).toFixed(2),
      grandTotal: new Decimal(invoice.grandTotal).toFixed(2),
      paidAmount: new Decimal(invoice.paidAmount).toFixed(2),
      changeAmount: new Decimal(invoice.changeAmount).toFixed(2),
      balanceDue: new Decimal(invoice.customer.balanceDue).toFixed(2),
      payments: invoice.payments.map((p) => ({
        method: p.method,
        amount: new Decimal(p.amount).toFixed(2),
        referenceNo: p.referenceNo,
      })),
    };

    const binaryBuffer = EscPosService.generateBinaryBuffer(receiptData, paperWidth);
    const plainText = EscPosService.renderPlainText(receiptData, paperWidth === 80 ? 42 : 32);

    return {
      invoiceNo: invoice.invoiceNo,
      plainText,
      base64Buffer: binaryBuffer.toString('base64'),
      bufferLength: binaryBuffer.length,
    };
  }

  /**
   * Retrieves customer account statement with credit dues and unpaid invoices
   */
  async getCustomerAccountStatement(customerId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        invoices: {
          orderBy: { createdAt: 'desc' },
          include: { payments: true },
        },
      },
    });

    if (!customer) throw new Error('Customer not found.');

    const totalInvoiced = customer.invoices.reduce((acc, inv) => acc.plus(inv.grandTotal), new Decimal(0));
    const totalPaid = customer.invoices.reduce((acc, inv) => acc.plus(inv.paidAmount), new Decimal(0));

    return {
      customer: {
        id: customer.id,
        fullName: customer.fullName,
        phone: customer.phone,
        creditLimit: customer.creditLimit,
        balanceDue: customer.balanceDue,
      },
      summary: {
        totalInvoiced,
        totalPaid,
        outstandingBalance: customer.balanceDue,
      },
      invoices: customer.invoices,
    };
  }
}
