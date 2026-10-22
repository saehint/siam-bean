'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function MiniERP() {
  // ==========================================
  // 1. AUTHENTICATION STATE
  // ==========================================
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [loginError, setLoginError] = useState<string | null>(null);

  // ==========================================
  // 2. ERP CORE STATE
  // ==========================================
  const [role, setRole] = useState<'Admin' | 'Sales' | 'Warehouse' | 'Accountant'>('Sales');
  const [products, setProducts] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [stats, setStats] = useState({ totalPaid: 0, lowStock: 0, openInvoices: 0 });
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // ==========================================
  // 3. MODALS STATE
  // ==========================================
  const [showStockModal, setShowStockModal] = useState<any>(null);
  const [stockAddAmount, setStockAddAmount] = useState(50);
  const [showProductModal, setShowProductModal] = useState(false);
  const [productForm, setProductForm] = useState({ id: null, sku: '', name: '', price: '', stock_qty: '', min_stock_alert: '20' });
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [customerForm, setCustomerForm] = useState({ id: null, name: '', tax_id: '', address: '' });
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [orderForm, setOrderForm] = useState({ customerId: '', productId: '', quantity: 10 });

  // ==========================================
  // 4. AUTHENTICATION LOGIC
  // ==========================================
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', loginForm.username)
      .eq('password', loginForm.password)
      .single();

    if (data && data.is_active) {
      setCurrentUser(data);
      setRole(data.role);
      setIsLoggedIn(true);
      fetchData(data.role);
    } else {
      setLoginError('Invalid credentials or inactive account.');
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setCurrentUser(null);
    setLoginForm({ username: '', password: '' });
  };

  // ==========================================
  // 5. DATA FETCHING LOGIC
  // ==========================================
  const fetchData = async (currentRole: string) => {
    const { data: pData } = await supabase.from('products').select('*').order('id', { ascending: true });
    const { data: cData } = await supabase.from('customers').select('*').order('id', { ascending: true });
    const { data: iData } = await supabase.from('invoices').select('*').order('id', { ascending: false });

    if (pData) {
      setProducts(pData);
      setStats((prev) => ({
        ...prev,
        lowStock: pData.filter((p) => p.stock_qty <= p.min_stock_alert && p.is_active !== false).length,
      }));
    }
    if (cData) setCustomers(cData);
    if (iData) {
      setInvoices(iData);
      const paid = iData.filter((i) => i.status.toLowerCase() === 'paid').reduce((sum, i) => sum + Number(i.grand_total), 0);
      const open = iData.filter((i) => i.status.toLowerCase() === 'unpaid').length;
      setStats((prev) => ({ ...prev, totalPaid: paid, openInvoices: open }));
    }

    if (currentRole === 'Admin') {
      const { data: uData } = await supabase.from('users').select('*').order('id', { ascending: true });
      if (uData) setUsersList(uData);
    }
  };

  // ==========================================
  // 6. BUSINESS LOGIC HANDLERS
  // ==========================================
  const canManageWarehouse = role === 'Warehouse' || role === 'Admin';
  const canManageCustomer = role === 'Sales' || role === 'Admin';

  const handleConfirmOrder = async () => {
    setErrorBanner(null);
    const targetProduct = products.find((p) => p.sku === 'ARB-1KG');
    const targetCustomer = customers[0];

    if (!targetProduct || !targetCustomer) {
      return setErrorBanner('Product ARB-1KG or Customer record not found.');
    }

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role,
          customer_id: targetCustomer.id,
          product_id: targetProduct.id,
          quantity: 20,
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        console.error(`[Server 403]`, result);
        return setErrorBanner(`[HTTP ${res.status}] ${result.error}`);
      }
      fetchData(role);
    } catch (err) {
      setErrorBanner('Failed to execute network request.');
    }
  };

  const handleCustomOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorBanner(null);
    if (!orderForm.customerId || !orderForm.productId) return setErrorBanner('Select both customer and product.');

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role,
          customer_id: parseInt(orderForm.customerId),
          product_id: parseInt(orderForm.productId),
          quantity: Number(orderForm.quantity),
        }),
      });
      const result = await res.json();
      if (!res.ok) return setErrorBanner(`[HTTP ${res.status}] ${result.error}`);
      setShowOrderModal(false);
      fetchData(role);
    } catch (err) { setErrorBanner('Request failed.'); }
  };

  const handleStockInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageWarehouse || !showStockModal) return;
    const newQty = showStockModal.stock_qty + Number(stockAddAmount);
    await supabase.from('products').update({ stock_qty: newQty }).eq('id', showStockModal.id);
    setShowStockModal(null);
    fetchData(role);
  };

  const handleMarkPaid = async (invId: number) => {
    if (role !== 'Accountant' && role !== 'Admin') return setErrorBanner('Requires Accountant/Admin role.');
    await supabase.from('invoices').update({ status: 'Paid' }).eq('id', invId);
    fetchData(role);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageWarehouse) return setErrorBanner('Only Warehouse can edit products.');
    const payload = {
      sku: productForm.sku,
      name: productForm.name,
      price: parseFloat(productForm.price),
      stock_qty: parseInt(productForm.stock_qty),
      min_stock_alert: parseInt(productForm.min_stock_alert),
    };
    if (productForm.id) {
      await supabase.from('products').update(payload).eq('id', productForm.id);
    } else {
      await supabase.from('products').insert([payload]);
    }
    setShowProductModal(false);
    fetchData(role);
  };

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageCustomer) return setErrorBanner('Only Sales can manage customers.');
    const payload = {
      name: customerForm.name,
      tax_id: customerForm.tax_id,
      address: customerForm.address,
    };
    if (customerForm.id) {
      await supabase.from('customers').update(payload).eq('id', customerForm.id);
    } else {
      await supabase.from('customers').insert([payload]);
    }
    setShowCustomerModal(false);
    fetchData(role);
  };

  // ==========================================
  // 7. LOGIN UI
  // ==========================================
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 font-sans">
        <form onSubmit={handleLogin} className="bg-white p-8 rounded-2xl w-full max-w-sm shadow-2xl space-y-6">
          <div className="text-center">
            <div className="mx-auto w-12 h-12 bg-blue-600 rounded-xl mb-4 shadow-lg flex items-center justify-center text-white font-bold text-xl">SB</div>
            <h1 className="text-2xl font-bold text-slate-900">Siam Bean Co.</h1>
            <p className="text-sm text-slate-500 mt-1 font-medium">ERP System Login</p>
          </div>
          {loginError && <div className="bg-rose-50 text-rose-600 text-xs p-3 rounded-lg font-semibold border border-rose-100">{loginError}</div>}
          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5 uppercase tracking-wider">Username</label>
              <input type="text" required value={loginForm.username} onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })} className="w-full border border-slate-300 px-3.5 py-2.5 rounded-lg text-sm focus:outline-blue-600 bg-slate-50" placeholder="admin / sales / warehouse" />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5 uppercase tracking-wider">Password</label>
              <input type="password" required value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })} className="w-full border border-slate-300 px-3.5 py-2.5 rounded-lg text-sm focus:outline-blue-600 bg-slate-50" placeholder="1234" />
            </div>
          </div>
          <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition shadow-md">Sign In</button>
          <div className="text-[11px] text-slate-400 text-center mt-4 bg-slate-50 p-2 rounded-lg">Demo Pass: <strong>1234</strong></div>
        </form>
      </div>
    );
  }

  // ==========================================
  // 8. MAIN DASHBOARD UI
  // ==========================================
  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-800 p-6 md:p-10 font-sans antialiased">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-slate-200/80 gap-4">
          <div>
            <div className="flex items-center space-x-3">
              <span className="w-3.5 h-3.5 rounded-full bg-blue-600 inline-block shadow-sm"></span>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">Siam Bean Co. — Mini ERP</h1>
            </div>
          </div>
          <div className="flex items-center space-x-4 bg-white p-2 px-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="text-xs">
              <span className="text-slate-500 font-medium">Logged in as: </span>
              <strong className="text-slate-900">{currentUser?.username}</strong> 
              <span className="ml-2 px-2.5 py-0.5 bg-blue-100 text-blue-700 rounded-full font-bold shadow-xs uppercase tracking-wider">{role}</span>
            </div>
            <div className="w-px h-4 bg-slate-200"></div>
            <button onClick={handleLogout} className="text-xs text-rose-600 hover:text-rose-800 font-bold uppercase tracking-wider">Logout</button>
          </div>
        </header>

        {/* Error Banner */}
        {errorBanner && (
          <div className="bg-rose-50 border border-rose-200/90 text-rose-800 px-5 py-3.5 rounded-xl flex items-center justify-between shadow-xs">
            <span className="text-xs font-semibold tracking-wide">⚠️ {errorBanner}</span>
            <button onClick={() => setErrorBanner(null)} className="text-xs font-bold text-rose-600 uppercase">Dismiss</button>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Paid Revenue</span>
            <div className="text-3xl font-extrabold text-emerald-600 mt-2">{stats.totalPaid.toLocaleString()} <span className="text-sm text-slate-500">THB</span></div>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Low-Stock Alert</span>
            <div className="text-3xl font-extrabold text-amber-500 mt-2">{stats.lowStock} <span className="text-sm text-slate-500">SKUs</span></div>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Outstanding Invoices</span>
            <div className="text-3xl font-extrabold text-blue-600 mt-2">{stats.openInvoices} <span className="text-sm text-slate-500">Issued</span></div>
          </div>
        </div>

        {/* Quick Action (US-1) */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 p-6 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-5 shadow-xs">
          <div>
            <h3 className="font-bold text-slate-900 text-base">Café Lune — 20 kg Order (ARB-1KG)</h3>
            <p className="text-xs text-slate-600 mt-1 font-medium">Total: <strong className="text-blue-900">9,630 THB</strong> (incl. 7% VAT)</p>
          </div>
          <div className="flex gap-2.5">
            <button onClick={() => { if(role!=='Sales'&&role!=='Admin') return setErrorBanner('Access Denied: Requires Sales Role'); setShowOrderModal(true); }} className="px-4 py-2.5 bg-white text-slate-800 font-semibold text-xs rounded-xl border shadow-xs">+ Custom Order</button>
            <button onClick={handleConfirmOrder} className="px-5 py-2.5 bg-blue-600 text-white font-semibold text-xs rounded-xl shadow-xs">Confirm 20 kg Order</button>
          </div>
        </div>

        {/* Products Table */}
        <section className="bg-white rounded-2xl shadow-xs border border-slate-200/80 p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-base font-bold text-slate-900">Inventory & Products</h2>
            {canManageWarehouse && (
              <button onClick={() => { setProductForm({ id: null, sku: '', name: '', price: '', stock_qty: '', min_stock_alert: '20' }); setShowProductModal(true); }} className="text-xs font-semibold bg-slate-900 text-white px-3.5 py-1.5 rounded-lg shadow-xs">+ New Product</button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b">
                <tr><th className="py-3 px-4 text-slate-500">SKU</th><th className="py-3 px-4 text-slate-500">Product Name</th><th className="py-3 px-4 text-slate-500">Unit Price</th><th className="py-3 px-4 text-slate-500">Stock</th><th className="py-3 px-4 text-right text-slate-500">Actions</th></tr>
              </thead>
              <tbody className="divide-y">
                {products.map(p => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-bold font-mono">{p.sku}</td><td className="py-3 px-4">{p.name}</td><td className="py-3 px-4 font-semibold">{Number(p.price).toLocaleString()} THB</td>
                    <td className="py-3 px-4 font-bold">{p.stock_qty} kg {p.stock_qty <= p.min_stock_alert && <span className="ml-2 px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] rounded-full">Low</span>}</td>
                    <td className="py-3 px-4 text-right space-x-2">
                      {canManageWarehouse ? (
                        <>
                          <button onClick={() => { setShowStockModal(p); setStockAddAmount(50); }} className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded">Stock-in</button>
                          <button onClick={() => { setProductForm(p); setShowProductModal(true); }} className="text-[11px] font-medium text-blue-600 hover:underline">Edit</button>
                        </>
                      ) : <span className="text-slate-400 italic">No access</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Invoices Table */}
        <section className="bg-white rounded-2xl shadow-xs border border-slate-200/80 p-6">
          <h2 className="text-base font-bold mb-4 text-slate-900">Invoices & Billing</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b">
                <tr><th className="py-3 px-4 text-slate-500">Invoice #</th><th className="py-3 px-4 text-slate-500">Grand Total</th><th className="py-3 px-4 text-slate-500">Status</th><th className="py-3 px-4 text-right text-slate-500">Actions</th></tr>
              </thead>
              <tbody className="divide-y">
                {invoices.map(inv => (
                  <tr key={inv.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-bold font-mono">{inv.invoice_no}</td><td className="py-3 px-4 font-semibold">{Number(inv.grand_total).toLocaleString()} THB</td>
                    <td className="py-3 px-4"><span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${inv.status.toLowerCase() === 'paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{inv.status}</span></td>
                    <td className="py-3 px-4 text-right">
                      {inv.status.toLowerCase() !== 'paid' && (role === 'Accountant' || role === 'Admin') && (
                        <button onClick={() => handleMarkPaid(inv.id)} className="text-[11px] font-bold text-white bg-emerald-600 px-3 py-1.5 rounded shadow-xs">Mark Paid</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* User Management Section (Admin Only) */}
        {role === 'Admin' && (
          <section className="bg-slate-900 rounded-2xl shadow-lg border border-slate-800 p-6 text-white mt-8">
            <h2 className="text-base font-bold text-blue-400 mb-4">🛡️ Admin Panel: User Roles Matrix</h2>
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-800 border-b border-slate-700">
                <tr><th className="py-3 px-4">Username</th><th className="py-3 px-4">System Role</th><th className="py-3 px-4">Access Level</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {usersList.map(u => (
                  <tr key={u.id} className="hover:bg-slate-800/50">
                    <td className="py-3 px-4 font-bold text-white">{u.username}</td>
                    <td className="py-3 px-4"><span className="bg-slate-700 px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wide">{u.role}</span></td>
                    <td className="py-3 px-4">{u.is_active ? <span className="text-emerald-400 font-medium">Active (Granted)</span> : <span className="text-rose-400">Disabled</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

      </div>

      {/* ==========================================
          9. ALL MODALS INCLUDED
      ========================================== */}
      
      {/* Custom Order Modal */}
      {showOrderModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <form onSubmit={handleCustomOrderSubmit} className="bg-white p-6 rounded-2xl max-w-md w-full space-y-4 shadow-xl">
            <h3 className="font-bold text-base">Create Custom Sales Order</h3>
            <div>
              <label className="text-xs font-semibold block mb-1">Customer:</label>
              <select value={orderForm.customerId} onChange={(e) => setOrderForm({ ...orderForm, customerId: e.target.value })} className="w-full border rounded-lg p-2 text-xs" required>
                <option value="">-- Select --</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold block mb-1">Product:</label>
              <select value={orderForm.productId} onChange={(e) => setOrderForm({ ...orderForm, productId: e.target.value })} className="w-full border rounded-lg p-2 text-xs" required>
                <option value="">-- Select --</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name} (Stock: {p.stock_qty})</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold block mb-1">Quantity:</label>
              <input type="number" min="1" required value={orderForm.quantity} onChange={(e) => setOrderForm({ ...orderForm, quantity: Number(e.target.value) })} className="w-full border rounded-lg p-2 text-xs" />
            </div>
            <div className="flex justify-end space-x-2 pt-2">
              <button type="button" onClick={() => setShowOrderModal(false)} className="px-3 py-1.5 text-xs text-slate-600 font-bold">Cancel</button>
              <button type="submit" className="px-4 py-1.5 text-xs bg-blue-600 text-white rounded-lg font-bold">Issue Order</button>
            </div>
          </form>
        </div>
      )}

      {/* Stock-in Modal */}
      {showStockModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <form onSubmit={handleStockInSubmit} className="bg-white p-6 rounded-2xl max-w-sm w-full space-y-4 shadow-xl">
            <h3 className="font-bold text-base">Restock: {showStockModal.sku}</h3>
            <div>
              <label className="text-xs font-semibold block mb-1">Quantity to Add (kg):</label>
              <input type="number" min="1" required value={stockAddAmount} onChange={(e) => setStockAddAmount(Number(e.target.value))} className="w-full border rounded-lg p-2 text-xs" />
            </div>
            <div className="flex justify-end space-x-2">
              <button type="button" onClick={() => setShowStockModal(null)} className="px-3 py-1.5 text-xs text-slate-600 font-bold">Cancel</button>
              <button type="submit" className="px-4 py-1.5 text-xs bg-emerald-600 text-white rounded-lg font-bold">Confirm</button>
            </div>
          </form>
        </div>
      )}

      {/* Product Form Modal */}
      {showProductModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <form onSubmit={handleSaveProduct} className="bg-white p-6 rounded-2xl max-w-md w-full space-y-3 shadow-xl">
            <h3 className="font-bold text-base">{productForm.id ? 'Edit Product' : 'New Product'}</h3>
            <input required value={productForm.sku} onChange={e => setProductForm({...productForm, sku: e.target.value})} placeholder="SKU" className="w-full border rounded-lg p-2 text-xs" />
            <input required value={productForm.name} onChange={e => setProductForm({...productForm, name: e.target.value})} placeholder="Name" className="w-full border rounded-lg p-2 text-xs" />
            <div className="grid grid-cols-2 gap-2">
              <input type="number" required value={productForm.price} onChange={e => setProductForm({...productForm, price: e.target.value})} placeholder="Price" className="w-full border rounded-lg p-2 text-xs" />
              <input type="number" required value={productForm.stock_qty} onChange={e => setProductForm({...productForm, stock_qty: e.target.value})} placeholder="Stock" className="w-full border rounded-lg p-2 text-xs" />
            </div>
            <div className="flex justify-end space-x-2 pt-2">
              <button type="button" onClick={() => setShowProductModal(false)} className="px-3 py-1.5 text-xs text-slate-600 font-bold">Cancel</button>
              <button type="submit" className="px-4 py-1.5 text-xs bg-blue-600 text-white rounded-lg font-bold">Save</button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}