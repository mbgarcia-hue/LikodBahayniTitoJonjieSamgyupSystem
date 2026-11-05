# Entering actual restaurant data

Verified on 23 October 2026. The application already uses SQLite at `data/restaurant.sqlite`, unless the API is launched with a different `DATABASE_PATH`. The customer and staff pages call the Express API; saved orders, payments, inventory and sales do not come from the example arrays in `src/app/data/restaurantData.ts`.

## What is saved where

| Records | SQLite storage |
| --- | --- |
| Tables, menu, inventory, visits, batches, payments and stock movements | JSON document in `dining_state`, row `id=1` |
| Staff identities and password hashes | `staff_users` |
| Staff sessions | `staff_sessions` |
| Workflow audit trail | `dining_events` |

The older `menu_items`, `inventory_items`, `restaurant_tables`, `orders` and `transactions` SQL tables are unused by the current workflow. Empty rows there do not mean that the restaurant has no saved activity. To inspect current dining data with a SQLite viewer, use:

```sql
SELECT json_extract(body, '$.inventory') FROM dining_state WHERE id = 1;
SELECT json_extract(body, '$.orders') FROM dining_state WHERE id = 1;
SELECT json_extract(body, '$.transactions') FROM dining_state WHERE id = 1;
```

Use the application to change records so that workflow validation still runs.

## Menu and prices

The default prices are PHP 220 regular / PHP 195 discounted packages, PHP 35 Coke/Sprite/Royal and PHP 30 iced tea. Included food servings have no additional per-item charge. These menu records are stored in SQLite, initially copied from `server/seed.json`. Editing that seed file does not change an existing database. Owners can change guest package rates and menu item prices/ranges under Owner → Inventory; package rates are snapshotted for each new visit. The original ingredient deduction rules remain in server seed configuration. New products and their stock-per-order links are saved in SQLite through Inventory.

## Add products and control customer menu visibility

Owners and Cashiers can manage stock and products from the same **Inventory** page (`/owner/inventory`, `/cashier/inventory`, or the legacy `/admin/inventory` route). Both roles may select **Add product**, enter the product name, menu category, price per order, stock unit, opening stock, low stock threshold and stock used per order, then **Save product** to create the inventory and customer menu records together. For bottled drinks, use stock unit `bottles` and usage `1`. For a 200 g serving from kilogram stock, use `kg` and usage `0.2`. A price of zero includes the product in the guest package without an additional item charge. Names must be unique, including existing or archived products. Package and menu-item price/range controls are available to Owners only.

Drop a JPEG, PNG or WebP food photo (up to 3 MB) onto the photo area while adding a product. On either the Owner or Cashier inventory view, drop a photo onto an item's thumbnail to replace its menu image. Uploaded images are validated, resized and stored as WebP files in `data/menu-images`. Existing menu items without a custom photo use optimized bundled food images, with a local illustration if a photo cannot load. Customer navigation remains visible while scrolling, and menu cards show consistent cropped food photos alongside item details and stock availability.

Use **Hide from menu** on any active inventory row to remove the linked product from every table menu, including tables added later. **Show on menu** restores it. This visibility choice is saved across restarts and does not change stock quantities or submitted order histories. Customer pages update on their next three-second refresh; stale attempts to submit a hidden product are rejected immediately by the API. Hidden items are removed from unsent draft carts with a notice. Previously submitted items remain visible in order history and bills.

## Expand or hide restaurant tables

Open **Cashier → Tables & Billing** (`/cashier/billing`) and select **Add table**. This single module combines seating, QR codes and billing/POS; old `/cashier/qr-tables` links redirect here. The next table number is assigned automatically, starting after the highest existing number. Its permanent `/customer/:tableNumber` link appears with a distinct QR image. The initial ten tables and all existing records stay unchanged. When opening a visit, the cashier enters its billing name and verifies at least two guests. Customers must enter that exact name and the visit code before receiving menu access.

