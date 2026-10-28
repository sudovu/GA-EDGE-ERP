import { FastifyInstance } from 'fastify';
import { Role } from '@prisma/client';
import { prisma } from '../../core/database/prisma.js';
import { RepairService } from './repair.service.js';
import { authorizeRoles, TokenPayload } from '../../core/security/auth.js';
import {
  IntakeJobSchema,
  UpdateDiagnosisSchema,
  CustomerApprovalSchema,
  AttachPartSchema,
  TransitionStatusSchema,
} from './repair.schema.js';

export async function repairRoutes(app: FastifyInstance) {
  const repairService = new RepairService(prisma);

  // List all repair jobs
  app.get('/jobs', {
    preHandler: [authorizeRoles([Role.OWNER, Role.ADMIN, Role.TECHNICIAN, Role.CASHIER])],
  }, async (request) => {
    const query = request.query as any;
    return repairService.listJobs({
      status: query.status,
      search: query.search,
      technicianId: query.technicianId,
    });
  });

  // Get job details with complete status timeline
  app.get('/jobs/:id', {
    preHandler: [authorizeRoles([Role.OWNER, Role.ADMIN, Role.TECHNICIAN, Role.CASHIER])],
  }, async (request) => {
    const { id } = request.params as { id: string };
    return repairService.getJobById(id);
  });

  // Step 1: Intake & Job Card creation
  app.post('/jobs', {
    preHandler: [authorizeRoles([Role.OWNER, Role.ADMIN, Role.CASHIER, Role.TECHNICIAN])],
  }, async (request, reply) => {
    const user = request.user as TokenPayload;
    const data = IntakeJobSchema.parse(request.body);
    const job = await repairService.intakeJob(user.userId, data);
    return reply.status(201).send({ success: true, job });
  });

  // Step 2: Technician diagnosis and estimation
  app.post('/jobs/:id/diagnosis', {
    preHandler: [authorizeRoles([Role.OWNER, Role.ADMIN, Role.TECHNICIAN])],
  }, async (request) => {
    const user = request.user as TokenPayload;
    const { id } = request.params as { id: string };
    const data = UpdateDiagnosisSchema.parse(request.body);
    return repairService.updateDiagnosis(user.userId, id, data);
  });

  // Step 3: Record customer approval or rejection
  app.post('/jobs/:id/approval', {
    preHandler: [authorizeRoles([Role.OWNER, Role.ADMIN, Role.CASHIER, Role.TECHNICIAN])],
  }, async (request) => {
    const user = request.user as TokenPayload;
    const { id } = request.params as { id: string };
    const data = CustomerApprovalSchema.parse(request.body);
    return repairService.recordCustomerApproval(user.userId, id, data);
  });

  // Step 4: Attach spare parts (atomic stock decrement & general ledger voucher)
  app.post('/jobs/:id/parts', {
    preHandler: [authorizeRoles([Role.OWNER, Role.ADMIN, Role.TECHNICIAN])],
  }, async (request, reply) => {
    const user = request.user as TokenPayload;
    const { id } = request.params as { id: string };
    const data = AttachPartSchema.parse(request.body);
    const result = await repairService.attachSparePart(user.userId, id, data);
    return reply.status(201).send({ success: true, ...result });
  });

  // Step 5: State Machine status transition (with QC and Delivery validation)
  app.post('/jobs/:id/transition', {
    preHandler: [authorizeRoles([Role.OWNER, Role.ADMIN, Role.TECHNICIAN, Role.CASHIER])],
  }, async (request) => {
    const user = request.user as TokenPayload;
    const { id } = request.params as { id: string };
    const data = TransitionStatusSchema.parse(request.body);
    return repairService.transitionStatus(user.userId, id, data);
  });

  // Step 6: Generate printable job receipt (HTML or JSON)
  app.get('/jobs/:id/receipt', {
    preHandler: [authorizeRoles([Role.OWNER, Role.ADMIN, Role.CASHIER, Role.TECHNICIAN])],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = request.query as any;
    const format = query.format === 'json' ? 'json' : 'html';

    const result = await repairService.getJobReceipt(id, format);

    if (format === 'html') {
      reply.header('Content-Type', 'text/html; charset=utf-8');
      return reply.send(result);
    }
    return result;
  });
}
