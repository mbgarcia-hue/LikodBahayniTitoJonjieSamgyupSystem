# LikodBahayniTitoJonjieSamgyupSystem

Restaurant Management System for Likod Bahay ni Tito Jonjie.

React/Vite frontend with an Express/SQLite backend. The dining workflow starts with **10 tables** and supports adding more, each with its own permanent QR link.

## Run

```powershell
npm install
npm run dev
```

The development frontend listens on port 5173 and proxies `/api` to port 3001. For production, run `npm run build`, then `npm start` (frontend and API on port 3001). Restart the API after updating server code.

Run only one development instance. If Vite reports **Port 5173 is already in use**, open `http://localhost:5173` to use the existing instance, or stop the original `npm run dev` terminal with Ctrl+C before restarting. When Vite fails, `concurrently -k` also stops the API launched alongside it. Keep the frontend on 5173 so printed development QR links continue to work.

## Staff accounts

| Role | Username | Initial password |
| --- | --- | --- |
| Cashier | cashier | Cashier@123 |
| Kitchen | kitchen | Kitchen@123 |
| Owner | owner | Owner@123 |

Use **Profile Settings** to save your details and change your password. Kitchen staff can open **My profile** from their dashboard. Password changes revoke other sessions. Bootstrap passwords can be supplied through CASHIER_PASSWORD, KITCHEN_PASSWORD and OWNER_PASSWORD **before the accounts are first created**. Existing accounts/passwords are never overwritten on restart. STAFF_PIN is no longer used.

Passwords are salted and hashed using scrypt. Staff session tokens are hashed in SQLite and expire after eight hours; logout revokes the server session. API restarts preserve valid sessions. No password or session token is included in staff identity responses.

Cashiers manage tables, inventory and confirmed payments. Kitchen accounts can view active kitchen orders and advance preparation statuses; they cannot access payment records, visit codes or inventory controls. Owners have management API permissions. Page guards enforce the selected role; legacy admin pages require the owner account. Legacy admin login/register links open the owner login, without public account registration.

## Seat a group and print the table QR codes

**Tables & Billing** is the combined table, QR and billing/POS module at `/cashier/billing` (or `/admin/billing` for owners using the admin layout). The former `/qr-tables` routes redirect here. Cashier sign-in opens this combined page.

Use **Add table** under Tables & Billing to allocate the next table number and a unique customer QR link. Use **Hide table** to move an available table into **Hidden tables**, then **Show table** to restore it with the same QR identity. Active visits must be paid and closed before their table can be hidden. Hidden tables reject new visits and customer joining, are excluded from QR printing and do not delete past activity.

1. Sign in through Cashier. Open **Tables & Billing** for seating, QR codes and payment.
2. Enter the website address customers can reach and choose **Update QR links**. Use your hosted HTTPS origin or your computer's Wi-Fi/LAN address, such as `http://192.168.1.20:5173`. Phones must be on the same network for a LAN address, and the computer/firewall must allow the port. Do not print localhost links for phones.
3. Choose **Print N QR codes** to print all currently visible tables. Each QR encodes `/customer/:tableNumber`, including any newly added tables; it does not contain a visit code.
4. At the appropriate table, enter staff-verified regular and discounted guest counts and choose **Open dining session**. Package prices are PHP 220 regular and PHP 195 discounted.
5. Give the displayed six-digit visit code to that group. Other phones at the same table join using the same code.

## Customer, cashier and kitchen flow

