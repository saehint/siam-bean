"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ShoppingCart, Package, Users, ShieldAlert, CheckCircle, FileText, AlertTriangle } from "lucide-react";

type Role = "Admin" | "Sales" | "Warehouse" | "Accountant";

export default function MiniERP() {
  // สลับ Role สำหรับการ Demo
  const [currentRole, setCurrentRole] = useState<Role>("Sales");

  // ข้อมูลในระบบ
  const [products, setProducts] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  
  // แจ้งเตือน และ ข้อความ Error
  const [notification, setNotification] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // โหลดข้อมูลเริ่มต้น
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const { data: prodData } = await supabase.from("products").select("*").order("id");
    const { data: custData } = await supabase.from("customers").select("*").order("id");
    const { data: invData } = await supabase.from("invoices").select("*").order("id", { ascending: false });

    if (prodData) setProducts(prodData);
    if (custData) setCustomers(custData);
    if (invData) setInvoices(invData);
  };

  const showMsg = (type: "success" | "error", text: string) => {
    setNotification({ type, text });
    setTimeout(() => setNotification(null), 5000);
  };

  // US-1: Sales order -> invoice + คำนวณ VAT 7% + ตัดสต็อก
  const handleCreateOrderAndInvoice = async () => {
    // กฎ Role: เฉพาะ Sales หรือ Admin เท่านั้นที่เปิดบิลได้
    if (currentRole !== "Sales" && currentRole !== "Admin") {
      showMsg("error", "403 Forbidden: คุณไม่มีสิทธิ์ออกบิลคำสั่งซื้อ (ต้องเป็น Role: Sales หรือ Admin)");
      return;
    }

    const targetProduct = products.find((p) => p.sku === "ARB-1KG");
    const targetCustomer = customers.find((c) => c.name === "Café Lune");

    if (!targetProduct || !targetCustomer) {
      showMsg("error", "ไม่พบข้อมูลสินค้า ARB-1KG หรือลูกค้า Café Lune");
      return;
    }

    const orderQty = 20;

    // เช็คสต็อก: Too little stock = error
    if (targetProduct.stock_qty < orderQty) {
      showMsg("error", `สต็อกไม่เพียงพอ! เหลือเพียง ${targetProduct.stock_qty} kg (ต้องการ ${orderQty} kg)`);
      return;
    }

    // คำนวณเงิน + VAT 7%
    const subtotal = orderQty * targetProduct.price; // 20 * 450 = 9,000
    const vat = subtotal * 0.07; // 630
    const grandTotal = subtotal + vat; // 9,630

    // 1. ตัดสต็อก
    const newStock = targetProduct.stock_qty - orderQty;
    const { error: stockErr } = await supabase
      .from("products")
      .update({ stock_qty: newStock })
      .eq("id", targetProduct.id);

    if (stockErr) {
      showMsg("error", "เกิดข้อผิดพลาดในการตัดสต็อก");
      return;
    }

    // 2. สร้าง Order
    const { data: orderData, error: orderErr } = await supabase
      .from("orders")
      .insert({
        customer_id: targetCustomer.id,
        status: "confirmed",
        subtotal: subtotal,
        vat_amount: vat,
        grand_total: grandTotal,
      })
      .select()
      .single();

    if (orderErr) {
      showMsg("error", "เกิดข้อผิดพลาดในการสร้าง Order");
      return;
    }

    // 3. สร้าง Invoice INV-000x
    const invoiceNo = `INV-000${invoices.length + 1}`;
    const { error: invErr } = await supabase.from("invoices").insert({
      order_id: orderData.id,
      invoice_no: invoiceNo,
      status: "unpaid",
      grand_total: grandTotal,
    });

    if (invErr) {
      showMsg("error", "เกิดข้อผิดพลาดในการออก Invoice");
      return;
    }

    showMsg("success", `สำเร็จ! บันทึกคำสั่งซื้อและสร้าง ${invoiceNo} ยอด ${grandTotal.toLocaleString()} THB (สต็อกคงเหลือ ${newStock} kg)`);
    fetchData();
  };

  // US-4: Accountant รับชำระเงิน
  const handleMarkPaid = async (invoiceId: number) => {
    if (currentRole !== "Accountant" && currentRole !== "Admin") {
      showMsg("error", "403 Forbidden: คุณไม่มีสิทธิ์บันทึกการรับชำระเงิน (ต้องเป็น Role: Accountant)");
      return;
    }

    const { error } = await supabase
      .from("invoices")
      .update({ status: "paid" })
      .eq("id", invoiceId);

    if (error) {
      showMsg("error", "ไม่สามารถบันทึกการชำระเงินได้");
    } else {
      showMsg("success", "บันทึกการชำระเงินสำเร็จ สถานะเปลี่ยนเป็น Paid เรียบร้อย");
      fetchData();
    }
  };

  // US-2: ฝ่ายคลังเติมสต็อก (Stock-in)
  const handleStockIn = async (productId: number, currentQty: number) => {
    if (currentRole !== "Warehouse" && currentRole !== "Admin") {
      showMsg("error", "403 Forbidden: คุณไม่มีสิทธิ์เติมสต็อก (ต้องเป็น Role: Warehouse)");
      return;
    }

    const addQty = 50;
    const { error } = await supabase
      .from("products")
      .update({ stock_qty: currentQty + addQty })
      .eq("id", productId);

    if (error) {
      showMsg("error", "เติมสต็อกไม่สำเร็จ");
    } else {
      showMsg("success", `เติมสต็อกเพิ่ม 50 kg สำเร็จ!`);
      fetchData();
    }
  };

  // ตัวเลข Dashboard
  const totalSales = invoices.reduce((sum, inv) => sum + (inv.status === "paid" ? Number(inv.grand_total) : 0), 0);
  const lowStockCount = products.filter((p) => p.stock_qty <= p.min_stock_alert).length;
  const openInvoicesCount = invoices.filter((inv) => inv.status === "unpaid").length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-6 font-sans">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header & Role Switcher */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Siam Bean Co. - Mini ERP</h1>
            <p className="text-sm text-slate-500">ระบบบริหารจัดการฝ่ายขาย คลัง และบัญชี</p>
          </div>

          <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-lg border border-slate-200">
            <span className="text-xs font-semibold px-2 text-slate-600">สลับบทบาท (Demo):</span>
            {(["Admin", "Sales", "Warehouse", "Accountant"] as Role[]).map((role) => (
              <button
                key={role}
                onClick={() => setCurrentRole(role)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition ${
                  currentRole === role
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-200"
                }`}
              >
                {role}
              </button>
            ))}
          </div>
        </header>

        {/* แจ้งเตือน Alert */}
        {notification && (
          <div
            className={`p-4 rounded-lg flex items-center gap-3 text-sm font-semibold border ${
              notification.type === "success"
                ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                : "bg-rose-50 text-rose-800 border-rose-200"
            }`}
          >
            {notification.type === "success" ? <CheckCircle className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
            {notification.text}
          </div>
        )}

        {/* Dashboard 3 ตัวเลขตามโจทย์ */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Paid Sales</span>
            <div className="text-2xl font-extrabold text-emerald-600 mt-2">
              {totalSales.toLocaleString()} THB
            </div>
            <p className="text-xs text-slate-400 mt-1">ยอดขายที่ชำระเงินแล้ว</p>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Low-stock Alert</span>
            <div className={`text-2xl font-extrabold mt-2 ${lowStockCount > 0 ? "text-amber-500" : "text-slate-800"}`}>
              {lowStockCount} รายการ
            </div>
            <p className="text-xs text-slate-400 mt-1">สินค้าที่สต็อกต่ำกว่าเกณฑ์</p>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Open Invoices</span>
            <div className="text-2xl font-extrabold text-blue-600 mt-2">
              {openInvoicesCount} ใบ
            </div>
            <p className="text-xs text-slate-400 mt-1">ใบแจ้งหนี้ที่รอชำระเงิน</p>
          </div>
        </section>

        {/* การสั่งซื้อจำลอง US-1 Demo Area */}
        <section className="bg-blue-50 border border-blue-200 p-5 rounded-xl">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h2 className="text-base font-bold text-blue-900 flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-blue-600" />
                เคสทดสอบตามโจทย์: Café Lune สั่งซื้อ 20 kg (ARB-1KG)
              </h2>
              <p className="text-xs text-blue-700 mt-1">
                ราคา 450 THB/kg × 20 kg = 9,000 THB + VAT 7% (630 THB) = รวม 9,630 THB
              </p>
            </div>
            <button
              onClick={handleCreateOrderAndInvoice}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm rounded-lg shadow-sm transition whitespace-nowrap"
            >
              ยืนยันคำสั่งซื้อ (Confirm Order)
            </button>
          </div>
        </section>

        {/* ตารางสินค้า & สต็อก (US-2) */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex justify-between items-center">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <Package className="w-4 h-4 text-slate-500" /> สต็อกสินค้า (Products & Stock)
            </h3>
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 border-b border-slate-100">
              <tr>
                <th className="p-3">SKU</th>
                <th className="p-3">ชื่อสินค้า</th>
                <th className="p-3">ราคา/หน่วย</th>
                <th className="p-3">สต็อกคงเหลือ</th>
                <th className="p-3 text-right">การจัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {products.map((p) => {
                const isLow = p.stock_qty <= p.min_stock_alert;
                return (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="p-3 font-semibold text-slate-700">{p.sku}</td>
                    <td className="p-3">{p.name}</td>
                    <td className="p-3">{Number(p.price).toLocaleString()} THB</td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <span className="font-bold">{p.stock_qty} kg</span>
                        {isLow && (
                          <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 text-xs px-2 py-0.5 rounded-full font-medium">
                            <AlertTriangle className="w-3 h-3" /> Low Stock
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => handleStockIn(p.id, p.stock_qty)}
                        className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs rounded border font-medium"
                      >
                        + เติม 50 kg (Stock-in)
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        {/* ตารางใบแจ้งหนี้และการชำระเงิน (US-1 & US-4) */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <FileText className="w-4 h-4 text-slate-500" /> ใบแจ้งหนี้ (Invoices & Payments)
            </h3>
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 border-b border-slate-100">
              <tr>
                <th className="p-3">เลขที่ใบแจ้งหนี้</th>
                <th className="p-3">ยอดรวม (รวม VAT 7%)</th>
                <th className="p-3">สถานะ</th>
                <th className="p-3 text-right">การจัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-slate-400">ยังไม่มีประวัติการออกใบแจ้งหนี้</td>
                </tr>
              ) : (
                invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50">
                    <td className="p-3 font-semibold text-slate-800">{inv.invoice_no}</td>
                    <td className="p-3 font-medium">{Number(inv.grand_total).toLocaleString()} THB</td>
                    <td className="p-3">
                      <span
                        className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                          inv.status === "paid"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {inv.status === "paid" ? "Paid (ชำระแล้ว)" : "Unpaid (รอชำระ)"}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      {inv.status === "unpaid" && (
                        <button
                          onClick={() => handleMarkPaid(inv.id)}
                          className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs rounded font-medium shadow-sm"
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
    </div>
  );
}