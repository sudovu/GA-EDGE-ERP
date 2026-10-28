import { PrismaClient, Role, AccountType } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding root system data...');

  // 1. Root Superadmin
  const passwordHash = await argon2.hash('NexusAdmin@2026!Secure');
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      email: 'admin@nexusedge.internal',
      fullName: 'System Administrator',
      passwordHash,
      role: Role.OWNER,
      isActive: true,
    },
  });

  console.log(`Created administrator: ${admin.username} (ID: ${admin.id})`);

  // 2. Chart of Accounts (Standard Double-Entry Setup)
  const baseAccounts = [
    { accountCode: '1010', name: 'Cash on Hand', type: AccountType.ASSET },
    { accountCode: '1020', name: 'Operating Bank Account', type: AccountType.ASSET },
    { accountCode: '1200', name: 'Accounts Receivable', type: AccountType.ASSET },
    { accountCode: '1300', name: 'Merchandise Inventory', type: AccountType.ASSET },
    { accountCode: '2010', name: 'Accounts Payable', type: AccountType.LIABILITY },
    { accountCode: '2020', name: 'VAT/Tax Payable', type: AccountType.LIABILITY },
    { accountCode: '3010', name: 'Owner Equity', type: AccountType.EQUITY },
    { accountCode: '4010', name: 'Retail Hardware Sales', type: AccountType.REVENUE },
    { accountCode: '4020', name: 'Repair & Service Labor Revenue', type: AccountType.REVENUE },
    { accountCode: '5010', name: 'Cost of Goods Sold (COGS)', type: AccountType.EXPENSE },
    { accountCode: '5020', name: 'Workshop Consumables & Parts Cost', type: AccountType.EXPENSE },
  ];

  for (const acc of baseAccounts) {
    await prisma.account.upsert({
      where: { accountCode: acc.accountCode },
      update: {},
      create: acc,
    });
  }

  console.log('Successfully seeded Chart of Accounts.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
