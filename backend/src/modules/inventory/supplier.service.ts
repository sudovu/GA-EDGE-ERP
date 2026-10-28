import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

export class SupplierService {
  constructor(private prisma: PrismaClient) {}

  async createSupplier(data: any) {
    const existing = await this.prisma.supplier.findUnique({ where: { phone: data.phone } });
    if (existing) {
      throw new Error(`Supplier with phone "${data.phone}" already exists.`);
    }

    return this.prisma.supplier.create({ data });
  }

  async getSuppliers() {
    return this.prisma.supplier.findMany({
      include: {
        _count: { select: { purchaseOrders: true } },
      },
      orderBy: { companyName: 'asc' },
    });
  }

  async createPurchaseOrder(data: {
    supplierId: string;
    notes?: string;
    expectedDelivery?: string;
    items: Array<{ productId: string; orderedQuantity: number; unitCost: number }>;
  }) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id: data.supplierId } });
    if (!supplier) throw new Error('Supplier does not exist.');

    const orderNumber = `PO-${Date.now().toString().slice(-6)}`;
    let totalCost = new Decimal(0);

    const itemsData = data.items.map((item) => {
      const lineCost = new Decimal(item.unitCost).times(item.orderedQuantity);
      totalCost = totalCost.plus(lineCost);
      return {
        productId: item.productId,
        orderedQuantity: item.orderedQuantity,
        unitCost: new Decimal(item.unitCost),
        totalCost: lineCost,
      };
    });

    return this.prisma.purchaseOrder.create({
      data: {
        orderNumber,
        supplierId: data.supplierId,
        status: 'ORDERED',
        notes: data.notes,
        totalCost,
        items: {
          create: itemsData,
        },
      },
      include: {
        supplier: true,
        items: { include: { product: true } },
      },
    });
  }

  async getPurchaseOrders(status?: string) {
    const where: any = {};
    if (status) where.status = status;

    return this.prisma.purchaseOrder.findMany({
      where,
      include: {
        supplier: true,
        items: { include: { product: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
