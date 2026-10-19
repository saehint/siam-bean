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

  // จุดที่ 1: State สำหรับสร้างออเดอร์เองสดๆ
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

  // US-1: ปุ่มลัดตามโจทย์เดิม (Café Lune 20 kg)
  const handleConfirmOrder = async () => {
    setErrorBanner(null);
    const targetProduct = products.find((p) => p.sku === 'ARB-1KG');
    const targetCustomer = customers[0];

    if (!targetProduct || !targetCustomer) {
      setErrorBanner('ไม่พบข้อมูลสินค้า ARB-1KG หรือลูกค้า');
      return;
    }

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
      setErrorBanner(`[HTTP ${res.status}] ${result.error}`);
      return;
    }

    fetchData();
  };

  // จุดที่ 2: ฟังก์ชันสำหรับยิง API เมื่อกรรมการสั่งให้ออกออเดอร์เอง
  const handleCustomOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorBanner(null);

    if (!orderForm.customerId || !orderForm.productId) {
      setErrorBanner('กรุณาเลือกลูกค้าและสินค้าให้ครบถ้วน');
      return;
    }

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
      setErrorBanner(`[HTTP ${res.status}] ${result.error}`);
      return;
    }

    setShowOrderModal(false);
    fetchData();
  };

  // US-2: Stock-In Form Handler
  const handleStockInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showStockModal) return;
    const newQty = showStockModal.stock_qty + Number(stockAddAmount);
    await supabase.from('products').update({ stock_qty: newQty }).eq('id', showStockModal.id);
    setShowStockModal(null);
    fetchData();
  };

  // US-4: Payments
  const handleMarkPaid = async (invId: number) => {
    if (role !== 'Accountant' && role !== 'Admin') {
      setErrorBanner('[HTTP 403] Only Accountant or Admin can register payments.');
      return;
    }
    await supabase.from('invoices').update({ status: 'Paid' }).eq('id', invId);
    fetchData();
  };

  // Product CRUD Handlers
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
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
    await supabase.from('products').update({ is_active: !(p.is_active !== false) }).eq('id', p.id);
    fetchData();
  };

  // Customer CRUD Handlers
  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
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
    await supabase.from('customers').update({ is_active: !(c.is_active !== false) }).eq('id', c.id);
    fetchData();
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header & Role Switcher */}
        <header className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b bg-white p-6 rounded-xl shadow-sm">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Siam Bean Co. - Mini ERP</h1>
            <p className="text-sm text-slate-500">Sales, Warehouse, and Accounting Integration</p>
          </div>
          <div className="mt-4 md:mt-0 flex items-center space-x-2">
            <span className="text-xs font-semibold text-slate-500 mr-2">สลับบทบาท (Demo Role):</span>
            {(['Admin', 'Sales', 'Warehouse', 'Accountant'] as const).map((r) => (
              <button
                key={r}
                onClick={() => { setRole(r); setErrorBanner(null); }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  role === r ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </header>

        {/* Error Banner */}
        {errorBanner && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center justify-between shadow-sm">
            <span className="text-sm font-medium">{errorBanner}</span>
            <button onClick={() => setErrorBanner(null)} className="text-xs font-bold uppercase underline">ปิด</button>
          </div>
        )}

        {/* Dashboard 3 Numbers */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
            <span className="text-xs font-bold text-slate-400 tracking-wider uppercase">Total Paid Sales</span>
            <div className="text-3xl font-extrabold text-emerald-600 mt-2">{stats.totalPaid.toLocaleString()} THB</div>
            <p className="text-xs text-slate-400 mt-1">ยอดขายที่ชำระเงินเรียบร้อยแล้ว</p>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
            <span className="text-xs font-bold text-slate-400 tracking-wider uppercase">Low-Stock Alert</span>
            <div className={`text-3xl font-extrabold mt-2 ${stats.lowStock > 0 ? 'text-amber-500' : 'text-slate-800'}`}>
              {stats.lowStock} รายการ
            </div>
            <p className="text-xs text-slate-400 mt-1">สินค้าที่สต็อกต่ำกว่าเกณฑ์แจ้งเตือน</p>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
            <span className="text-xs font-bold text-slate-400 tracking-wider uppercase">Open Invoices</span>
            <div className="text-3xl font-extrabold text-blue-600 mt-2">{stats.openInvoices} ใบ</div>
            <p className="text-xs text-slate-400 mt-1">ใบแจ้งหนี้ค้างชำระ (Unpaid)</p>
          </div>
        </div>

        {/* จุดที่ 3: ส่วนการสั่งซื้อ มีทั้งปุ่ม Demo ตามโจทย์ และปุ่ม + สร้างออเดอร์เองสดๆ */}
        <div className="bg-blue-50 border border-blue-200 p-6 rounded-xl flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <h3 className="font-bold text-blue-900 text-base">🛒 ระบบออกคำสั่งซื้อ (Sales Orders)</h3>
            <p className="text-xs text-blue-700 mt-1">
              เคสตามโจทย์: Café Lune สั่งซื้อ 20 kg (ARB-1KG) = 9,630 THB (รวม VAT 7%) หรือคลิกสร้างรายการเอง
            </p>
          </div>
          <div className="flex flex-wrap gap-2 w-full md:w-auto">
            <button
              onClick={() => {
                if (customers.length > 0 && products.length > 0) {
                  setOrderForm({
                    customerId: String(customers[0].id),
                    productId: String(products[0].id),
                    quantity: 10,
                  });
                }
                setShowOrderModal(true);
              }}
              className="px-4 py-2.5 bg-white hover:bg-slate-100 text-blue-700 font-semibold text-sm rounded-lg border border-blue-300 shadow-sm transition"
            >
              + สร้างออเดอร์เอง
            </button>
            <button
              onClick={handleConfirmOrder}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-lg shadow transition"
            >
              ยืนยันตามโจทย์ด่วน (20 kg)
            </button>
          </div>
        </div>

        {/* Products Section */}
        <section className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold">📦 รายการสินค้าและสต็อก (Products)</h2>
            <button
              onClick={() => {
                setProductForm({ id: null, sku: '', name: '', price: '', stock_qty: '', min_stock_alert: '20' });
                setShowProductModal(true);
              }}
              className="text-xs bg-slate-900 hover:bg-slate-800 text-white px-3 py-1.5 rounded-lg"
            >
              + เพิ่มสินค้า
            </button>
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 font-semibold border-b">
              <tr>
                <th className="p-3">SKU</th>
                <th className="p-3">ชื่อสินค้า</th>
                <th className="p-3">ราคา/หน่วย</th>
                <th className="p-3">สต็อกคงเหลือ</th>
                <th className="p-3 text-right">การจัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {products.map((p) => {
                const isLow = p.stock_qty <= p.min_stock_alert;
                const active = p.is_active !== false;
                return (
                  <tr key={p.id} className={!active ? 'opacity-40 bg-slate-50' : ''}>
                    <td className="p-3 font-medium">{p.sku}</td>
                    <td className="p-3">{p.name} {!active && <span className="text-xs text-red-500">(Deactivated)</span>}</td>
                    <td className="p-3">{Number(p.price).toLocaleString()} THB</td>
                    <td className="p-3">
                      <span className="font-bold">{p.stock_qty} kg</span>
                      {isLow && active && (
                        <span className="ml-2 px-2 py-0.5 text-xs bg-amber-100 text-amber-800 font-bold rounded-full">Low Stock</span>
                      )}
                    </td>
                    <td className="p-3 text-right space-x-2">
                      <button
                        onClick={() => { setShowStockModal(p); setStockAddAmount(50); }}
                        className="text-xs bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 px-2 py-1 rounded"
                      >
                        + Stock-in Form
                      </button>
                      <button
                        onClick={() => {
                          setProductForm({ id: p.id, sku: p.sku, name: p.name, price: p.price, stock_qty: p.stock_qty, min_stock_alert: p.min_stock_alert });
                          setShowProductModal(true);
                        }}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        แก้ไข
                      </button>
                      <button
                        onClick={() => handleToggleProduct(p)}
                        className={`text-xs ${active ? 'text-red-500' : 'text-slate-600'} hover:underline`}
                      >
                        {active ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        {/* Customers Section */}
        <section className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold">👥 รายชื่อลูกค้า (Customers)</h2>
            <button
              onClick={() => {
                setCustomerForm({ id: null, name: '', tax_id: '', address: '' });
                setShowCustomerModal(true);
              }}
              className="text-xs bg-slate-900 hover:bg-slate-800 text-white px-3 py-1.5 rounded-lg"
            >
              + เพิ่มลูกค้า
            </button>
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 font-semibold border-b">
              <tr>
                <th className="p-3">ชื่อลูกค้า</th>
                <th className="p-3">เลขประจำตัวผู้เสียภาษี</th>
                <th className="p-3">ที่อยู่</th>
                <th className="p-3 text-right">การจัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {customers.map((c) => {
                const active = c.is_active !== false;
                return (
                  <tr key={c.id} className={!active ? 'opacity-40 bg-slate-50' : ''}>
                    <td className="p-3 font-medium">{c.name} {!active && <span className="text-xs text-red-500">(Deactivated)</span>}</td>
                    <td className="p-3">{c.tax_id || '-'}</td>
                    <td className="p-3 text-slate-500">{c.address || '-'}</td>
                    <td className="p-3 text-right space-x-2">
                      <button
                        onClick={() => {
                          setCustomerForm({ id: c.id, name: c.name, tax_id: c.tax_id || '', address: c.address || '' });
                          setShowCustomerModal(true);
                        }}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        แก้ไข
                      </button>
                      <button
                        onClick={() => handleToggleCustomer(c)}
                        className={`text-xs ${active ? 'text-red-500' : 'text-slate-600'} hover:underline`}
                      >
                        {active ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        {/* Invoices Section */}
        <section className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 space-y-4">
          <h2 className="text-lg font-bold">📄 ใบแจ้งหนี้และการชำระเงิน (Invoices)</h2>
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 font-semibold border-b">
              <tr>
                <th className="p-3">เลขที่ใบแจ้งหนี้</th>
                <th className="p-3">ยอดรวม (รวม VAT 7%)</th>
                <th className="p-3">สถานะ</th>
                <th className="p-3 text-right">การจัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-slate-400">ยังไม่มีประวัติการออกใบแจ้งหนี้</td>
                </tr>
              ) : (
                invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="p-3 font-medium">{inv.invoice_no}</td>
                    <td className="p-3">{Number(inv.grand_total).toLocaleString()} THB</td>
                    <td className="p-3">
                      <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                        inv.status === 'Paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {inv.status}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      {inv.status !== 'Paid' && (
                        <button
                          onClick={() => handleMarkPaid(inv.id)}
                          className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg shadow-sm"
                        >
                          บันทึกรับเงิน (Mark as Paid)
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      </div>

      {/* จุดที่ 4: MODAL สำหรับเลือกสร้างออเดอร์เองสดๆ */}
      {showOrderModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <form onSubmit={handleCustomOrderSubmit} className="bg-white p-6 rounded-xl max-w-md w-full space-y-4 shadow-xl">
            <h3 className="font-bold text-base text-slate-800">สร้างใบสั่งซื้อใหม่ (Create Custom Order)</h3>
            
            <div>
              <label className="text-xs font-semibold block mb-1 text-slate-700">เลือกลูกค้า:</label>
              <select
                value={orderForm.customerId}
                onChange={(e) => setOrderForm({ ...orderForm, customerId: e.target.value })}
                className="w-full border rounded-lg p-2 text-sm bg-white"
                required
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold block mb-1 text-slate-700">เลือกสินค้า:</label>
              <select
                value={orderForm.productId}
                onChange={(e) => setOrderForm({ ...orderForm, productId: e.target.value })}
                className="w-full border rounded-lg p-2 text-sm bg-white"
                required
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (คงเหลือ: {p.stock_qty} kg, ราคา: {p.price} THB)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold block mb-1 text-slate-700">จำนวนสั่งซื้อ (kg):</label>
              <input
                type="number"
                min="1"
                required
                value={orderForm.quantity}
                onChange={(e) => setOrderForm({ ...orderForm, quantity: parseInt(e.target.value) || 1 })}
                className="w-full border rounded-lg p-2 text-sm"
              />
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setShowOrderModal(false)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold shadow-sm"
              >
                ออกใบสั่งซื้อและตัดสต็อก
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: Stock-in Form */}
      {showStockModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <form onSubmit={handleStockInSubmit} className="bg-white p-6 rounded-xl max-w-sm w-full space-y-4 shadow-xl">
            <h3 className="font-bold text-base text-slate-800">เติมสต็อกสินค้า (Stock-in Form)</h3>
            <p className="text-xs text-slate-500">สินค้า: {showStockModal.name} ({showStockModal.sku})</p>
            <div>
              <label className="text-xs font-semibold block mb-1 text-slate-700">จำนวนที่ต้องการนำเข้า (kg):</label>
              <input
                type="number"
                min="1"
                required
                value={stockAddAmount}
                onChange={(e) => setStockAddAmount(parseInt(e.target.value) || 0)}
                className="w-full border rounded-lg p-2 text-sm"
              />
            </div>
            <div className="flex justify-end space-x-2">
              <button type="button" onClick={() => setShowStockModal(null)} className="px-3 py-1.5 text-xs text-slate-600">ยกเลิก</button>
              <button type="submit" className="px-4 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold shadow-sm">ยืนยันการเติมสต็อก</button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: Product Form */}
      {showProductModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <form onSubmit={handleSaveProduct} className="bg-white p-6 rounded-xl max-w-md w-full space-y-3 shadow-xl">
            <h3 className="font-bold text-base text-slate-800">{productForm.id ? 'แก้ไขสินค้า' : 'สร้างสินค้าใหม่'}</h3>
            <div>
              <label className="text-xs font-semibold block mb-1 text-slate-700">SKU:</label>
              <input required value={productForm.sku} onChange={(e) => setProductForm({ ...productForm, sku: e.target.value })} className="w-full border rounded-lg p-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-semibold block mb-1 text-slate-700">ชื่อสินค้า:</label>
              <input required value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} className="w-full border rounded-lg p-2 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold block mb-1 text-slate-700">ราคา (THB):</label>
                <input type="number" step="0.01" required value={productForm.price} onChange={(e) => setProductForm({ ...productForm, price: e.target.value })} className="w-full border rounded-lg p-2 text-sm" />
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1 text-slate-700">สต็อกคงเหลือ:</label>
                <input type="number" required value={productForm.stock_qty} onChange={(e) => setProductForm({ ...productForm, stock_qty: e.target.value })} className="w-full border rounded-lg p-2 text-sm" />
              </div>
            </div>
            <div className="flex justify-end space-x-2 pt-2">
              <button type="button" onClick={() => setShowProductModal(false)} className="px-3 py-1.5 text-xs text-slate-600">ยกเลิก</button>
              <button type="submit" className="px-4 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold shadow-sm">บันทึก</button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: Customer Form */}
      {showCustomerModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <form onSubmit={handleSaveCustomer} className="bg-white p-6 rounded-xl max-w-md w-full space-y-3 shadow-xl">
            <h3 className="font-bold text-base text-slate-800">{customerForm.id ? 'แก้ไขข้อมูลลูกค้า' : 'สร้างลูกค้าใหม่'}</h3>
            <div>
              <label className="text-xs font-semibold block mb-1 text-slate-700">ชื่อลูกค้า / บริษัท:</label>
              <input required value={customerForm.name} onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })} className="w-full border rounded-lg p-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-semibold block mb-1 text-slate-700">เลขประจำตัวผู้เสียภาษี (Tax ID):</label>
              <input required value={customerForm.tax_id} onChange={(e) => setCustomerForm({ ...customerForm, tax_id: e.target.value })} className="w-full border rounded-lg p-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-semibold block mb-1 text-slate-700">ที่อยู่:</label>
              <textarea value={customerForm.address} onChange={(e) => setCustomerForm({ ...customerForm, address: e.target.value })} className="w-full border rounded-lg p-2 text-sm" rows={2} />
            </div>
            <div className="flex justify-end space-x-2 pt-2">
              <button type="button" onClick={() => setShowCustomerModal(false)} className="px-3 py-1.5 text-xs text-slate-600">ยกเลิก</button>
              <button type="submit" className="px-4 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold shadow-sm">บันทึก</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}