import React, { useState, useEffect, useRef } from 'react';
import { ApiClient } from '../api/client';
import { Product, CartItem } from '../types';
import { Search, Barcode, Trash2, Plus, Minus, CreditCard, Banknote, Smartphone, Receipt, CheckCircle2, AlertTriangle } from 'lucide-react';

export const POS: React.FC = () => {
  const [scanInput, setScanInput] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState<number>(0);
  const [searchFilter, setSearchFilter] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isCheckoutModal, setIsCheckoutModal] = useState(false);
  
  // Payment Tender State
  const [cashTender, setCashTender] = useState<number>(0);
  const [digitalTender, setDigitalTender] = useState<number>(0);
  const [digitalRef, setDigitalRef] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [customerName, setCustomerName] = useState<string>('');
  const [thermalReceipt, setThermalReceipt] = useState<string | null>(null);

  const barcodeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchProducts();
    barcodeInputRef.current?.focus();
  }, []);

  const fetchProducts = async () => {
    try {
      const data = await ApiClient.request<Product[]>('/inventory/products');
      setProducts(data);
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  const handleScanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scanInput.trim()) return;

    setErrorMsg(null);
    try {
      const res = await ApiClient.request<any>(`/pos/scan/${encodeURIComponent(scanInput.trim())}`);
      addToCart(res.product, res.assignedSerial?.serialNo);
      setScanInput('');
    } catch (err: any) {
      setErrorMsg(err.message || 'Scanned item not recognized.');
    }
  };

  const addToCart = (product: Product, serialNo?: string) => {
    setCart((prevCart) => {
      const existing = prevCart.find((item) => item.product.id === product.id);
      if (existing) {
        if (existing.quantity >= product.stockQuantity) {
          setErrorMsg(`Cannot add more. Current inventory limit is ${product.stockQuantity}.`);
          return prevCart;
        }
        const updatedSerials = serialNo && !existing.selectedSerials.includes(serialNo)
          ? [...existing.selectedSerials, serialNo]
          : existing.selectedSerials;

        return prevCart.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1, selectedSerials: updatedSerials }
            : item
        );
      } else {
        return [
          ...prevCart,
          {
            product,
            quantity: 1,
            unitPrice: Number(product.retailPrice),
            selectedSerials: serialNo ? [serialNo] : [],
          },
        ];
      }
    });
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart((prevCart) =>
      prevCart
        .map((item) => {
          if (item.product.id === productId) {
            const newQty = item.quantity + delta;
            if (newQty > item.product.stockQuantity) {
              setErrorMsg(`Stock limit exceeded. Only ${item.product.stockQuantity} available.`);
              return item;
            }
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const removeItem = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  };

  // Financial Computations
  const subTotal = cart.reduce((acc, item) => acc + item.quantity * item.unitPrice, 0);
  const netTaxable = Math.max(0, subTotal - discount);
  const taxAmount = Number((netTaxable * 0.13).toFixed(2));
  const grandTotal = Number((netTaxable + taxAmount).toFixed(2));
  const totalPaidTender = cashTender + digitalTender;
  const balanceDue = Math.max(0, Number((grandTotal - totalPaidTender).toFixed(2)));
  const changeDue = Math.max(0, Number((totalPaidTender - grandTotal).toFixed(2)));

  const handleCheckoutSubmit = async () => {
    setErrorMsg(null);
    try {
      const payments = [];
      if (cashTender > 0) payments.push({ method: 'CASH', amount: cashTender });
      if (digitalTender > 0) payments.push({ method: 'DIGITAL_WALLET', amount: digitalTender, referenceNo: digitalRef || undefined });

      if (payments.length === 0) {
        throw new Error('Please enter at least one payment amount.');
      }

      const payload: any = {
        items: cart.map((item) => ({
          productId: item.product.id,
          quantity: item.quantity,
          serialNos: item.selectedSerials.length > 0 ? item.selectedSerials : undefined,
        })),
        discount,
        taxRate: 0.13,
        payments,
      };

      if (customerPhone.trim()) {
        payload.walkInCustomer = {
          fullName: customerName.trim() || 'Retail Customer',
          phone: customerPhone.trim(),
        };
      }

      const res = await ApiClient.request<any>('/pos/checkout', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      // Load receipt
      const receiptRes = await ApiClient.request<any>(`/pos/invoices/${res.invoice.id}/receipt`);
      setThermalReceipt(receiptRes.plainText);
      setSuccessMsg(`Invoice ${res.invoice.invoiceNo} successfully finalized!`);
      setCart([]);
      setDiscount(0);
      setCashTender(0);
      setDigitalTender(0);
      setIsCheckoutModal(false);
      fetchProducts();
    } catch (err: any) {
      setErrorMsg(err.message || 'Checkout failed');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {errorMsg && (
        <div className="mb-4 bg-rose-500/10 border border-rose-500/30 text-rose-400 p-4 rounded-xl flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-xs uppercase font-bold px-2 py-1 hover:bg-rose-500/20 rounded">Dismiss</button>
        </div>
      )}

      {successMsg && (
        <div className="mb-4 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 p-4 rounded-xl flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-xs uppercase font-bold px-2 py-1 hover:bg-emerald-500/20 rounded">Dismiss</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Side: Barcode Input & Product Catalog */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-xl">
            <form onSubmit={handleScanSubmit} className="flex gap-2">
              <div className="relative flex-1">
                <Barcode className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-sky-400" />
                <input
                  ref={barcodeInputRef}
                  type="text"
                  value={scanInput}
                  onChange={(e) => setScanInput(e.target.value)}
                  placeholder="Scan Barcode / Serial / SKU..."
                  className="w-full bg-slate-950 border border-slate-700 pl-10 pr-4 py-3 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 font-mono text-sm"
                />
              </div>
              <button
                type="submit"
                className="bg-sky-500 hover:bg-sky-600 text-white font-bold px-6 py-3 rounded-xl transition shadow-lg shadow-sky-500/20"
              >
                Scan
              </button>
            </form>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-slate-200">Product Catalog</h2>
              <div className="relative w-64">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder="Search products..."
                  className="w-full bg-slate-950 border border-slate-800 pl-9 pr-3 py-1.5 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[500px] overflow-y-auto pr-1">
              {products
                .filter((p) => p.name.toLowerCase().includes(searchFilter.toLowerCase()) || p.sku.toLowerCase().includes(searchFilter.toLowerCase()))
                .map((product) => (
                  <button
                    key={product.id}
                    onClick={() => addToCart(product)}
                    className="p-3 bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 rounded-xl text-left transition flex flex-col justify-between group"
                  >
                    <div>
                      <span className="text-[10px] font-bold tracking-wider text-sky-400 uppercase">{product.category}</span>
                      <h3 className="text-xs font-semibold text-white line-clamp-2 mt-0.5 group-hover:text-sky-300">{product.name}</h3>
                      <p className="text-[11px] text-slate-400 font-mono mt-1">SKU: {product.sku}</p>
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t border-slate-800/80 pt-2">
                      <span className="text-xs font-bold text-emerald-400">NPR {Number(product.retailPrice).toLocaleString()}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${product.stockQuantity > 0 ? 'bg-slate-800 text-slate-300' : 'bg-rose-500/10 text-rose-400'}`}>
                        Qty: {product.stockQuantity}
                      </span>
                    </div>
                  </button>
                ))}
            </div>
          </div>
        </div>

        {/* Right Side: Active Cart & Checkout Ledger */}
        <div className="lg:col-span-5">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl flex flex-col h-full">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h2 className="text-base font-bold text-white flex items-center space-x-2">
                <span>Current Transaction</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20">{cart.length} items</span>
              </h2>
              {cart.length > 0 && (
                <button onClick={() => setCart([])} className="text-xs text-rose-400 hover:text-rose-300 font-semibold">Clear Cart</button>
              )}
            </div>

            <div className="flex-1 p-4 overflow-y-auto space-y-3 max-h-[380px]">
              {cart.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <Barcode className="w-12 h-12 mx-auto stroke-1 mb-2 opacity-50" />
                  <p className="text-sm">Scan barcode or select product to begin checkout</p>
                </div>
              ) : (
                cart.map((item) => (
                  <div key={item.product.id} className="bg-slate-950 p-3 rounded-xl border border-slate-800/80 flex items-center justify-between">
                    <div className="flex-1 pr-2">
                      <h4 className="text-xs font-semibold text-white line-clamp-1">{item.product.name}</h4>
                      <p className="text-[11px] text-slate-400 font-mono">NPR {item.unitPrice.toLocaleString()} each</p>
                      {item.selectedSerials.length > 0 && (
                        <p className="text-[10px] text-sky-400 font-mono mt-0.5">SN: {item.selectedSerials.join(', ')}</p>
                      )}
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="flex items-center border border-slate-700 rounded-lg overflow-hidden bg-slate-900">
                        <button onClick={() => updateQuantity(item.product.id, -1)} className="p-1 hover:bg-slate-800 text-slate-300">
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="px-2 text-xs font-bold text-white font-mono">{item.quantity}</span>
                        <button onClick={() => updateQuantity(item.product.id, 1)} className="p-1 hover:bg-slate-800 text-slate-300">
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <span className="text-xs font-bold text-slate-200 font-mono w-16 text-right">
                        {(item.quantity * item.unitPrice).toLocaleString()}
                      </span>
                      <button onClick={() => removeItem(item.product.id)} className="text-slate-500 hover:text-rose-400 p-1">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Financial Summary */}
            <div className="p-4 bg-slate-950 border-t border-slate-800 rounded-b-2xl space-y-2">
              <div className="flex justify-between text-xs text-slate-400">
                <span>Subtotal</span>
                <span className="font-mono text-slate-200">NPR {subTotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center text-xs text-slate-400">
                <span>Discount (NPR)</span>
                <input
                  type="number"
                  min="0"
                  value={discount || ''}
                  onChange={(e) => setDiscount(Number(e.target.value))}
                  placeholder="0.00"
                  className="w-24 bg-slate-900 border border-slate-800 rounded px-2 py-0.5 text-right text-xs font-mono text-white focus:outline-none focus:border-sky-500"
                />
              </div>
              <div className="flex justify-between text-xs text-slate-400">
                <span>VAT (13%)</span>
                <span className="font-mono text-slate-200">NPR {taxAmount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-base font-black text-white pt-2 border-t border-slate-800">
                <span>Grand Total</span>
                <span className="text-sky-400 font-mono">NPR {grandTotal.toLocaleString()}</span>
              </div>

              <button
                disabled={cart.length === 0}
                onClick={() => {
                  setCashTender(grandTotal);
                  setIsCheckoutModal(true);
                }}
                className="w-full mt-3 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold py-3.5 rounded-xl transition shadow-lg shadow-emerald-500/20 flex items-center justify-center space-x-2"
              >
                <CreditCard className="w-5 h-5" />
                <span>Process Payment</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Multi-Tender Split Payment Modal */}
      {isCheckoutModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white flex items-center justify-between">
              <span>Split Tender Payment</span>
              <span className="text-sky-400 font-mono text-base">NPR {grandTotal.toLocaleString()}</span>
            </h3>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1">Customer Phone (Optional for Credit)</label>
                <input
                  type="text"
                  placeholder="+977-98XXXXXXXX"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1">Customer Name</label>
                <input
                  type="text"
                  placeholder="Retail Customer"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="text-xs font-medium text-slate-400 flex items-center space-x-1 mb-1">
                    <Banknote className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Cash Tendered</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={cashTender || ''}
                    onChange={(e) => setCashTender(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-400 flex items-center space-x-1 mb-1">
                    <Smartphone className="w-3.5 h-3.5 text-sky-400" />
                    <span>Digital Wallet</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={digitalTender || ''}
                    onChange={(e) => setDigitalTender(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              {digitalTender > 0 && (
                <div>
                  <label className="text-xs font-medium text-slate-400 block mb-1">Wallet Reference / Transaction ID</label>
                  <input
                    type="text"
                    placeholder="e.g. ESEWA-992128 / KHALTI-1122"
                    value={digitalRef}
                    onChange={(e) => setDigitalRef(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
                  />
                </div>
              )}

              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80 space-y-1 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Total Tendered:</span>
                  <span className="font-mono text-white">NPR {totalPaidTender.toLocaleString()}</span>
                </div>
                {changeDue > 0 && (
                  <div className="flex justify-between text-emerald-400 font-bold">
                    <span>Cash Change Return:</span>
                    <span className="font-mono">NPR {changeDue.toLocaleString()}</span>
                  </div>
                )}
                {balanceDue > 0 && (
                  <div className="flex justify-between text-amber-400 font-bold">
                    <span>Store Credit (AR Due):</span>
                    <span className="font-mono">NPR {balanceDue.toLocaleString()}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end space-x-3 pt-3">
              <button
                onClick={() => setIsCheckoutModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:bg-slate-800 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleCheckoutSubmit}
                className="bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold px-6 py-2.5 rounded-xl transition shadow-lg shadow-emerald-500/20"
              >
                Confirm Sale
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Printable Thermal Receipt Modal */}
      {thermalReceipt && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-white flex items-center space-x-2">
              <Receipt className="w-5 h-5 text-sky-400" />
              <span>Thermal Receipt (80mm Monospace)</span>
            </h3>
            <pre className="bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-[11px] text-emerald-400 max-h-96 overflow-y-auto whitespace-pre">
              {thermalReceipt}
            </pre>
            <div className="flex justify-between items-center pt-2">
              <button
                onClick={() => window.print()}
                className="bg-sky-500 hover:bg-sky-600 text-white font-bold text-xs px-4 py-2 rounded-xl transition"
              >
                Print Receipt
              </button>
              <button
                onClick={() => setThermalReceipt(null)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs px-4 py-2 rounded-xl transition"
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
