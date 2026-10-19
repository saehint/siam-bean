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

    // ตรวจสอบสต็อก
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
    await supabase
      .from('products')
      .update({ stock_qty: product.stock_qty - quantity })
      .eq('id', product_id);

    // 2. สร้าง Order
    const { data: newOrder } = await supabase
      .from('orders')
      .insert({
        customer_id,
        status: 'Confirmed',
        subtotal,
        vat_amount: vat,
        grand_total: grandTotal,
      })
      .select()
      .single();

    // 3. สร้าง Order Item
    await supabase.from('order_items').insert({
      order_id: newOrder.id,
      product_id,
      quantity,
      unit_price: unitPrice,
    });

    // 4. หาลำดับบิลล่าสุดเพื่อสร้าง INV-000x
    const { count } = await supabase.from('invoices').select('*', { count: 'exact', head: true });
    const invoiceNo = `INV-${String((count || 0) + 1).padStart(4, '0')}`;

    const { data: invoice } = await supabase
      .from('invoices')
      .insert({
        order_id: newOrder.id,
        invoice_no: invoiceNo,
        status: 'Unpaid',
        grand_total: grandTotal,
      })
      .select()
      .single();

    return NextResponse.json({ success: true, invoice });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}