Select **Hide table** on an available card to remove it from the working floor and QR printing. Hiding is blocked while the table is occupied or awaiting payment, including when all food is served but the visit has not been closed. Hidden tables cannot open new visits or accept new customer joins. Expand **Hidden tables** and select **Show table** to restore the same number and QR link. Existing sessions, payments and order histories remain recorded; closed-visit customer receipts remain accessible through their existing visit tokens. Table additions and visibility flags persist in SQLite across restarts. Dashboard table capacity counts only visible tables.

Archived items stay off customer menus until restored; a separately hidden item remains hidden after restoration until **Show on menu** is selected. Out-of-stock products that are otherwise visible remain listed as unavailable. Owner and Cashier accounts can add products, adjust stock, archive or restore items, and change menu visibility; these permissions are enforced by the API as well as the UI.

Inventory now uses FIFO stock lots. On the first server start with this update, each existing item's current stock is carried into one **opening lot**. Its recorded receive time is when FIFO tracking is enabled; it is not the item's historical supplier delivery date. Zero-stock items start with no opening lot. Each subsequent **Restock** creates a dated lot; enter a positive quantity in the displayed unit and a reason. The oldest lot with remaining quantity is consumed first when a customer submits a batch. If a batch is cancelled before approval, its reservation is returned to the same lot or lots it used.

Expand **FIFO lots** under an item's stock to see each lot's received date, source and remaining quantity. Both Owner and Cashier can review movement records that include the affected lot dates. A positive manual stock adjustment creates a new adjustment lot; reducing a stock count consumes from the oldest lots first. For accurate FIFO going forward, use **Restock** whenever a delivery arrives instead of replacing the current quantity.

At bill review, after all batches are served or cancelled, the Cashier can approve a one-time ₱300 leftover fee for the visit. The Cashier must enter leftover details and confirm the customer was informed. The fee appears on the customer's bill and is retained with the payment and append-only cashier audit event. It cannot be approved more than once for the same visit.

## Enter your counted stock

1. Run `npm run dev` and open `http://localhost:5173/owner/login`.
2. Sign in as Owner and open **Inventory** (`/owner/inventory` or `/admin/inventory`).
3. Count stock before service where possible. The inspected database has two active visits; check and resolve any trial activity through the normal workflow before treating its reports as business records. Existing activity has been preserved, and it cannot be classified as actual sales from its presence in SQLite alone.
4. Click **Edit** for each item. Enter the available quantity in the displayed unit: kilograms, cans or bottles. Do not enter grams in a kilogram field. Submitted batches already reserve stock; exclude quantities reserved for those batches when entering available stock.
5. Select **Save**, wait for **Stock saved.**, then reload to confirm the value. Blank, negative and nonfinite values are rejected; enter `0` deliberately for an out-of-stock item. A failed save keeps the editor open.
6. Repeat for all 16 inventory records. Counts in the starter database were examples and are not a physical stock count.

Customer menu cards use **Add to Batch** to build a private cart. Quantities, removal and submission are handled in **Your cart**. Only submission reserves stock. The cashier approves the first pending batch for a visit; queued and later follow-up batches then go directly to the kitchen, with separate system routing records and read-only cashier history. New visits require a fresh initial approval. Cancelled unapproved batches release their reservation. Sales reports derive from saved, cashier-confirmed payments. The online payment option records a manually verified reference; it does not collect or independently verify money through a payment provider.

## Preserve the database when hosting

Run the frontend and API against the same persistent database. A static frontend upload alone cannot serve the database API. On a persistent server, set `DATABASE_PATH` to an absolute path on the persistent disk before starting the API. Keep the same path across restarts/deployments: choosing a new path creates a new database with starter menu/stock.

Use SQLite's backup API for consistent backups, including committed WAL data. Do not copy only the main `.sqlite` file while the server is writing. Keep backups private because they contain restaurant records and authentication material. Do not overwrite this database or delete trial records without a reviewed migration/reset decision.

The test suites use separate temporary databases. The API integration test now also starts a second Node process against its saved test database and verifies that stock, visits, orders and payments survive initialization without reseeding.
