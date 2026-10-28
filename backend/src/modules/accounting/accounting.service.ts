import { PrismaClient, AccountType, Prisma } from '@prisma/client';

const Decimal = Prisma.Decimal;

export class AccountingService {
  constructor(private prisma: PrismaClient) {}

  /**
   * 1. Chart of Accounts Management
   */
  async getChartOfAccounts() {
    return this.prisma.account.findMany({
      orderBy: { accountCode: 'asc' },
    });
  }

  async createAccount(data: { accountCode: string; name: string; type: AccountType }) {
    const existing = await this.prisma.account.findUnique({
      where: { accountCode: data.accountCode },
    });
    if (existing) {
      throw new Error(`Account code "${data.accountCode}" already exists.`);
    }

    return this.prisma.account.create({
      data: {
        accountCode: data.accountCode,
        name: data.name,
        type: data.type,
        balance: new Decimal(0.0),
      },
    });
  }

  /**
   * 2. Manual Journal Voucher (JV) Creation
   */
  async createJournalVoucher(
    userId: string,
    data: {
      date?: string;
      reference?: string;
      memo: string;
      lines: Array<{ accountCode: string; debit: number; credit: number; memo?: string }>;
    }
  ) {
    return this.prisma.$transaction(async (tx) => {
      let totalDebits = new Decimal(0);
      let totalCredits = new Decimal(0);

      for (const line of data.lines) {
        totalDebits = totalDebits.plus(new Decimal(line.debit));
        totalCredits = totalCredits.plus(new Decimal(line.credit));
      }

      if (!totalDebits.equals(totalCredits)) {
        throw new Error(
          `Out of balance: Total Debits (${totalDebits.toFixed(2)}) must equal Total Credits (${totalCredits.toFixed(2)}).`
        );
      }

      if (totalDebits.equals(0)) {
        throw new Error('Total voucher transaction amount must be greater than zero.');
      }

      const entryDate = data.date ? new Date(data.date) : new Date();
      const datePrefix = entryDate.toISOString().slice(0, 10).replace(/-/g, '');
      const count = await tx.journalEntry.count();
      const entryNumber = `JV-${datePrefix}-${String(count + 1).padStart(4, '0')}`;

      const resolvedLines: any[] = [];

      for (const line of data.lines) {
        const account = await tx.account.findUnique({
          where: { accountCode: line.accountCode },
        });

        if (!account) {
          throw new Error(`Account code "${line.accountCode}" does not exist in Chart of Accounts.`);
        }

        const isDebit = line.debit > 0;
        const lineAmount = isDebit ? new Decimal(line.debit) : new Decimal(line.credit);

        let balanceDelta = new Decimal(0);
        if (account.type === AccountType.ASSET || account.type === AccountType.EXPENSE) {
          balanceDelta = isDebit ? lineAmount : lineAmount.negated();
        } else {
          balanceDelta = isDebit ? lineAmount.negated() : lineAmount;
        }

        await tx.account.update({
          where: { id: account.id },
          data: { balance: { increment: balanceDelta } },
        });

        resolvedLines.push({
          debitAccountId: isDebit ? account.id : null,
          creditAccountId: !isDebit ? account.id : null,
          amount: lineAmount,
        });
      }

      return tx.journalEntry.create({
        data: {
          entryNumber,
          reference: data.reference,
          memo: data.memo,
          userId,
          date: entryDate,
          lines: {
            create: resolvedLines,
          },
        },
        include: {
          lines: {
            include: {
              debitAccount: true,
              creditAccount: true,
            },
          },
          user: {
            select: { id: true, fullName: true, username: true },
          },
        },
      });
    });
  }

  /**
   * 3. General Ledger Inquirer
   */
  async getGeneralLedger(accountCode: string, startDate?: string, endDate?: string) {
    const account = await this.prisma.account.findUnique({
      where: { accountCode },
    });

    if (!account) {
      throw new Error(`Account code "${accountCode}" not found.`);
    }

    const dateFilter: any = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) dateFilter.lte = new Date(endDate);

    const journalLines = await this.prisma.journalLine.findMany({
      where: {
        OR: [{ debitAccountId: account.id }, { creditAccountId: account.id }],
        journalEntry: Object.keys(dateFilter).length > 0 ? { date: dateFilter } : undefined,
      },
      include: {
        journalEntry: {
          include: {
            user: { select: { fullName: true } },
          },
        },
      },
      orderBy: { journalEntry: { date: 'asc' } },
    });

    const isNormalDebit = account.type === AccountType.ASSET || account.type === AccountType.EXPENSE;
    let runningBalance = new Decimal(0);

