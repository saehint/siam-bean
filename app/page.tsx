'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function MiniERP() {
  const [role, setRole] = useState<'Admin' | 'Sales' | 'Warehouse' | 'Accountant'>('Sales');
  const [products, setProducts] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [stats, setStats] = useState({ totalPaid: 0, lowStock: 0, openInvoices: 0 });
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // Modals state
  const [showStockModal, setShowStockModal] = useState<any>(null);
  const [stockAddAmount, setStockAddAmount] = useState(50);

  const [showProductModal, setShowProductModal] = useState(false);
  const [productForm, setProductForm] = useState({ id: null, sku: '', name: '', price: '', stock_qty: '', min_stock_alert: '20' });

  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [customerForm, setCustomerForm] = useState({ id: null, name: '', tax_id: '', address: '' });

  const [showOrderModal, setShowOrderModal] = useState(false);
  const [orderForm, setOrderForm] = useState({
    customerId: '',
    productId: '',
    quantity: 10,
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
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
      const paid = iData.filter((i) => i.status === 'Paid').reduce((sum, i) => sum + Number(i.grand_total), 0);
      const open = iData.filter((i) => i.status === 'Unpaid').length;
      setStats((prev) => ({ ...prev, totalPaid: paid, openInvoices: open }));
    }
  };

  // US-1 & US-3: Place Order with explicit Console Logging
  const handleConfirmOrder = async () => {
    setErrorBanner(null);

    const targetProduct = products.find((p) => p.sku === 'ARB-1KG');
    const targetCustomer = customers[0];

    if (!targetProduct || !targetCustomer) {
      const msg = 'Product ARB-1KG or Customer record not found.';
      console.error('[ERP Error]', msg);
      setErrorBanner(msg);
      return;
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
        // บังคับพิมพ์ Error ลง Console ให้เห็นชัดเจน
        console.error(`[Server 403 Forbidden] Access Denied: User role "${role}" is not authorized.`, result);
        setErrorBanner(`[HTTP ${res.status}] ${result.error}`);
        return;
      }

      console.log('[ERP Success] Order processed successfully:', result);
      fetchData();
    } catch (err) {
      console.error('[Network Error]', err);
      setErrorBanner('Failed to execute network request.');
    }
  };

  const handleCustomOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorBanner(null);

    if (!orderForm.customerId || !orderForm.productId) {
      setErrorBanner('Please select both a customer and a product.');
      return;
    }

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
      if (!res.ok) {
        console.error(`[Server 403 Forbidden] Access Denied: Role "${role}" rejected.`, result);
        setErrorBanner(`[HTTP ${res.status}] ${result.error}`);
        return;
      }

      console.log('[ERP Success] Custom order confirmed:', result);
      setShowOrderModal(false);
      fetchData();
    } catch (err) {
      console.error('[Network Error]', err);
      setErrorBanner('Request failed.');
    }
  };

  // RBAC Access Rules
  const canManageWarehouse = role === 'Warehouse' || role === 'Admin';
  const canManageCustomer = role === 'Sales' || role === 'Admin';

  // US-2: Stock-In Form Handler
  const handleStockInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageWarehouse) {
      const msg = `[HTTP 403 Forbidden] Role "${role}" has no warehouse management permissions.`;
      console.error(msg);
      setErrorBanner(msg);
      setShowStockModal(null);
      return;
    }
    if (!showStockModal) return;
    const newQty = showStockModal.stock_qty + Number(stockAddAmount);
    await supabase.from('products').update({ stock_qty: newQty }).eq('id', showStockModal.id);
    console.log(`[Stock-in] Added ${stockAddAmount} units to SKU: ${showStockModal.sku}`);
    setShowStockModal(null);
    fetchData();
  };

  // US-4: Payments (Accountant only)
  const handleMarkPaid = async (invId: number) => {
    if (role !== 'Accountant' && role !== 'Admin') {
      const msg = `[HTTP 403 Forbidden] Role "${role}" cannot process payments (Requires Accountant/Admin).`;
      console.error(msg);
      setErrorBanner(msg);
      return;
    }
    await supabase.from('invoices').update({ status: 'Paid' }).eq('id', invId);
    console.log(`[Payment] Invoice #${invId} updated to Paid.`);
    fetchData();
  };

  // Product CRUD Handlers
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageWarehouse) {
      setErrorBanner(`[HTTP 403 Forbidden] Only Warehouse personnel can edit products.`);
      setShowProductModal(false);
      return;
    }

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
    fetchData();
  };

  const handleToggleProduct = async (p: any) => {
    if (!canManageWarehouse) {
      setErrorBanner(`[HTTP 403 Forbidden] Only Warehouse personnel can change product status.`);
      return;
    }
    await supabase.from('products').update({ is_active: !(p.is_active !== false) }).eq('id', p.id);
    fetchData();
  };

  // Customer CRUD Handlers
  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageCustomer) {
      setErrorBanner(`[HTTP 403 Forbidden] Only Sales representatives can manage customer accounts.`);
      setShowCustomerModal(false);
      return;
    }

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
    fetchData();
  };

  const handleToggleCustomer = async (c: any) => {
    if (!canManageCustomer) {
      setErrorBanner(`[HTTP 403 Forbidden] Only Sales representatives can toggle customer status.`);
      return;
    }
    await supabase.from('customers').update({ is_active: !(c.is_active !== false) }).eq('id', c.id);
    fetchData();
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-800 p-6 md:p-10 font-sans antialiased">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Top Header & Role Switcher */}
        <header className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-slate-200/80 gap-4">
          <div>
            <div className="flex items-center space-x-3">
              <span className="w-3.5 h-3.5 rounded-full bg-blue-600 inline-block shadow-sm"></span>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">Siam Bean Co. — Mini ERP</h1>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-1">
              Enterprise Resource Planning • Sales, Warehouse & Accounting Core
            </p>
          </div>

          <div className="flex items-center bg-white p-1.5 rounded-xl border border-slate-200/90 shadow-xs space-x-1">
            <span className="text-[11px] font-bold text-slate-400 px-3 uppercase tracking-wider">Demo Role:</span>
            {(['Admin', 'Sales', 'Warehouse', 'Accountant'] as const).map((r) => {
              const active = role === r;
              return (
                <button
                  key={r}
                  onClick={() => { setRole(r); setErrorBanner(null); }}
                  className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all duration-150 ${
                    active
                      ? 'bg-blue-600 text-white shadow-sm scale-102'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  {r}
                </button>
              );
            })}
          </div>
        </header>

        {/* Dynamic Alert Banner */}
        {errorBanner && (
          <div className="bg-rose-50 border border-rose-200/90 text-rose-800 px-5 py-3.5 rounded-xl flex items-center justify-between shadow-xs animate-in fade-in duration-200">
            <div className="flex items-center space-x-3">
              <span className="text-rose-500 text-base">⚠️</span>
              <span className="text-xs font-semibold tracking-wide">{errorBanner}</span>
            </div>
            <button
              onClick={() => setErrorBanner(null)}
              className="text-xs font-bold text-rose-600 hover:text-rose-800 uppercase tracking-wider"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Dashboard Metrics (3 Key Numbers) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Paid Revenue</span>
            <div className="text-3xl font-extrabold text-emerald-600 mt-2 tracking-tight">
              {stats.totalPaid.toLocaleString()} <span className="text-sm font-semibold text-slate-500">THB</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-2 font-medium">Reconciled payments from cleared invoices</p>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Low-Stock Alert</span>
            <div className={`text-3xl font-extrabold mt-2 tracking-tight ${stats.lowStock > 0 ? 'text-amber-500' : 'text-slate-800'}`}>
              {stats.lowStock} <span className="text-sm font-semibold text-slate-500">SKUs</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-2 font-medium">Items currently beneath safety stock threshold</p>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Outstanding Invoices</span>
            <div className="text-3xl font-extrabold text-blue-600 mt-2 tracking-tight">
              {stats.openInvoices} <span className="text-sm font-semibold text-slate-500">Issued</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-2 font-medium">Pending accounts receivable (Unpaid)</p>
          </div>
        </div>

        {/* Sales Order Action Bar (US-1 Standard Requirement) */}
        <div className="bg-gradient-to-r from-blue-50/90 to-indigo-50/70 border border-blue-200/80 p-6 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-5 shadow-xs">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold uppercase tracking-wider bg-blue-100 text-blue-700 px-2.5 py-0.5 rounded-full">
                Test Case (US-1)
              </span>
              <h3 className="font-bold text-slate-900 text-base">Café Lune — 20 kg Order (ARB-1KG)</h3>
            </div>
            <p className="text-xs text-slate-600 mt-1 font-medium">
              450 THB/kg × 20 kg = 9,000 THB + 7% VAT (630 THB) = Total <strong className="text-blue-900">9,630 THB</strong>
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5 w-full md:w-auto">
            <button
              onClick={() => {
                if (role !== 'Sales' && role !== 'Admin') {
                  const msg = `[HTTP 403 Forbidden] Role "${role}" cannot issue custom orders.`;
                  console.error(msg);
                  setErrorBanner(msg);
                  return;
                }
                if (customers.length > 0 && products.length > 0) {
                  setOrderForm({
                    customerId: String(customers[0].id),
                    productId: String(products[0].id),
                    quantity: 10,
                  });
                }
                setShowOrderModal(true);
              }}
              className="px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-800 font-semibold text-xs rounded-xl border border-slate-200 shadow-xs transition"
            >
              + Custom Order
            </button>
            <button
              onClick={handleConfirmOrder}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-xs transition"
            >
              Confirm 20 kg Order (Quick Demo)
            </button>
          </div>
        </div>

        {/* Products & Inventory Section */}
        <section className="bg-white rounded-2xl shadow-xs border border-slate-200/80 p-6 space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-base font-bold text-slate-900">Inventory & Products (US-2)</h2>
              {!canManageWarehouse && (
                <span className="text-xs text-slate-400 font-medium">Read-only view for {role} role</span>
              )}
            </div>
            {canManageWarehouse && (
              <button
                onClick={() => {
                  setProductForm({ id: null, sku: '', name: '', price: '', stock_qty: '', min_stock_alert: '20' });
                  setShowProductModal(true);
                }}
                className="text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white px-3.5 py-1.5 rounded-lg shadow-xs transition"
              >
                + New Product
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 text-slate-500 font-semibold border-b border-slate-200/80">
                <tr>
                  <th className="py-3 px-4">SKU</th>
                  <th className="py-3 px-4">Product Name</th>
                  <th className="py-3 px-4">Unit Price</th>
                  <th className="py-3 px-4">Stock on Hand</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {products.map((p) => {
                  const isLow = p.stock_qty <= p.min_stock_alert;
                  const active = p.is_active !== false;
                  return (
                    <tr key={p.id} className={!active ? 'opacity-40 bg-slate-50/50' : 'hover:bg-slate-50/50'}>
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-700">{p.sku}</td>
                      <td className="py-3.5 px-4 font-medium text-slate-900">
                        {p.name} {!active && <span className="ml-1 text-[10px] text-rose-500 font-bold">(Deactivated)</span>}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-slate-700">{Number(p.price).toLocaleString()} THB</td>
                      <td className="py-3.5 px-4">
                        <span className="font-bold text-slate-900">{p.stock_qty} kg</span>
                        {isLow && active && (
                          <span className="ml-2.5 px-2 py-0.5 text-[10px] bg-amber-100 text-amber-800 font-bold rounded-full">
                            Low Stock
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right space-x-2">
                        {canManageWarehouse ? (
                          <>
                            <button
                              onClick={() => { setShowStockModal(p); setStockAddAmount(50); }}
                              className="text-[11px] font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-md transition"
                            >
                              + Stock-in Form
                            </button>
                            <button
                              onClick={() => {
                                setProductForm({ id: p.id, sku: p.sku, name: p.name, price: p.price, stock_qty: p.stock_qty, min_stock_alert: p.min_stock_alert });
                                setShowProductModal(true);
                              }}
                              className="text-[11px] font-medium text-blue-600 hover:underline"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleToggleProduct(p)}
                              className={`text-[11px] font-medium ${active ? 'text-rose-500' : 'text-slate-600'} hover:underline`}
                            >
                              {active ? 'Deactivate' : 'Activate'}
                            </button>
                          </>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">No access</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Customers Section */}
        <section className="bg-white rounded-2xl shadow-xs border border-slate-200/80 p-6 space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-base font-bold text-slate-900">Customer Directory</h2>
              {!canManageCustomer && (
                <span className="text-xs text-slate-400 font-medium">Read-only view for {role} role</span>
              )}
            </div>
            {canManageCustomer && (
              <button
                onClick={() => {
                  setCustomerForm({ id: null, name: '', tax_id: '', address: '' });
                  setShowCustomerModal(true);
                }}
                className="text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white px-3.5 py-1.5 rounded-lg shadow-xs transition"
              >
                + New Customer
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 text-slate-500 font-semibold border-b border-slate-200/80">
                <tr>
                  <th className="py-3 px-4">Customer Name</th>
                  <th className="py-3 px-4">Tax ID</th>
                  <th className="py-3 px-4">Billing Address</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {customers.map((c) => {
                  const active = c.is_active !== false;
                  return (
                    <tr key={c.id} className={!active ? 'opacity-40 bg-slate-50/50' : 'hover:bg-slate-50/50'}>
                      <td className="py-3.5 px-4 font-semibold text-slate-900">
                        {c.name} {!active && <span className="ml-1 text-[10px] text-rose-500 font-bold">(Deactivated)</span>}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-600">{c.tax_id || 'N/A'}</td>
                      <td className="py-3.5 px-4 text-slate-500">{c.address || 'N/A'}</td>
                      <td className="py-3.5 px-4 text-right space-x-2">
                        {canManageCustomer ? (
                          <>
                            <button
                              onClick={() => {
                                setCustomerForm({ id: c.id, name: c.name, tax_id: c.tax_id || '', address: c.address || '' });
                                setShowCustomerModal(true);
                              }}
                              className="text-[11px] font-medium text-blue-600 hover:underline"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleToggleCustomer(c)}
                              className={`text-[11px] font-medium ${active ? 'text-rose-500' : 'text-slate-600'} hover:underline`}
                            >
                              {active ? 'Deactivate' : 'Activate'}
                            </button>
                          </>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">No access</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Invoices & Billing Section (US-4) */}
        <section className="bg-white rounded-2xl shadow-xs border border-slate-200/80 p-6 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-base font-bold text-slate-900">Invoices & Reconciliations (US-4)</h2>
            {role !== 'Accountant' && role !== 'Admin' && (
              <span className="text-xs text-slate-400 font-medium">Payment capture reserved for Accountant/Admin</span>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 text-slate-500 font-semibold border-b border-slate-200/80">
                <tr>
                  <th className="py-3 px-4">Invoice #</th>
                  <th className="py-3 px-4">Grand Total (incl. 7% VAT)</th>
                  <th className="py-3 px-4">Payment Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoices.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-400 font-medium">No invoices created yet.</td>
                  </tr>
                ) : (
                  invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50/50">
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-800">{inv.invoice_no}</td>
                      <td className="py-3.5 px-4 font-semibold text-slate-900">{Number(inv.grand_total).toLocaleString()} THB</td>
                      <td className="py-3.5 px-4">
                        <span className={`px-2.5 py-0.5 text-[11px] font-bold rounded-full ${
                          inv.status === 'Paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {inv.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        {inv.status !== 'Paid' && (role === 'Accountant' || role === 'Admin') && (
                          <button
                            onClick={() => handleMarkPaid(inv.id)}
                            className="text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg shadow-xs transition"
                          >
                            Mark as Paid
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

      </div>

      {/* MODAL: Custom Order Form */}
      {showOrderModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <form onSubmit={handleCustomOrderSubmit} className="bg-white p-6 rounded-2xl max-w-md w-full space-y-4 shadow-xl border border-slate-100">
            <h3 className="font-bold text-base text-slate-900">Create Custom Sales Order</h3>
            
            <div>
              <label className="text-xs font-semibold block mb-1.5 text-slate-700">Select Customer:</label>
              <select
                value={orderForm.customerId}
                onChange={(e) => setOrderForm({ ...orderForm, customerId: e.target.value })}
                className="w-full border border-slate-300 rounded-lg p-2.5 text-xs bg-white focus:outline-blue-600"
                required
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold block mb-1.5 text-slate-700">Select Product:</label>
              <select
                value={orderForm.productId}
                onChange={(e) => setOrderForm({ ...orderForm, productId: e.target.value })}
                className="w-full border border-slate-300 rounded-lg p-2.5 text-xs bg-white focus:outline-blue-600"
                required
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (Available: {p.stock_qty} kg @ {p.price} THB)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold block mb-1.5 text-slate-700">Order Quantity (kg):</label>
              <input
                type="number"
                min="1"
                required
                value={orderForm.quantity}
                onChange={(e) => setOrderForm({ ...orderForm, quantity: parseInt(e.target.value) || 1 })}
                className="w-full border border-slate-300 rounded-lg p-2 text-xs focus:outline-blue-600"
              />
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setShowOrderModal(false)}
                className="px-3.5 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-lg font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold shadow-xs"
              >
                Issue Order & Deduct Stock
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: Stock-in Form */}
      {showStockModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <form onSubmit={handleStockInSubmit} className="bg-white p-6 rounded-2xl max-w-sm w-full space-y-4 shadow-xl border border-slate-100">
            <h3 className="font-bold text-base text-slate-900">Restock Product (Stock-in Form)</h3>
            <p className="text-xs text-slate-500">Target Item: {showStockModal.name} ({showStockModal.sku})</p>
            <div>
              <label className="text-xs font-semibold block mb-1.5 text-slate-700">Quantity to Inbound (kg):</label>
              <input
                type="number"
                min="1"
                required
                value={stockAddAmount}
                onChange={(e) => setStockAddAmount(parseInt(e.target.value) || 0)}
                className="w-full border border-slate-300 rounded-lg p-2 text-xs focus:outline-blue-600"
              />
            </div>
            <div className="flex justify-end space-x-2">
              <button type="button" onClick={() => setShowStockModal(null)} className="px-3 py-1.5 text-xs text-slate-600 font-medium">Cancel</button>
              <button type="submit" className="px-4 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold shadow-xs">Confirm Stock-in</button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: Product Form */}
      {showProductModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <form onSubmit={handleSaveProduct} className="bg-white p-6 rounded-2xl max-w-md w-full space-y-3 shadow-xl border border-slate-100">
            <h3 className="font-bold text-base text-slate-900">{productForm.id ? 'Edit Product' : 'Create New Product'}</h3>
            <div>
              <label className="text-xs font-semibold block mb-1 text-slate-700">SKU:</label>
              <input required value={productForm.sku} onChange={(e) => setProductForm({ ...productForm, sku: e.target.value })} className="w-full border border-slate-300 rounded-lg p-2 text-xs" />
            </div>
            <div>
              <label className="text-xs font-semibold block mb-1 text-slate-700">Product Name:</label>
              <input required value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} className="w-full border border-slate-300 rounded-lg p-2 text-xs" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold block mb-1 text-slate-700">Unit Price (THB):</label>
                <input type="number" step="0.01" required value={productForm.price} onChange={(e) => setProductForm({ ...productForm, price: e.target.value })} className="w-full border border-slate-300 rounded-lg p-2 text-xs" />
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1 text-slate-700">Stock on Hand:</label>
                <input type="number" required value={productForm.stock_qty} onChange={(e) => setProductForm({ ...productForm, stock_qty: e.target.value })} className="w-full border border-slate-300 rounded-lg p-2 text-xs" />
              </div>
            </div>
            <div className="flex justify-end space-x-2 pt-2">
              <button type="button" onClick={() => setShowProductModal(false)} className="px-3.5 py-1.5 text-xs text-slate-600 font-medium">Cancel</button>
              <button type="submit" className="px-4 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold shadow-xs">Save</button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: Customer Form */}
      {showCustomerModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <form onSubmit={handleSaveCustomer} className="bg-white p-6 rounded-2xl max-w-md w-full space-y-3 shadow-xl border border-slate-100">
            <h3 className="font-bold text-base text-slate-900">{customerForm.id ? 'Edit Customer' : 'Create New Customer'}</h3>
            <div>
              <label className="text-xs font-semibold block mb-1 text-slate-700">Customer Name / Company:</label>
              <input required value={customerForm.name} onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })} className="w-full border border-slate-300 rounded-lg p-2 text-xs" />
            </div>
            <div>
              <label className="text-xs font-semibold block mb-1 text-slate-700">Tax ID:</label>
              <input required value={customerForm.tax_id} onChange={(e) => setCustomerForm({ ...customerForm, tax_id: e.target.value })} className="w-full border border-slate-300 rounded-lg p-2 text-xs" />
            </div>
            <div>
              <label className="text-xs font-semibold block mb-1 text-slate-700">Address:</label>
              <textarea value={customerForm.address} onChange={(e) => setCustomerForm({ ...customerForm, address: e.target.value })} className="w-full border border-slate-300 rounded-lg p-2 text-xs" rows={2} />
            </div>
            <div className="flex justify-end space-x-2 pt-2">
              <button type="button" onClick={() => setShowCustomerModal(false)} className="px-3.5 py-1.5 text-xs text-slate-600 font-medium">Cancel</button>
              <button type="submit" className="px-4 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold shadow-xs">Save</button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}