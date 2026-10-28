import { z } from 'zod';
import { AccountType } from '@prisma/client';

export const CreateAccountSchema = z.object({
  accountCode: z.string().trim().min(3).max(10).regex(/^[0-9]+$/, 'Account code must be numeric'),
  name: z.string().trim().min(3).max(100),
  type: z.nativeEnum(AccountType),
});

export const JournalVoucherLineSchema = z.object({
  accountCode: z.string().trim().min(3).max(10),
  debit: z.number().nonnegative().default(0.0),
  credit: z.number().nonnegative().default(0.0),
  memo: z.string().trim().max(255).optional(),
}).refine(
  (data) => (data.debit > 0 && data.credit === 0) || (data.credit > 0 && data.debit === 0),
  { message: 'A line must have either a positive debit OR credit, not both or neither.' }
);

export const CreateJournalVoucherSchema = z.object({
  date: z.string().datetime().optional(),
  reference: z.string().trim().max(100).optional(),
  memo: z.string().trim().min(3).max(500),
  lines: z.array(JournalVoucherLineSchema).min(2, 'A journal voucher must have at least 2 lines'),
});
