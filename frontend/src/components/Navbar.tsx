import React from 'react';
import { ShoppingCart, Wrench, BarChart3, LogOut, ShieldCheck, Cpu } from 'lucide-react';

interface NavbarProps {
  activeTab: 'pos' | 'workshop' | 'accounting';
  setActiveTab: (tab: 'pos' | 'workshop' | 'accounting') => void;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, setActiveTab, onLogout }) => {
  return (
    <header className="bg-slate-900/90 backdrop-blur border-b border-slate-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-3">
            <div className="bg-sky-500/10 border border-sky-500/20 p-2 rounded-xl text-sky-400">
              <Cpu className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <span className="text-lg font-black tracking-wider text-white">NEXUSEDGE</span>
              <span className="text-xs ml-2 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold uppercase">Live ERP</span>
            </div>
          </div>

          <nav className="flex space-x-2">
            <button
              onClick={() => setActiveTab('pos')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                activeTab === 'pos'
                  ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/25'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <ShoppingCart className="w-4 h-4" />
              <span>POS Terminal</span>
            </button>

            <button
              onClick={() => setActiveTab('workshop')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                activeTab === 'workshop'
                  ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/25'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Wrench className="w-4 h-4" />
              <span>Workshop Intake</span>
            </button>

            <button
              onClick={() => setActiveTab('accounting')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                activeTab === 'accounting'
                  ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/25'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>Financial Ledger</span>
            </button>
          </nav>

          <div className="flex items-center space-x-4">
            <div className="hidden sm:flex items-center space-x-2 text-xs text-slate-400">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Admin Desk</span>
            </div>
            <button
              onClick={onLogout}
              className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
              title="Logout"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
