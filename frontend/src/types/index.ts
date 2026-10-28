export interface Product {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  category: string;
  brand: string | null;
  model: string | null;
  costPrice: string | number;
  retailPrice: string | number;
  stockQuantity: number;
  isSparePart: boolean;
  serials?: Array<{
    id: string;
    serialNo: string;
    macAddress?: string | null;
  }>;
}

export interface CartItem {
  product: Product;
  quantity: number;
  selectedSerials: string[];
  unitPrice: number;
}

export interface Customer {
  id: string;
  fullName: string;
  phone: string;
  email?: string | null;
  address?: string | null;
  creditLimit: string | number;
  balanceDue: string | number;
}

export interface RepairJob {
  id: string;
  jobNumber: string;
  deviceType: string;
  brand: string;
  model: string;
  serialNumber?: string | null;
  reportedFault: string;
  status: string;
  estimatedCost?: string | number | null;
  finalLaborCost: string | number;
  finalPartsCost: string | number;
  totalCost: string | number;
  receivedDate: string;
  customer: Customer;
}

export interface TrialBalanceReport {
  asOfDate: string;
  isBalanced: boolean;
  totalDebits: string;
  totalCredits: string;
  difference: string;
  accounts: Array<{
    accountCode: string;
    name: string;
    type: string;
    debit: string;
    credit: string;
  }>;
}

export interface ProfitAndLossReport {
  period: { startDate: string; endDate: string };
  operatingRevenue: { total: string; lines: Array<{ accountCode: string; name: string; amount: string }> };
  costOfGoodsSold: { total: string; lines: Array<{ accountCode: string; name: string; amount: string }> };
  grossProfit: string;
  operatingExpenses: { total: string; lines: Array<{ accountCode: string; name: string; amount: string }> };
  netOperatingIncome: string;
}

export interface BalanceSheetReport {
  asOfDate: string;
  isBalanced: boolean;
  difference: string;
  assets: { total: string; lines: Array<{ accountCode: string; name: string; balance: string }> };
  liabilities: { total: string; lines: Array<{ accountCode: string; name: string; balance: string }> };
  equity: { total: string; retainedEarningsCurrentPeriod: string; lines: Array<{ accountCode: string; name: string; balance: string }> };
  totalLiabilitiesAndEquity: string;
}
