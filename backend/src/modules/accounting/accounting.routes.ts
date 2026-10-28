import { FastifyInstance } from 'fastify';
import { Role } from '@prisma/client';
import { prisma } from '../../core/database/prisma.js';
import { AccountingService } from './accounting.service.js';
import { authorizeRoles, TokenPayload } from '../../core/security/auth.js';
import {
  CreateAccountSchema,
  CreateJournalVoucherSchema,
} from './accounting.schema.js';

export async function accountingRoutes(app: FastifyInstance) {
  const accountingService = new AccountingService(prisma);

  // 1. Chart of Accounts: List
  app.get('/accounts', {
    preHandler: [authorizeRoles([Role.OWNER, Role.ADMIN, Role.ACCOUNTANT])],
  }, async () => {
    return accountingService.getChartOfAccounts();
  });

  // 2. Chart of Accounts: Create Account
  app.post('/accounts', {
    preHandler: [authorizeRoles([Role.OWNER, Role.ADMIN, Role.ACCOUNTANT])],
  }, async (request, reply) => {
    const data = CreateAccountSchema.parse(request.body);
    const account = await accountingService.createAccount(data);
    return reply.status(201).send({ success: true, account });
  });

  // 3. Manual Journal Voucher Entry
  app.post('/journal-vouchers', {
    preHandler: [authorizeRoles([Role.OWNER, Role.ADMIN, Role.ACCOUNTANT])],
  }, async (request, reply) => {
    const user = request.user as TokenPayload;
    const data = CreateJournalVoucherSchema.parse(request.body);
    const voucher = await accountingService.createJournalVoucher(user.userId, data);
    return reply.status(201).send({ success: true, voucher });
  });

  // 4. General Ledger Inquirer
  app.get('/ledger/:accountCode', {
    preHandler: [authorizeRoles([Role.OWNER, Role.ADMIN, Role.ACCOUNTANT])],
  }, async (request) => {
    const { accountCode } = request.params as { accountCode: string };
    const query = request.query as any;
    return accountingService.getGeneralLedger(accountCode, query.startDate, query.endDate);
  });

  // 5. Trial Balance Report
  app.get('/reports/trial-balance', {
    preHandler: [authorizeRoles([Role.OWNER, Role.ADMIN, Role.ACCOUNTANT])],
  }, async (request) => {
    const query = request.query as any;
    return accountingService.getTrialBalance(query.asOfDate);
  });

  // 6. Profit and Loss (Income Statement) Report
  app.get('/reports/profit-and-loss', {
    preHandler: [authorizeRoles([Role.OWNER, Role.ADMIN, Role.ACCOUNTANT])],
  }, async (request) => {
    const query = request.query as any;
    return accountingService.getProfitAndLoss(query.startDate, query.endDate);
  });

  // 7. Balance Sheet Report
  app.get('/reports/balance-sheet', {
    preHandler: [authorizeRoles([Role.OWNER, Role.ADMIN, Role.ACCOUNTANT])],
  }, async (request) => {
    const query = request.query as any;
    return accountingService.getBalanceSheet(query.asOfDate);
  });
}