    const ledgerEntries = journalLines.map((line) => {
      const isDebit = line.debitAccountId === account.id;
      const debitAmount = isDebit ? new Decimal(line.amount) : new Decimal(0);
      const creditAmount = !isDebit ? new Decimal(line.amount) : new Decimal(0);

      if (isNormalDebit) {
        runningBalance = runningBalance.plus(debitAmount).minus(creditAmount);
      } else {
        runningBalance = runningBalance.plus(creditAmount).minus(debitAmount);
      }

      return {
        lineId: line.id,
        entryNumber: line.journalEntry.entryNumber,
        reference: line.journalEntry.reference,
        memo: line.journalEntry.memo,
        date: line.journalEntry.date,
        cashierOrUser: line.journalEntry.user?.fullName,
        debit: debitAmount.toFixed(2),
        credit: creditAmount.toFixed(2),
        runningBalance: runningBalance.toFixed(2),
      };
    });

    return {
      account: {
        id: account.id,
        accountCode: account.accountCode,
        name: account.name,
        type: account.type,
        currentMasterBalance: new Decimal(account.balance).toFixed(2),
      },
      totalTransactions: ledgerEntries.length,
      finalCalculatedBalance: runningBalance.toFixed(2),
      entries: ledgerEntries,
    };
  }

  /**
   * 4. Real-Time Trial Balance Generator
   */
  async getTrialBalance(asOfDate?: string) {
    const accounts = await this.prisma.account.findMany({
      orderBy: { accountCode: 'asc' },
    });

    const dateLimit = asOfDate ? new Date(asOfDate) : undefined;

    let totalDebitSum = new Decimal(0);
    let totalCreditSum = new Decimal(0);

    const rows = await Promise.all(
      accounts.map(async (acc) => {
        const debitSumRes = await this.prisma.journalLine.aggregate({
          where: {
            debitAccountId: acc.id,
            journalEntry: dateLimit ? { date: { lte: dateLimit } } : undefined,
          },
          _sum: { amount: true },
        });

        const creditSumRes = await this.prisma.journalLine.aggregate({
          where: {
            creditAccountId: acc.id,
            journalEntry: dateLimit ? { date: { lte: dateLimit } } : undefined,
          },
          _sum: { amount: true },
        });

        const debits = debitSumRes._sum.amount ? new Decimal(debitSumRes._sum.amount) : new Decimal(0);
        const credits = creditSumRes._sum.amount ? new Decimal(creditSumRes._sum.amount) : new Decimal(0);

        let netDebit = new Decimal(0);
        let netCredit = new Decimal(0);

        if (acc.type === AccountType.ASSET || acc.type === AccountType.EXPENSE) {
          const diff = debits.minus(credits);
          if (diff.greaterThanOrEqualTo(0)) {
            netDebit = diff;
          } else {
            netCredit = diff.abs();
          }
        } else {
          const diff = credits.minus(debits);
          if (diff.greaterThanOrEqualTo(0)) {
            netCredit = diff;
          } else {
            netDebit = diff.abs();
          }
        }

        totalDebitSum = totalDebitSum.plus(netDebit);
        totalCreditSum = totalCreditSum.plus(netCredit);

        return {
          accountCode: acc.accountCode,
          name: acc.name,
          type: acc.type,
          debit: netDebit.toFixed(2),
          credit: netCredit.toFixed(2),
        };
      })
    );

    const isBalanced = totalDebitSum.equals(totalCreditSum);

    return {
      asOfDate: dateLimit ? dateLimit.toISOString() : new Date().toISOString(),
      isBalanced,
      totalDebits: totalDebitSum.toFixed(2),
      totalCredits: totalCreditSum.toFixed(2),
      difference: totalDebitSum.minus(totalCreditSum).toFixed(2),
      accounts: rows.filter((r) => parseFloat(r.debit) > 0 || parseFloat(r.credit) > 0),
    };
  }

  /**
   * 5. Profit & Loss (Income Statement) Generator
   */
  async getProfitAndLoss(startDate?: string, endDate?: string) {
    const dateFilter: any = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) dateFilter.lte = new Date(endDate);

    const accounts = await this.prisma.account.findMany({
      where: {
        type: { in: [AccountType.REVENUE, AccountType.EXPENSE] },
      },
      orderBy: { accountCode: 'asc' },
    });

    let totalRevenue = new Decimal(0);
    let totalCOGS = new Decimal(0);
    let totalOperatingExpenses = new Decimal(0);

    const revenueLines: any[] = [];
    const cogsLines: any[] = [];
    const expenseLines: any[] = [];

    for (const acc of accounts) {
      const debitRes = await this.prisma.journalLine.aggregate({
        where: {
          debitAccountId: acc.id,
          journalEntry: Object.keys(dateFilter).length > 0 ? { date: dateFilter } : undefined,
        },
        _sum: { amount: true },
      });

      const creditRes = await this.prisma.journalLine.aggregate({
        where: {
          creditAccountId: acc.id,
          journalEntry: Object.keys(dateFilter).length > 0 ? { date: dateFilter } : undefined,
        },
        _sum: { amount: true },
      });

      const debits = debitRes._sum.amount ? new Decimal(debitRes._sum.amount) : new Decimal(0);
      const credits = creditRes._sum.amount ? new Decimal(creditRes._sum.amount) : new Decimal(0);

      if (acc.type === AccountType.REVENUE) {
        const netRev = credits.minus(debits);
        totalRevenue = totalRevenue.plus(netRev);
        revenueLines.push({
          accountCode: acc.accountCode,
          name: acc.name,
          amount: netRev.toFixed(2),
        });
      } else if (acc.type === AccountType.EXPENSE) {
        const netExp = debits.minus(credits);
        if (acc.accountCode.startsWith('50') && !acc.accountCode.startsWith('503')) {
          totalCOGS = totalCOGS.plus(netExp);
          cogsLines.push({
            accountCode: acc.accountCode,
            name: acc.name,
            amount: netExp.toFixed(2),
          });
        } else {
          totalOperatingExpenses = totalOperatingExpenses.plus(netExp);
          expenseLines.push({
            accountCode: acc.accountCode,
            name: acc.name,
            amount: netExp.toFixed(2),
          });
        }
      }
    }

    const grossProfit = totalRevenue.minus(totalCOGS);
    const netIncome = grossProfit.minus(totalOperatingExpenses);

    return {
      period: {
        startDate: startDate || 'inception',
        endDate: endDate || new Date().toISOString(),
      },
      operatingRevenue: {
        lines: revenueLines,
        total: totalRevenue.toFixed(2),
      },
      costOfGoodsSold: {
        lines: cogsLines,
        total: totalCOGS.toFixed(2),
      },
      grossProfit: grossProfit.toFixed(2),
      operatingExpenses: {
        lines: expenseLines,
        total: totalOperatingExpenses.toFixed(2),
      },
      netOperatingIncome: netIncome.toFixed(2),
    };
  }

  /**
   * 6. Balance Sheet Statement
   */
  async getBalanceSheet(asOfDate?: string) {
    const pnl = await this.getProfitAndLoss(undefined, asOfDate);
    const retainedEarningsCurrentPeriod = new Decimal(pnl.netOperatingIncome);

    const dateLimit = asOfDate ? new Date(asOfDate) : undefined;

    const accounts = await this.prisma.account.findMany({
      where: {
        type: { in: [AccountType.ASSET, AccountType.LIABILITY, AccountType.EQUITY] },
      },
      orderBy: { accountCode: 'asc' },
    });

    let totalAssets = new Decimal(0);
    let totalLiabilities = new Decimal(0);
    let totalEquity = new Decimal(0);

    const assetLines: any[] = [];
    const liabilityLines: any[] = [];
    const equityLines: any[] = [];

    for (const acc of accounts) {
      const debitRes = await this.prisma.journalLine.aggregate({
        where: {
          debitAccountId: acc.id,
          journalEntry: dateLimit ? { date: { lte: dateLimit } } : undefined,
        },
        _sum: { amount: true },
      });

      const creditRes = await this.prisma.journalLine.aggregate({
        where: {
          creditAccountId: acc.id,
          journalEntry: dateLimit ? { date: { lte: dateLimit } } : undefined,
        },
        _sum: { amount: true },
      });

      const debits = debitRes._sum.amount ? new Decimal(debitRes._sum.amount) : new Decimal(0);
      const credits = creditRes._sum.amount ? new Decimal(creditRes._sum.amount) : new Decimal(0);

      if (acc.type === AccountType.ASSET) {
        const netAsset = debits.minus(credits);
        totalAssets = totalAssets.plus(netAsset);
        assetLines.push({
          accountCode: acc.accountCode,
          name: acc.name,
          balance: netAsset.toFixed(2),
        });
      } else if (acc.type === AccountType.LIABILITY) {
        const netLiab = credits.minus(debits);
        totalLiabilities = totalLiabilities.plus(netLiab);
        liabilityLines.push({
          accountCode: acc.accountCode,
          name: acc.name,
          balance: netLiab.toFixed(2),
        });
      } else if (acc.type === AccountType.EQUITY) {
        const netEq = credits.minus(debits);
        totalEquity = totalEquity.plus(netEq);
        equityLines.push({
          accountCode: acc.accountCode,
          name: acc.name,
          balance: netEq.toFixed(2),
        });
      }
    }

    const totalCombinedEquity = totalEquity.plus(retainedEarningsCurrentPeriod);
    const totalLiabilitiesAndEquity = totalLiabilities.plus(totalCombinedEquity);

    const difference = totalAssets.minus(totalLiabilitiesAndEquity);
    const isBalanced = difference.abs().lessThan(0.01);

    return {
      asOfDate: dateLimit ? dateLimit.toISOString() : new Date().toISOString(),
      isBalanced,
      difference: difference.toFixed(2),
      assets: {
        lines: assetLines,
        total: totalAssets.toFixed(2),
      },
      liabilities: {
        lines: liabilityLines,
        total: totalLiabilities.toFixed(2),
      },
      equity: {
        lines: equityLines,
        retainedEarningsCurrentPeriod: retainedEarningsCurrentPeriod.toFixed(2),
        total: totalCombinedEquity.toFixed(2),
      },
      totalLiabilitiesAndEquity: totalLiabilitiesAndEquity.toFixed(2),
    };
  }
}
