import { FastifyInstance } from 'fastify';
import { Role } from '@prisma/client';
import { prisma } from '../../core/database/prisma.js';
import { POSService } from './pos.service.js';
import { authorizeRoles, TokenPayload } from '../../core/security/auth.js';
import { POSCheckoutSchema } from './pos.schema.js';

export async function posRoutes(app: FastifyInstance) {
  const posService = new POSService(prisma);

  // 1. Instant Barcode / SKU / Serial Scan Lookup
  app.get('/scan/:code', {
    preHandler: [authorizeRoles([Role.OWNER, Role.ADMIN, Role.CASHIER])],
  }, async (request) => {
    const { code } = request.params as { code: string };
    return posService.scanLookup(code);
  });

  // 2. Process Atomic POS Checkout
  app.post('/checkout', {
    preHandler: [authorizeRoles([Role.OWNER, Role.ADMIN, Role.CASHIER])],
  }, async (request, reply) => {
    const user = request.user as TokenPayload;
    const data = POSCheckoutSchema.parse(request.body);
    const invoice = await posService.checkout(user.userId, data);
    return reply.status(201).send({ success: true, invoice });
  });

  // 3. Retrieve Thermal Receipt (Binary ESC/POS & Monospace Plaintext)
  app.get('/invoices/:id/receipt', {
    preHandler: [authorizeRoles([Role.OWNER, Role.ADMIN, Role.CASHIER, Role.ACCOUNTANT])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = request.query as any;
    const width = query.width === '58' ? 58 : 80;

    const receipt = await posService.getThermalReceipt(id, width);

    // If client requested raw binary stream download
    if (query.format === 'binary') {
      const buffer = Buffer.from(receipt.base64Buffer, 'base64');
      reply.header('Content-Type', 'application/octet-stream');
      reply.header('Content-Disposition', `attachment; filename="${receipt.invoiceNo}.bin"`);
      return reply.send(buffer);
    }

    return receipt;
  });

  // 4. Customer Account & Outstanding Receivables Statement
  app.get('/customers/:id/statement', {
    preHandler: [authorizeRoles([Role.OWNER, Role.ADMIN, Role.CASHIER, Role.ACCOUNTANT])],
  }, async (request) => {
    const { id } = request.params as { id: string };
    return posService.getCustomerAccountStatement(id);
  });
}
