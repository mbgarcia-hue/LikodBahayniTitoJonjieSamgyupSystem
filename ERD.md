# Restaurant Management System ERD

The diagram distinguishes relational SQLite tables from the dining data stored
as JSON. `dining_state.body` is the current source for tables, visits, orders,
payments, menu, and inventory. Those JSON relationships are maintained by the
application; they are not SQLite foreign-key constraints. The separate
`menu_items`, `inventory_items`, `orders`, `restaurant_tables`, and
`transactions` tables are also present in the database as legacy flat tables.

```mermaid
erDiagram
    STAFF_USERS {
        TEXT id PK
        TEXT username UK
        TEXT password_hash
        TEXT role
        TEXT full_name
        TEXT email
        TEXT phone
    }

    STAFF_SESSIONS {
        TEXT token_hash PK
        TEXT user_id FK
        INTEGER expires_at
    }

    DINING_STATE {
        INTEGER id PK
        TEXT body "JSON aggregate"
    }

    DINING_TABLE {
        INTEGER id
        TEXT qrCode
        TEXT status
        BOOLEAN hidden
    }

    VISIT_SESSION {
        TEXT id
        TEXT code
        INTEGER tableNumber
        TEXT customerName
        TEXT status
        DATETIME openedAt
        DATETIME closedAt
        INTEGER regularPax
        INTEGER discountedPax
        DECIMAL packageTotal
    }

    DINING_ORDER {
        TEXT id
        TEXT sessionId
        INTEGER tableNumber
        INTEGER batchNumber
        TEXT status
        DATETIME timeOrdered
        DECIMAL totalAmount
        TEXT customerNotes
        TEXT approvedBy
    }

    ORDER_ITEM {
        TEXT menuItemId
        TEXT name
        DECIMAL price
        INTEGER quantity
    }

    PAYMENT_TRANSACTION {
        TEXT id
        TEXT sessionId
        INTEGER tableNumber
        DECIMAL totalBill
        TEXT paymentMethod
        DATETIME timestamp
        TEXT reference
    }

    MENU_ITEM {
        TEXT id
        TEXT name
        TEXT category
        DECIMAL price
        BOOLEAN available
    }

    INVENTORY_ITEM {
        TEXT id
        TEXT name
        DECIMAL currentStock
        TEXT unit
        DECIMAL lowStockThreshold
        BOOLEAN archived
        BOOLEAN hiddenFromMenu
    }

    STOCK_LOT {
        TEXT id
        TEXT inventoryItemId
        DECIMAL quantity
        DECIMAL remainingQuantity
        DATETIME receivedAt
        TEXT source
    }

    INVENTORY_MOVEMENT {
        TEXT id
        TEXT itemId
        TEXT orderId
        TEXT type
        DECIMAL quantity
        TEXT reason
        DATETIME timestamp
        TEXT actorId
    }

    DINING_EVENT {
        TEXT id PK
        TEXT session_id
        TEXT order_id
        TEXT event_type
        TEXT actor_role
        TEXT actor_id
        DATETIME timestamp
        TEXT details_json
    }

    %% Legacy flat SQLite tables, retained separately from dining_state JSON.
    LEGACY_MENU_ITEMS {
        TEXT id PK
        TEXT name
        TEXT category
        REAL price
        TEXT description
        TEXT image
        INTEGER available
    }

    LEGACY_INVENTORY_ITEMS {
        TEXT id PK
        TEXT name
        REAL current_stock
        TEXT unit
        REAL low_stock_threshold
        TEXT last_updated
        INTEGER archived
    }

    LEGACY_RESTAURANT_TABLES {
        INTEGER id PK
        TEXT qr_code UK
        TEXT status
        TEXT current_order_id
    }

    LEGACY_ORDERS {
        TEXT id PK
        INTEGER table_number
        TEXT items_json
        TEXT status
        TEXT time_ordered
        REAL total_amount
        TEXT customer_notes
    }

    LEGACY_TRANSACTIONS {
        TEXT id PK
        INTEGER table_number
        REAL total_bill
        TEXT payment_method
        TEXT timestamp
    }

    STAFF_USERS ||--o{ STAFF_SESSIONS : "has"
    DINING_STATE ||--o{ DINING_TABLE : "contains"
    DINING_STATE ||--o{ VISIT_SESSION : "contains"
    DINING_STATE ||--o{ DINING_ORDER : "contains"
    DINING_STATE ||--o{ PAYMENT_TRANSACTION : "contains"
    DINING_STATE ||--o{ MENU_ITEM : "contains"
    DINING_STATE ||--o{ INVENTORY_ITEM : "contains"
    DINING_STATE ||--o{ INVENTORY_MOVEMENT : "contains"
    DINING_TABLE ||--o{ VISIT_SESSION : "tableNumber (history)"
    VISIT_SESSION ||--o{ DINING_ORDER : "sessionId"
    VISIT_SESSION ||--o{ PAYMENT_TRANSACTION : "sessionId"
    DINING_ORDER ||--|{ ORDER_ITEM : "items (embedded)"
    MENU_ITEM ||--o{ ORDER_ITEM : "menuItemId"
    INVENTORY_ITEM ||--o{ STOCK_LOT : "stockLots (embedded)"
    INVENTORY_ITEM ||--o{ INVENTORY_MOVEMENT : "itemId"
```

## Relationship and storage notes

- `STAFF_SESSIONS.user_id` is the only explicit foreign key in the relational
  schema; it references `STAFF_USERS.id` with `ON DELETE CASCADE`.
- Visit/session, order, transaction, menu, inventory, and stock-lot records are
  embedded in the single `dining_state.body` JSON document. The ERD shows their
  logical relationships, not separate SQL tables.
- `DINING_EVENT.session_id` and `order_id` are audit references stored as text;
  they are not declared foreign keys.
- The legacy flat tables are shown separately because their columns are real
  SQLite tables, but the live dining workflow stores its current records in
  `dining_state`.
