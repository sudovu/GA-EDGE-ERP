import React, { useState, useEffect } from 'react';
import { ApiClient } from './api/client';
import { Navbar } from './components/Navbar';
import { POS } from './pages/POS';
import { WorkshopIntake } from './pages/WorkshopIntake';
import { AccountingReports } from './pages/AccountingReports';
import { Lock, Cpu } from 'lucide-react';

export const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(!!ApiClient.getToken());
  const [activeTab, setActiveTab] = useState<'pos' | 'workshop' | 'accounting'>('pos');
  
  // Login form state
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('NexusAdmin@2026!Secure');
  const [loginError, setLoginError] = useState<string | null>(null);

  useEffect(() => {
    const handleUnauthorized = () => setIsAuthenticated(false);
    window.addEventListener('auth-unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth-unauthorized', handleUnauthorized);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    try {
      const res = await ApiClient.request<{ success: boolean; token: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      ApiClient.setToken(res.token);
      setIsAuthenticated(true);
    } catch (err: any) {
      setLoginError(err.message || 'Login failed. Verify credentials.');
    }
  };

  const handleLogout = () => {
    ApiClient.clearToken();
    setIsAuthenticated(false);
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 p-8 rounded-3xl shadow-2xl space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-flex p-3 rounded-2xl bg-sky-500/10 text-sky-400 border border-sky-500/20 mb-2">
              <Cpu className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-black text-white tracking-wider">NEXUSEDGE ERP</h1>
            <p className="text-xs text-slate-400">Production Terminal Authentication</p>
          </div>

          {loginError && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-xs">
              {loginError}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-400 block mb-1">Operator Username</label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-sky-500"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-400 block mb-1">Master Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-sky-500"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-sky-500 hover:bg-sky-600 text-white font-bold py-3.5 rounded-xl transition shadow-lg shadow-sky-500/25 flex items-center justify-center space-x-2"
            >
              <Lock className="w-4 h-4" />
              <span>Authenticate System</span>
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} onLogout={handleLogout} />
      <main className="flex-1">
        {activeTab === 'pos' && <POS />}
        {activeTab === 'workshop' && <WorkshopIntake />}
        {activeTab === 'accounting' && <AccountingReports />}
      </main>
    </div>
  );
};