- Staff opens the table visit and verifies regular/discounted guests. The package is charged once per visit.
- Customers scan the table QR and join with the current visit code. **Add to Batch** stores one serving in their private cart per click. Under **Your cart**, customers adjust quantities, remove items, add notes and select **Submit batch**. Drafts survive reloads; adding to the cart alone does not create an order.
- The first pending batch starts as **Submitted / Awaiting first batch approval**. Other submissions before that approval queue behind it. Stock is reserved atomically at submission so concurrent phones cannot oversell. Client prices are ignored in favor of server prices.
- Cashiers review the first batch's items, quantities, prices, notes and subtotal, then select **Approve & send to kitchen** once for that dining visit. The same transaction releases queued follow-up batches. If the initial batch is cancelled, the next pending batch requires that approval instead.
- After the initial approval, all phones in that visit submit new batches directly to the kitchen with an automatic-routing audit event. Cashiers see these as read-only records under Orders and Tables & Billing; there is no additional approval step. A fresh visit at the same table requires its own initial approval.
- Kitchen staff accept each dispatched batch to start Preparing, then mark it Ready to serve and Served. A cashier may confirm delivery for the manually approved initial batch; follow-up service updates belong to the kitchen (or an authorized owner).
- Customers can submit more batches while the visit is open. Existing batch contents and prices stay unchanged. Cashier confirmation still closes the complete visit after all non-cancelled batches have been served.
- Before approval, a cashier may cancel a batch with a reason under Orders. Cancellation releases its stock reservation once and excludes its charges. Approved batches cannot be edited or cancelled through this workflow.
- **Finish ordering & request bill** pauses new submissions while existing batches continue through verification and service. Staff can reopen ordering if requested.
- Cashiers review every batch, guest package discounts, optional additional bill discounts, and the final total. The server rejects payment/closure until every batch is served or cancelled before approval. The UI lists blocking batches and disables closure.
- Cash payment requires sufficient cash; online payment requires a manually verified reference. Stale bill totals are rejected. Confirmation saves the payment and closes the visit atomically.
- Closing preserves Served statuses and full histories, marks the table available, and allows a fresh visit/code for the next group. Old phones cannot order in that next group's visit.
- Session and batch changes, verification identities, discounts and payment snapshots are saved in append-only SQLite audit events. Open **Session audit trail** in a table card or a confirmed-payment record to review them.

See [WORKFLOW.md](WORKFLOW.md) for status rules, API details, migration behavior and test coverage.

## Storage and compatibility

See [DATABASE_SETUP.md](DATABASE_SETUP.md) for the verified storage locations and instructions for replacing example stock with your physical counts while preserving existing activity.

Cashiers and owners can use **Inventory → Add product** to save a new inventory item and customer menu entry together, including price and stock usage per order. Each inventory row has **Hide from menu / Show on menu** controls that apply across every table menu, including newly added tables. Hiding preserves stock and previously submitted orders; the API rejects new orders for hidden products. See the database guide for quantities, units and visibility details.

The SQLite file is `data/restaurant.sqlite` (override with `DATABASE_PATH`). The new persistent workflow uses the `dining_state` table; the previous generic resource tables are preserved but are not used or migrated into the new workflow. The initial new workflow starts with empty orders/payments and the existing demo menu/inventory as starting stock. Inventory screens read shared stock. Owner sales totals and charts use saved payments and the Asia/Manila calendar; product rankings count orders belonging to paid visits.

The old generic CRUD API has been removed to prevent changes that bypass dining validation. Use `/api/dining/*`. Staff identities are stored in `staff_users`, authenticated sessions in `staff_sessions`, and workflow audit events in `dining_events`. Account schema creation preserves existing dining records and the legacy resource tables.

## Verification

```powershell
npm test
npm run build
npm run test:browser
```

The integration test uses its own temporary database. It checks ten distinct QR images, staff/customer access, table isolation, shared orders, server-calculated totals, stock validation, duplicate requests, kitchen status, bill pauses, cashier-only payment, and clean table reuse. Physical phone scanning and printer layout should be checked on the actual restaurant network before service.

Browser tests use a separate SQLite database under `tests/.tmp` and the installed Chrome browser (override `CHROME_PATH` if necessary). Login screenshots and failure traces are saved under `test-results`. See `REVIEW.md` for the root-cause review and verification scope.
