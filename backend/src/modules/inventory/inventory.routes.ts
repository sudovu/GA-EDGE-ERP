import { FastifyInstance } from 'fastify';
import { Role } from '@prisma/client';
import { prisma } from '../../core/database/prisma.js';
import { InventoryService } from './inventory.service.js';
import { SupplierService } from './supplier.service.js';
import { ReceivingService } from './receiving.service.js';
import { authorizeRoles, TokenPayload } from '../../core/security/auth.js';
import {
  CreateProductSchema,
  UpdateProductSchema,
  CreateSupplierSchema,
  CreatePurchaseOrderSchema,
  ReceiveStockSchema,
  StockAdjustmentSchema,
} from './inventory.schema.js';

export async function inventoryRoutes(app: FastifyInstance) {
  const inventoryService = new InventoryService(prisma);
  const supplierService = new SupplierService(prisma);
  const receivingService = new ReceivingService(prisma);

  // ----------------- PRODUCT ENDPOINTS -----------------
  app.get('/products', {
    preHandler: [authorizeRoles([Role.OWNER, Role.ADMIN, Role.INVENTORY_MANAGER, Role.CASHIER, Role.TECHNICIAN])],
  }, async (request) => {
    const query = request.query as any;
    return inventoryService.getProducts({
      category: query.category,
      isSparePart: query.isSparePart ? query.isSparePart === 'true' : undefined,
      search: query.search,
    });
  });

  app.post('/products', {
    preHandler: [authorizeRoles([Role.OWNER, Role.ADMIN, Role.INVENTORY_MANAGER])],
  }, async (request, reply) => {
    const data = CreateProductSchema.parse(request.body);
    const product = await inventoryService.createProduct(data);
    return reply.status(201).send({ success: true, product });
  });

  app.patch('/products/:id', {
    preHandler: [authorizeRoles([Role.OWNER, Role.ADMIN, Role.INVENTORY_MANAGER])],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const data = UpdateProductSchema.parse(request.body);
    return inventoryService.updateProduct(id, data);
  });

  app.get('/products/alerts/low-stock', {
    preHandler: [authorizeRoles([Role.OWNER, Role.ADMIN, Role.INVENTORY_MANAGER])],
  }, async () => {
    return inventoryService.getLowStockAlerts();
  });

  app.post('/products/adjust', {
    preHandler: [authorizeRoles([Role.OWNER, Role.ADMIN, Role.INVENTORY_MANAGER])],
  }, async (request) => {
    const user = request.user as TokenPayload;
    const data = StockAdjustmentSchema.parse(request.body);
    return inventoryService.adjustStock(user.userId, data);
  });

  // ----------------- SUPPLIER ENDPOINTS -----------------
  app.get('/suppliers', {
    preHandler: [authorizeRoles([Role.OWNER, Role.ADMIN, Role.INVENTORY_MANAGER])],
  }, async () => {
    return supplierService.getSuppliers();
  });

  app.post('/suppliers', {
    preHandler: [authorizeRoles([Role.OWNER, Role.ADMIN, Role.INVENTORY_MANAGER])],
  }, async (request, reply) => {
    const data = CreateSupplierSchema.parse(request.body);
    const supplier = await supplierService.createSupplier(data);
    return reply.status(201).send({ success: true, supplier });
  });

  // ------------- PURCHASE ORDER ENDPOINTS -------------
  app.get('/purchase-orders', {
    preHandler: [authorizeRoles([Role.OWNER, Role.ADMIN, Role.INVENTORY_MANAGER])],
  }, async (request) => {
    const query = request.query as any;
    return supplierService.getPurchaseOrders(query.status);
  });

  app.post('/purchase-orders', {
    preHandler: [authorizeRoles([Role.OWNER, Role.ADMIN, Role.INVENTORY_MANAGER])],
  }, async (request, reply) => {
    const data = CreatePurchaseOrderSchema.parse(request.body);
    const po = await supplierService.createPurchaseOrder(data);
    return reply.status(201).send({ success: true, po });
  });

  // -------------- STOCK RECEIVING PIPELINE --------------
  app.post('/purchase-orders/receive', {
    preHandler: [authorizeRoles([Role.OWNER, Role.ADMIN, Role.INVENTORY_MANAGER])],
  }, async (request) => {
    const user = request.user as TokenPayload;
    const data = ReceiveStockSchema.parse(request.body);
    return receivingService.receivePOItem(user.userId, data);
  });
}
