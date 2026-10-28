import React, { useState, useEffect } from 'react';
import { ApiClient } from '../api/client';
import { RepairJob } from '../types';
import { Wrench, Plus, CheckCircle2, AlertTriangle, Printer, Clock } from 'lucide-react';

export const WorkshopIntake: React.FC = () => {
  const [jobs, setJobs] = useState<RepairJob[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [selectedJobHtml, setSelectedJobHtml] = useState<string | null>(null);

  // Intake Form Fields
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [deviceType, setDeviceType] = useState('Laptop');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [reportedFault, setReportedFault] = useState('');
  const [physicalCondition, setPhysicalCondition] = useState('Normal minor wear. No visible cracks.');
  const [accessories, setAccessories] = useState('Original Power Adapter');
  const [securityPin, setSecurityPin] = useState('');
  const [estimatedCost, setEstimatedCost] = useState<number>(0);

  useEffect(() => {
    fetchJobs();
  }, []);

  const fetchJobs = async () => {
    try {
      const data = await ApiClient.request<RepairJob[]>('/repairs/jobs');
      setJobs(data);
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  const handleIntakeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    try {
      const payload = {
        customer: {
          fullName: customerName.trim(),
          phone: customerPhone.trim(),
          email: customerEmail.trim() || undefined,
        },
        deviceType,
        brand: brand.trim(),
        model: model.trim(),
        serialNumber: serialNumber.trim() || undefined,
        reportedFault: reportedFault.trim(),
        physicalCondition,
        accessories,
        securityPin: securityPin.trim() || undefined,
        estimatedCost: estimatedCost > 0 ? estimatedCost : undefined,
      };

      const res = await ApiClient.request<any>('/repairs/jobs', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      setSuccessMsg(`Job Card ${res.job.jobNumber} created successfully.`);
      setCustomerName('');
      setCustomerPhone('');
      setCustomerEmail('');
      setBrand('');
      setModel('');
      setSerialNumber('');
      setReportedFault('');
      setSecurityPin('');
      setEstimatedCost(0);
      fetchJobs();

      viewReceipt(res.job.id);
    } catch (err: any) {
      setErrorMsg(err.message || 'Intake failed');
    }
  };

  const viewReceipt = async (jobId: string) => {
    try {
      const html = await ApiClient.request<string>(`/repairs/jobs/${jobId}/receipt?format=html`, {
        headers: { Accept: 'text/html' },
      });
      setSelectedJobHtml(html);
    } catch (err: any) {
      setErrorMsg(err.message);
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl">
          <h2 className="text-base font-bold text-white flex items-center space-x-2 mb-4">
            <Wrench className="w-5 h-5 text-sky-400" />
            <span>New Hardware Intake Form</span>
          </h2>

          <form onSubmit={handleIntakeSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">Customer Full Name *</label>
                <input
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="e.g. Bhuwan Gautam"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">Customer Phone *</label>
                <input
                  type="text"
                  required
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="+977-98XXXXXXXX"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">Device Type</label>
                <select
                  value={deviceType}
                  onChange={(e) => setDeviceType(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
                >
                  <option value="Laptop">Laptop</option>
                  <option value="Desktop">Desktop</option>
                  <option value="Network Switch">Network Switch</option>
                  <option value="Router">Router / Gateway</option>
                  <option value="CCTV DVR/NVR">CCTV DVR/NVR</option>
                  <option value="Printer">Laser/Inkjet Printer</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">Brand *</label>
                <input
                  type="text"
                  required
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  placeholder="e.g. Dell / Ruijie"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">Model *</label>
                <input
                  type="text"
                  required
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="e.g. Latitude 5420"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">Serial Number / MAC</label>
                <input
                  type="text"
                  value={serialNumber}
                  onChange={(e) => setSerialNumber(e.target.value)}
                  placeholder="Optional unique ID"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-sky-500"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">Security PIN / Lock</label>
                <input
                  type="text"
                  value={securityPin}
                  onChange={(e) => setSecurityPin(e.target.value)}
                  placeholder="Device unlock passcode"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-400 block mb-1">Reported Fault *</label>
              <textarea
                required
                rows={3}
                value={reportedFault}
                onChange={(e) => setReportedFault(e.target.value)}
                placeholder="Explain the symptom (e.g., No power, short on 19V rail, blinking caps lock)..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-sky-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">Physical Condition</label>
                <input
                  type="text"
                  value={physicalCondition}
                  onChange={(e) => setPhysicalCondition(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">Estimated Charge (NPR)</label>
                <input
                  type="number"
                  min="0"
                  value={estimatedCost || ''}
                  onChange={(e) => setEstimatedCost(Number(e.target.value))}
                  placeholder="0.00"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-sky-500 hover:bg-sky-600 text-white font-bold py-3.5 rounded-xl transition shadow-lg shadow-sky-500/20 flex items-center justify-center space-x-2"
            >
              <Plus className="w-5 h-5" />
              <span>Create Official Job Card</span>
            </button>
          </form>
        </div>

        <div className="lg:col-span-6 bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl flex flex-col">
          <h2 className="text-base font-bold text-white flex items-center justify-between mb-4">
            <span className="flex items-center space-x-2">
              <Clock className="w-5 h-5 text-amber-400" />
              <span>Active Repair Bench</span>
            </span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">{jobs.length} Jobs</span>
          </h2>

          <div className="space-y-3 flex-1 overflow-y-auto max-h-[620px] pr-1">
            {jobs.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-12">No active repair jobs in bench.</p>
            ) : (
              jobs.map((job) => (
                <div key={job.id} className="bg-slate-950 border border-slate-800/80 p-4 rounded-xl flex items-center justify-between">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-bold font-mono text-sky-400">{job.jobNumber}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-300 font-semibold uppercase">{job.status}</span>
                    </div>
                    <h3 className="text-sm font-semibold text-white mt-1">{job.brand} {job.model} ({job.deviceType})</h3>
                    <p className="text-xs text-slate-400">{job.customer.fullName} • {job.customer.phone}</p>
                    <p className="text-xs text-slate-500 line-clamp-1 mt-1 font-mono italic">Fault: {job.reportedFault}</p>
                  </div>
                  <div className="text-right flex flex-col items-end space-y-2">
                    <span className="text-xs font-bold font-mono text-emerald-400">
                      NPR {Number(job.totalCost || job.estimatedCost || 0).toLocaleString()}
                    </span>
                    <button
                      onClick={() => viewReceipt(job.id)}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 flex items-center space-x-1"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Receipt</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {selectedJobHtml && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-white flex items-center justify-between">
              <span>Customer Job Card Receipt</span>
              <button onClick={() => setSelectedJobHtml(null)} className="text-xs text-slate-400 hover:text-white">✕</button>
            </h3>
            <div className="bg-white rounded-xl p-2 max-h-[500px] overflow-y-auto">
              <iframe
                title="Job Card Receipt"
                srcDoc={selectedJobHtml}
                className="w-full h-96 border-none"
              />
            </div>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  const printWin = window.open('', '_blank');
                  if (printWin) {
                    printWin.document.write(selectedJobHtml);
                    printWin.document.close();
                    printWin.print();
                  }
                }}
                className="bg-sky-500 hover:bg-sky-600 text-white font-bold text-xs px-5 py-2.5 rounded-xl transition"
              >
                Print Job Card
              </button>
              <button
                onClick={() => setSelectedJobHtml(null)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs px-4 py-2.5 rounded-xl transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
