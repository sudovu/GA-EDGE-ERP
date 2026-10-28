import { Prisma, PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

interface JournalLineInput {
  debitAccountCode?: string;
  creditAccountCode?: string;
  amount: number | Decimal;
}

export class LedgerService {
  /**
   * Executes a balanced double-entry transaction.
   * Guarantees: Total Debits === Total Credits.
   */
  static async recordEntry(
    tx: Prisma.TransactionClient,
    params: {
      userId: string;
      reference?: string;
      memo: string;
      lines: JournalLineInput[];
    }
  ) {
    const entryNumber = `JE-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    let totalDebit = new Decimal(0);
    let totalCredit = new Decimal(0);

    const resolvedLines = [];

    for (const line of params.lines) {
      const lineAmount = new Decimal(line.amount);
      if (lineAmount.lessThanOrEqualTo(0)) {
        throw new Error('Journal line amount must be greater than zero.');
      }

      let debitAccountId: string | undefined;
      let creditAccountId: string | undefined;

      if (line.debitAccountCode) {
        const acc = await tx.account.findUnique({ where: { accountCode: line.debitAccountCode } });
        if (!acc) throw new Error(`Account code ${line.debitAccountCode} not found.`);
        debitAccountId = acc.id;
        totalDebit = totalDebit.plus(lineAmount);

        // Update Account Balance
        await tx.account.update({
          where: { id: acc.id },
          data: {
            balance: acc.type === 'ASSET' || acc.type === 'EXPENSE' 
              ? { increment: lineAmount } 
              : { decrement: lineAmount },
          },
        });
      }

      if (line.creditAccountCode) {
        const acc = await tx.account.findUnique({ where: { accountCode: line.creditAccountCode } });
        if (!acc) throw new Error(`Account code ${line.creditAccountCode} not found.`);
        creditAccountId = acc.id;
        totalCredit = totalCredit.plus(lineAmount);

        // Update Account Balance
        await tx.account.update({
          where: { id: acc.id },
          data: {
            balance: acc.type === 'LIABILITY' || acc.type === 'EQUITY' || acc.type === 'REVENUE'
              ? { increment: lineAmount }
              : { decrement: lineAmount },
          },
        });
      }

      resolvedLines.push({
        debitAccountId,
        creditAccountId,
        amount: lineAmount,
      });
    }

    if (!totalDebit.equals(totalCredit)) {
      throw new Error(`Double-entry balance violation: Debits (${totalDebit}) != Credits (${totalCredit})`);
    }

    return tx.journalEntry.create({
      data: {
        entryNumber,
        reference: params.reference,
        memo: params.memo,
        userId: params.userId,
        lines: {
          create: resolvedLines,
        },
      },
    });
  }
}
