import React, { useState, useEffect } from 'react';
import { ApiClient } from '../api/client';
import { TrialBalanceReport, ProfitAndLossReport, BalanceSheetReport } from '../types';
import { BarChart3, Scale, FileText, CheckCircle2, AlertTriangle, Plus } from 'lucide-react';

export const AccountingReports: React.FC = () => {
  const [reportType, setReportType] = useState<'trial' | 'pnl' | 'balanceSheet'>('trial');
  const [trialData, setTrialData] = useState<TrialBalanceReport | null>(null);
  const [pnlData, setPnlData] = useState<ProfitAndLossReport | null>(null);
  const [bsData, setBsData] = useState<BalanceSheetReport | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Manual Journal Voucher State
  const [isVoucherModal, setIsVoucherModal] = useState(false);
  const [memo, setMemo] = useState('');
  const [debitAccount, setDebitAccount] = useState('5030');
  const [creditAccount, setCreditAccount] = useState('1010');
  const [voucherAmount, setVoucherAmount] = useState<number>(0);

  useEffect(() => {
    loadSelectedReport();
  }, [reportType]);

  const loadSelectedReport = async () => {
    setErrorMsg(null);
    try {
      if (reportType === 'trial') {
        const res = await ApiClient.request<TrialBalanceReport>('/accounting/reports/trial-balance');
        setTrialData(res);
      } else if (reportType === 'pnl') {
        const res = await ApiClient.request<ProfitAndLossReport>('/accounting/reports/profit-and-loss');
        setPnlData(res);
      } else if (reportType === 'balanceSheet') {
        const res = await ApiClient.request<BalanceSheetReport>('/accounting/reports/balance-sheet');
        setBsData(res);
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  const handlePostVoucher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (voucherAmount <= 0) {
      setErrorMsg('Voucher amount must be positive.');
      return;
    }

    try {
      const payload = {
        memo: memo.trim(),
        lines: [
          { accountCode: debitAccount, debit: voucherAmount, credit: 0 },
          { accountCode: creditAccount, debit: 0, credit: voucherAmount },
        ],
      };

      const res = await ApiClient.request<any>('/accounting/journal-vouchers', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      setSuccessMsg(`Journal Voucher ${res.voucher.entryNumber} posted successfully!`);
      setIsVoucherModal(false);
      setMemo('');
      setVoucherAmount(0);
      loadSelectedReport();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to post voucher');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {errorMsg && (
        <div className="bg-rose-500/10 border border-rose-500/30 text-rose-400 p-4 rounded-xl flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-xs uppercase font-bold px-2 py-1">Dismiss</button>
        </div>
      )}

      {successMsg && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 p-4 rounded-xl flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-xs uppercase font-bold px-2 py-1">Dismiss</button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex space-x-2 bg-slate-900 border border-slate-800 p-1.5 rounded-2xl">
          <button
            onClick={() => setReportType('trial')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 ${
              reportType === 'trial' ? 'bg-sky-500 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Scale className="w-4 h-4" />
            <span>Trial Balance</span>
          </button>
          <button
            onClick={() => setReportType('pnl')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 ${
              reportType === 'pnl' ? 'bg-sky-500 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Profit & Loss</span>
          </button>
          <button
            onClick={() => setReportType('balanceSheet')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-2 ${
              reportType === 'balanceSheet' ? 'bg-sky-500 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Balance Sheet</span>
          </button>
        </div>

        <button
          onClick={() => setIsVoucherModal(true)}
          className="bg-sky-500 hover:bg-sky-600 text-white font-bold text-xs px-5 py-2.5 rounded-xl transition shadow-lg shadow-sky-500/20 flex items-center space-x-2 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Post Manual Voucher (JV)</span>
        </button>
      </div>

      {/* Trial Balance View */}
      {reportType === 'trial' && trialData && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-base font-bold text-white">General Ledger Trial Balance</h2>
              <p className="text-xs text-slate-400 font-mono">As of {new Date(trialData.asOfDate).toLocaleString()}</p>
            </div>
            <span className={`text-xs px-3 py-1 rounded-full font-bold uppercase ${trialData.isBalanced ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400'}`}>
              {trialData.isBalanced ? '✓ Balanced Ledger' : 'Out of Balance'}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 uppercase font-semibold">
                <tr>
                  <th className="p-3">Code</th>
                  <th className="p-3">Account Title</th>
                  <th className="p-3">Type</th>
                  <th className="p-3 text-right">Debit (NPR)</th>
                  <th className="p-3 text-right">Credit (NPR)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {trialData.accounts.map((acc) => (
                  <tr key={acc.accountCode} className="hover:bg-slate-800/40">
                    <td className="p-3 text-sky-400 font-bold">{acc.accountCode}</td>
                    <td className="p-3 font-sans font-medium text-white">{acc.name}</td>
                    <td className="p-3 text-slate-400">{acc.type}</td>
                    <td className="p-3 text-right text-slate-200">{Number(acc.debit).toLocaleString()}</td>
                    <td className="p-3 text-right text-slate-200">{Number(acc.credit).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-slate-700 bg-slate-950 font-bold font-mono text-sm">
                <tr>
                  <td colSpan={3} className="p-3 text-white uppercase font-sans">Total Balanced Sums</td>
                  <td className="p-3 text-right text-emerald-400">NPR {Number(trialData.totalDebits).toLocaleString()}</td>
                  <td className="p-3 text-right text-emerald-400">NPR {Number(trialData.totalCredits).toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Profit & Loss View */}
      {reportType === 'pnl' && pnlData && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
          <div className="border-b border-slate-800 pb-4">
            <h2 className="text-base font-bold text-white">Profit & Loss (Income Statement)</h2>
            <p className="text-xs text-slate-400 font-mono">Period: Operating Inception to Present</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-sky-400">Operating Revenue</h3>
              <div className="space-y-2">
                {pnlData.operatingRevenue.lines.map((l) => (
                  <div key={l.accountCode} className="flex justify-between text-xs p-2.5 bg-slate-950 rounded-xl">
                    <span className="text-slate-300">{l.name}</span>
                    <span className="font-mono text-white">NPR {Number(l.amount).toLocaleString()}</span>
                  </div>
                ))}
                <div className="flex justify-between text-xs font-bold p-3 bg-slate-950 border-t border-slate-800 text-sky-300">
                  <span>Total Revenue</span>
                  <span className="font-mono">NPR {Number(pnlData.operatingRevenue.total).toLocaleString()}</span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-rose-400">Cost of Goods Sold (COGS)</h3>
              <div className="space-y-2">
                {pnlData.costOfGoodsSold.lines.map((l) => (
                  <div key={l.accountCode} className="flex justify-between text-xs p-2.5 bg-slate-950 rounded-xl">
                    <span className="text-slate-300">{l.name}</span>
                    <span className="font-mono text-white">NPR {Number(l.amount).toLocaleString()}</span>
                  </div>
                ))}
                <div className="flex justify-between text-xs font-bold p-3 bg-slate-950 border-t border-slate-800 text-rose-300">
                  <span>Total Direct Costs</span>
                  <span className="font-mono">NPR {Number(pnlData.costOfGoodsSold.total).toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between text-sm">
            <span className="font-bold text-white">Gross Profit Margin</span>
            <span className="font-mono font-black text-emerald-400 text-base">NPR {Number(pnlData.grossProfit).toLocaleString()}</span>
          </div>

          <div className="p-5 bg-gradient-to-r from-sky-950/40 to-slate-900 border border-sky-500/20 rounded-2xl flex items-center justify-between">
            <div>
              <span className="text-xs uppercase font-bold text-sky-400">Net Operating Income</span>
              <p className="text-xs text-slate-400">Retained for equity accumulation</p>
            </div>
            <span className="text-xl font-black font-mono text-emerald-400">NPR {Number(pnlData.netOperatingIncome).toLocaleString()}</span>
          </div>
        </div>
      )}

      {/* Balance Sheet View */}
      {reportType === 'balanceSheet' && bsData && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-base font-bold text-white">Statement of Financial Position (Balance Sheet)</h2>
              <p className="text-xs text-slate-400 font-mono">As of {new Date(bsData.asOfDate).toLocaleString()}</p>
            </div>
            <span className="text-xs px-3 py-1 rounded-full font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Assets = Liabilities + Equity
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400">Assets</h3>
              <div className="space-y-2">
                {bsData.assets.lines.map((l) => (
                  <div key={l.accountCode} className="flex justify-between text-xs p-2.5 bg-slate-950 rounded-xl">
                    <span className="text-slate-300">{l.name}</span>
                    <span className="font-mono text-white">NPR {Number(l.balance).toLocaleString()}</span>
                  </div>
                ))}
                <div className="flex justify-between text-sm font-bold p-3 bg-slate-950 border-t border-slate-800 text-emerald-400">
                  <span>Total Assets</span>
                  <span className="font-mono">NPR {Number(bsData.assets.total).toLocaleString()}</span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400">Liabilities & Equity</h3>
              <div className="space-y-2">
                {bsData.liabilities.lines.map((l) => (
                  <div key={l.accountCode} className="flex justify-between text-xs p-2.5 bg-slate-950 rounded-xl">
                    <span className="text-slate-300">{l.name}</span>
                    <span className="font-mono text-white">NPR {Number(l.balance).toLocaleString()}</span>
                  </div>
                ))}
                <div className="flex justify-between text-xs p-2.5 bg-slate-950 rounded-xl">
                  <span className="text-slate-300">Retained Earnings (Current Period)</span>
                  <span className="font-mono text-white">NPR {Number(bsData.equity.retainedEarningsCurrentPeriod).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm font-bold p-3 bg-slate-950 border-t border-slate-800 text-amber-400">
                  <span>Total Liabilities & Equity</span>
                  <span className="font-mono">NPR {Number(bsData.totalLiabilitiesAndEquity).toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manual Journal Voucher Modal */}
      {isVoucherModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-white">Post Manual Journal Voucher (JV)</h3>
            <form onSubmit={handlePostVoucher} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">Voucher Memo / Purpose *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Fiber Internet Monthly Subscription"
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1">Debit Account Code</label>
                  <input
                    type="text"
                    required
                    value={debitAccount}
                    onChange={(e) => setDebitAccount(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1">Credit Account Code</label>
                  <input
                    type="text"
                    required
                    value={creditAccount}
                    onChange={(e) => setCreditAccount(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">Amount (NPR) *</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={voucherAmount || ''}
                  onChange={(e) => setVoucherAmount(Number(e.target.value))}
                  placeholder="0.00"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsVoucherModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-sky-500 hover:bg-sky-600 text-white font-bold text-xs px-5 py-2.5 rounded-xl transition"
                >
                  Post Voucher
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
