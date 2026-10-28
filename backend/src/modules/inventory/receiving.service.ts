import { PrismaClient, MovementType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { LedgerService } from '../accounting/ledger.service.js';

export class ReceivingService {
  constructor(private prisma: PrismaClient) {}

  async receivePOItem(
    userId: string,
    params: {
      purchaseOrderId: string;
      productId: string;
      quantityReceived: number;
      identifiers?: Array<{ serialNo: string; imei?: string; macAddress?: string }>;
    }
  ) {
    const { purchaseOrderId, productId, quantityReceived, identifiers } = params;

    // Validate hardware identifier count matches delivered quantity
    if (identifiers && identifiers.length > 0 && identifiers.length !== quantityReceived) {
      throw new Error(
        `Hardware identifier count (${identifiers.length}) does not match received quantity (${quantityReceived}).`
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Fetch Purchase Order and Item
      const po = await tx.purchaseOrder.findUnique({
        where: { id: purchaseOrderId },
        include: { items: true },
      });

      if (!po) throw new Error('Purchase order not found.');
      if (po.status === 'CANCELLED' || po.status === 'RECEIVED') {
        throw new Error(`Cannot receive items. PO status is currently ${po.status}.`);
      }

      const poItem = po.items.find((item) => item.productId === productId);
      if (!poItem) throw new Error('Product is not part of this purchase order.');

      const remainingAllowed = poItem.orderedQuantity - poItem.receivedQuantity;
      if (quantityReceived > remainingAllowed) {
        throw new Error(
          `Cannot receive ${quantityReceived} units. Only ${remainingAllowed} units remaining to fulfill.`
        );
      }

      // 2. Hardware uniqueness check across existing records
      if (identifiers && identifiers.length > 0) {
        const serials = identifiers.map((i) => i.serialNo);
        const duplicates = await tx.productSerial.findMany({
          where: { productId, serialNo: { in: serials } },
        });

        if (duplicates.length > 0) {
          throw new Error(
            `Duplicate serial number detected: ${duplicates.map((d) => d.serialNo).join(', ')} already exists.`
          );
        }
      }

      // 3. Atomically increment physical product stock
      const product = await tx.product.update({
        where: { id: productId },
        data: { stockQuantity: { increment: quantityReceived } },
      });

      // 4. Update PO item received counter
      const updatedReceivedQty = poItem.receivedQuantity + quantityReceived;
      await tx.purchaseOrderItem.update({
        where: { id: poItem.id },
        data: { receivedQuantity: updatedReceivedQty },
      });

      // 5. Create immutable stock movement entry
      const movement = await tx.stockMovement.create({
        data: {
          productId,
          userId,
          movementType: MovementType.PURCHASE_RECEIPT,
          quantityDelta: quantityReceived,
          unitCost: poItem.unitCost,
          referenceId: po.orderNumber,
          notes: `Receipt against ${po.orderNumber}`,
        },
      });

      // 6. Persist hardware identifiers
      if (identifiers && identifiers.length > 0) {
        await tx.productSerial.createMany({
          data: identifiers.map((ident) => ({
            productId,
            serialNo: ident.serialNo,
            imei: ident.imei || null,
            macAddress: ident.macAddress || null,
            isSold: false,
            stockMovementId: movement.id,
          })),
        });
      }

      // 7. Recompute PO status (PARTIALLY_RECEIVED vs RECEIVED)
      const allItems = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId } });
      const allFullyReceived = allItems.every((item) => {
        const currentQty = item.id === poItem.id ? updatedReceivedQty : item.receivedQuantity;
        return currentQty >= item.orderedQuantity;
      });

      await tx.purchaseOrder.update({
        where: { id: purchaseOrderId },
        data: { status: allFullyReceived ? 'RECEIVED' : 'PARTIALLY_RECEIVED' },
      });

      // 8. General Ledger: Debit Merchandise Inventory (1300), Credit Accounts Payable (2010)
      const receivingValuation = new Decimal(poItem.unitCost).times(quantityReceived);
      await LedgerService.recordEntry(tx, {
        userId,
        reference: po.orderNumber,
        memo: `PO Stock Receiving: ${po.orderNumber} - ${product.name} (Qty: ${quantityReceived})`,
        lines: [
          { debitAccountCode: '1300', amount: receivingValuation },
          { creditAccountCode: '2010', amount: receivingValuation },
        ],
      });

      return {
        success: true,
        orderNumber: po.orderNumber,
        product: product.name,
        quantityReceived,
        stockQuantity: product.stockQuantity,
      };
    });
  }
}
