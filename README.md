# Siam Bean Co. - Mini ERP

Mini ERP system integrating Sales, Warehouse, and Accounting workflows on a shared PostgreSQL database.

## System Architecture & Live Demo
- **Frontend & Fullstack**: Next.js (App Router), Tailwind CSS
- **Database & Auth**: Supabase (PostgreSQL)

## Relational Database Schema (ER Diagram)

\`\`\`mermaid
erDiagram
    PROFILES {
        uuid id PK
        string email
        string role
    }

    PRODUCTS {
        int id PK
        string sku UK
        string name
        numeric price
        int stock_qty
        int min_stock_alert
        boolean is_active
    }

    CUSTOMERS {
        int id PK
        string name
        string tax_id
        string address
        boolean is_active
    }

    ORDERS {
        int id PK
        int customer_id FK
        string status
        numeric subtotal
        numeric vat_amount
        numeric grand_total
        timestamptz created_at
    }

    ORDER_ITEMS {
        int id PK
        int order_id FK
        int product_id FK
        int quantity
        numeric unit_price
    }

    INVOICES {
        int id PK
        int order_id FK
        string invoice_no UK
        string status
        numeric grand_total
        timestamptz created_at
    }

    CUSTOMERS ||--o{ ORDERS : places
    ORDERS ||--|{ ORDER_ITEMS : contains
    PRODUCTS ||--o{ ORDER_ITEMS : includes
    ORDERS ||--|| INVOICES : generates
\`\`\`

## Business Logic Rules
1. **Sales Order (US-1)**: Confirming an order checks stock. If sufficient, updates stock, creates order, and generates `INV-000x` with 7% VAT.
2. **Stock Management (US-2)**: Real-time stock decrement upon order confirmation; stock-in mechanism; low-stock badges.
3. **Role Authorization (US-3)**: Role-based permissions preventing unauthorized actions (e.g., Warehouse receiving 403 when trying to issue invoices).
4. **Payments (US-4)**: Recording payment updates invoice status to `Paid` and updates total sales figures.