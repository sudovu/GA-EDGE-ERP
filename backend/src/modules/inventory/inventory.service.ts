import { PrismaClient, MovementType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { LedgerService } from '../accounting/ledger.service.js';

export class InventoryService {
  constructor(private prisma: PrismaClient) {}

  async createProduct(data: any) {
    const existing = await this.prisma.product.findUnique({ where: { sku: data.sku } });
    if (existing) {
      throw new Error(`Product with SKU "${data.sku}" already exists.`);
    }

    if (data.barcode) {
      const barcodeExists = await this.prisma.product.findUnique({ where: { barcode: data.barcode } });
      if (barcodeExists) {
        throw new Error(`Product with barcode "${data.barcode}" already exists.`);
      }
    }

    return this.prisma.product.create({
      data: {
        ...data,
        costPrice: new Decimal(data.costPrice),
        retailPrice: new Decimal(data.retailPrice),
      },
    });
  }

  async updateProduct(id: string, data: any) {
    const updatePayload: any = { ...data };
    if (data.costPrice !== undefined) updatePayload.costPrice = new Decimal(data.costPrice);
    if (data.retailPrice !== undefined) updatePayload.retailPrice = new Decimal(data.retailPrice);

    return this.prisma.product.update({
      where: { id },
      data: updatePayload,
    });
  }

  async getProducts(filters: { category?: string; isSparePart?: boolean; search?: string }) {
    const where: any = {};

    if (filters.category) where.category = filters.category;
    if (filters.isSparePart !== undefined) where.isSparePart = filters.isSparePart;
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { sku: { contains: filters.search, mode: 'insensitive' } },
        { barcode: { contains: filters.search, mode: 'insensitive' } },
        { brand: { contains: filters.search, mode: 'insensitive' } },
        { model: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.product.findMany({
      where,
      include: {
        serials: {
          where: { isSold: false },
          select: { id: true, serialNo: true, imei: true, macAddress: true, createdAt: true },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async getLowStockAlerts() {
    return this.prisma.$queryRaw`
      SELECT 
        id, 
        sku, 
        name, 
        category,
        "stockQuantity", 
        "minStockAlert", 
        "costPrice", 
        "retailPrice", 
        "isSparePart"
      FROM "Product"
      WHERE "stockQuantity" <= "minStockAlert"
      ORDER BY "stockQuantity" ASC;
    `;
  }

  async adjustStock(
    userId: string,
    params: {
      productId: string;
      quantityDelta: number;
      reason: string;
      identifiersToAdd?: Array<{ serialNo: string; imei?: string; macAddress?: string }>;
      serialNumbersToRemove?: string[];
    }
  ) {
    const { productId, quantityDelta, reason, identifiersToAdd, serialNumbersToRemove } = params;

    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id: productId } });
      if (!product) throw new Error(`Product not found: ${productId}`);

      const newQuantity = product.stockQuantity + quantityDelta;
      if (newQuantity < 0) {
        throw new Error(
          `Adjustment rejected: Stock cannot drop below zero. Current: ${product.stockQuantity}, Delta: ${quantityDelta}`
        );
      }

      // Handle Hardware Identifiers on addition
      if (quantityDelta > 0 && identifiersToAdd && identifiersToAdd.length > 0) {
        if (identifiersToAdd.length !== quantityDelta) {
          throw new Error(`Identifier count (${identifiersToAdd.length}) does not match addition delta (${quantityDelta}).`);
        }

        const serialNos = identifiersToAdd.map((s) => s.serialNo);
        const existing = await tx.productSerial.findMany({
          where: { productId, serialNo: { in: serialNos } },
        });

        if (existing.length > 0) {
          throw new Error(`Serial conflict: ${existing.map((e) => e.serialNo).join(', ')} already exists for this product.`);
        }
      }

      // Handle Hardware Identifiers on reduction
      if (quantityDelta < 0 && serialNumbersToRemove && serialNumbersToRemove.length > 0) {
        const requiredRemoval = Math.abs(quantityDelta);
        if (serialNumbersToRemove.length !== requiredRemoval) {
          throw new Error(`Provided serial count (${serialNumbersToRemove.length}) must match reduction count (${requiredRemoval}).`);
        }

        const registeredSerials = await tx.productSerial.findMany({
          where: { productId, serialNo: { in: serialNumbersToRemove }, isSold: false },
        });

        if (registeredSerials.length !== requiredRemoval) {
          throw new Error('One or more specified serials are either invalid or already marked as sold.');
        }

        await tx.productSerial.updateMany({
          where: { productId, serialNo: { in: serialNumbersToRemove } },
          data: { isSold: true },
        });
      }

      // Update physical inventory counter
      const updatedProduct = await tx.product.update({
        where: { id: productId },
        data: { stockQuantity: newQuantity },
      });

      // Record immutable stock movement
      const movement = await tx.stockMovement.create({
        data: {
          productId,
          userId,
          movementType: MovementType.STOCK_ADJUSTMENT,
          quantityDelta,
          unitCost: product.costPrice,
          notes: reason,
        },
      });

      // Insert new serial records if added
      if (quantityDelta > 0 && identifiersToAdd && identifiersToAdd.length > 0) {
        await tx.productSerial.createMany({
          data: identifiersToAdd.map((ident) => ({
            productId,
            serialNo: ident.serialNo,
            imei: ident.imei || null,
            macAddress: ident.macAddress || null,
            isSold: false,
            stockMovementId: movement.id,
          })),
        });
      }

      // Update Double-Entry General Ledger
      const valuationImpact = new Decimal(product.costPrice).times(Math.abs(quantityDelta));
      if (valuationImpact.greaterThan(0)) {
        if (quantityDelta > 0) {
          // Inventory gain: Debit Merchandise Inventory (1300), Credit Cost of Goods Sold (5010)
          await LedgerService.recordEntry(tx, {
            userId,
            reference: movement.id,
            memo: `Inventory Adjustment Gain: ${product.sku} (${reason})`,
            lines: [
              { debitAccountCode: '1300', amount: valuationImpact },
              { creditAccountCode: '5010', amount: valuationImpact },
            ],
          });
        } else {
          // Inventory loss/write-off: Debit COGS / Shrinkage (5010), Credit Merchandise Inventory (1300)
          await LedgerService.recordEntry(tx, {
            userId,
            reference: movement.id,
            memo: `Inventory Adjustment Loss: ${product.sku} (${reason})`,
            lines: [
              { debitAccountCode: '5010', amount: valuationImpact },
              { creditAccountCode: '1300', amount: valuationImpact },
            ],
          });
        }
      }

      return { product: updatedProduct, movementId: movement.id };
    });
  }
}
