import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { role, customer_id, product_id, quantity } = body;

    // US-3: Server blocks the wrong role with 403
    if (role !== 'Sales' && role !== 'Admin') {
      return NextResponse.json(
        { error: '403 Forbidden: Only Sales or Admin can place orders.' },
        { status: 403 }
      );
    }

    // ตรวจสอบข้อมูลสินค้าและสต็อก
    const { data: product, error: pErr } = await supabase
      .from('products')
      .select('*')
      .eq('id', product_id)
      .single();

    if (pErr || !product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    if (product.stock_qty < quantity) {
      return NextResponse.json({ error: 'Too little stock, order cancelled' }, { status: 400 });
    }

    // คำนวณยอด 7% VAT
    const unitPrice = Number(product.price);
    const subtotal = unitPrice * quantity;
    const vat = Math.round(subtotal * 0.07 * 100) / 100;
    const grandTotal = subtotal + vat;

    // 1. ตัดสต็อก
    const { error: stockErr } = await supabase
      .from('products')
      .update({ stock_qty: product.stock_qty - quantity })
      .eq('id', product_id);

    if (stockErr) {
      return NextResponse.json({ error: 'Failed to update stock: ' + stockErr.message }, { status: 500 });
    }

    // 2. สร้าง Order
    const { data: orderData, error: orderErr } = await supabase
      .from('orders')
      .insert([
        {
          customer_id,
          status: 'Confirmed',
          subtotal,
          vat_amount: vat,
          grand_total: grandTotal,
        },
      ])
      .select();

    if (orderErr || !orderData || orderData.length === 0) {
      return NextResponse.json({ error: 'Failed to create order: ' + (orderErr?.message || 'Unknown error') }, { status: 500 });
    }

    const createdOrder = orderData[0];

    // 3. สร้าง Order Item
    await supabase.from('order_items').insert([
      {
        order_id: createdOrder.id,
        product_id,
        quantity,
        unit_price: unitPrice,
      },
    ]);

    // 4. หาลำดับบิลล่าสุดเพื่อสร้าง INV-000x
    const { count } = await supabase.from('invoices').select('*', { count: 'exact', head: true });
    const invoiceNo = `INV-${String((count || 0) + 1).padStart(4, '0')}`;

    // 5. สร้าง Invoice
    const { data: invData, error: invErr } = await supabase
      .from('invoices')
      .insert([
        {
          order_id: createdOrder.id,
          invoice_no: invoiceNo,
          status: 'Unpaid',
          grand_total: grandTotal,
        },
      ])
      .select();

    if (invErr) {
      return NextResponse.json({ error: 'Failed to create invoice: ' + invErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, invoice: invData ? invData[0] : null });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}