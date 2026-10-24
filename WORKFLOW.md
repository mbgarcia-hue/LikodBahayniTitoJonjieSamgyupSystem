# QR ordering with first-batch approval

The system starts with ten permanent QR links for tables 1–10. Cashiers and owners can add further tables with distinct numbers and permanent QR links. A table visit identifies the current group; numbered order batches belong to that visit. A batch reaching Served does not close the visit.

| Batch state | Who can advance it | Next state |
| --- | --- | --- |
| Submitted | Cashier/owner after reviewing items, quantities and captured server prices | Approved |
| Submitted follow-up | System after the visit's initial batch is approved | Approved / dispatched directly to kitchen |
| Submitted | Cashier/owner with a cancellation reason | Cancelled |
| Approved | Kitchen/owner after accepting the batch | Preparing |
| Preparing | Kitchen/owner | Ready to serve |
| Ready to serve | Kitchen/owner; cashier may confirm the manually approved initial batch | Served |
| Served or Cancelled | No further changes | Retained for reporting/audit |

Customers use **Add to Batch** on menu cards, then adjust quantities or remove items in **Your cart** and select **Submit batch**. Adding to the cart is private and does not create or reserve an order. Cart drafts persist locally across reloads.

Only the first pending batch of each visit needs cashier/owner approval. Additional submissions made before that approval remain queued; approving the first batch releases them atomically. Later submissions go directly to the kitchen. The gate is shared across every phone in that visit and resets for the next visit at the same table. A cancelled first batch does not authorize the visit: the next pending batch must be approved.

Batch submission and initial approval are separate from finishing the visit. More batches may be submitted while the visit is Open. A bill request changes it to Pending payment and pauses new submissions. Existing batches continue through the kitchen. Staff may reopen ordering without losing the initial approval. Closure requires Pending payment, no unresolved batches, a current bill total and confirmed payment.

## Where to use it

- Customer: scan `/customer/:tableNumber`, join the current visit, browse, adjust quantities, submit a batch and track its history under Table orders & bill.
- Cashier: **Orders** shows pending verification and all batch history. The combined **Tables & Billing** module contains QR codes, table management, review details, approval actions, final-bill blockers, discounts and payment controls. `/cashier/qr-tables` redirects to `/cashier/billing`; the matching admin alias also redirects to its billing page.
- Kitchen: **Approved batches** contains the cashier-approved initial batch and automatically routed follow-ups from active visits. Review notes/items, accept, mark ready, and confirm served. Cashier follow-up records have no approval or service-update controls.
- Historical payment records and active table cards expose **Session audit trail**. Old batch contents remain recorded after table reuse.

## Server rules

1. Submission validates menu identity, quantities, notes, aggregate ingredient demand and a request ID. It captures server prices, assigns the next batch number and reserves stock in one SQLite transaction. Retries return the same batch without another reservation.
2. Initial approval checks the first pending batch and its reviewed subtotal, stores the actual verifier identity/time and adds an audit event. The transaction dispatches queued follow-ups automatically. A later batch cannot be approved ahead of the initial pending batch. Subsequent submissions are dispatched automatically with `approvalType: automatic` and `initialApprovalOrderId`; system events do not invent a cashier reviewer. Retried submissions/approvals do not add another stock reservation or routing event. Kitchen/customer requests cannot authorize the visit.
3. Each kitchen transition is checked on the server. A cashier may only advance the manually approved initial Ready batch to Served. Automatic follow-ups are read-only for cashiers; kitchen/owner staff confirm service. Batch contents cannot be changed through the status endpoint.
4. Cancellation is allowed only before approval. It requires a reason, refunds the captured reservation once and removes the batch from bill and sales-product totals. A cancellation that would leave the discount greater than the bill is rolled back, including its audit event and stock changes.
5. A final bill includes the guest package once, non-cancelled batch extras and any recorded additional discount. Payment must include `expectedTotal`; a stale total is rejected. Both cash and manual online-payment inputs are validated.
6. A pending/approved/preparing/ready batch blocks closure. Payment and session closure are committed together. Served batches are not rewritten as Completed. A repeated payment request returns the existing transaction.
7. Audit events record staff identity, times, transitions, approvals, discounts, payment details and closure. SQLite triggers reject updates/deletions of these event rows. Kitchen responses omit unapproved work, visit credentials and financial history.

## API additions

| Endpoint | Purpose |
| --- | --- |
| `GET /api/dining/tables/:id` | Public, noncached lookup of a visible table's ID; no visit credentials returned |
| `POST /api/dining/tables` | Cashier/owner adds the next table number with an empty JSON object |
| `PATCH /api/dining/tables/:id` | Cashier/owner sets `{ "hidden": true/false }`; hiding requires an available table without an active visit |
| `POST /api/dining/visits/:id/orders` | Submit a new batch using a customer visit token |
| `POST /api/dining/orders/:id/approve` | Cashier verification with `expectedTotal` |
| `POST /api/dining/orders/:id/cancel` | Cancel an unapproved batch with `reason` |
| `PATCH /api/dining/orders/:id` | Validated kitchen/service status transition |
| `PATCH /api/dining/visits/:id/discount` | Staff-approved additional discount and reason |
| `POST /api/dining/visits/:id/pay` | Validate service completion and payment; close atomically |
| `GET /api/dining/visits/:id/audit` | Management-only append-only session event history |

## Data preservation and migration

The authoritative dining records remain in `dining_state`; the unused legacy resource tables are preserved. `dining_events` stores the new audit log. Workflow version 2 adds batch numbers and histories, and maps older Pending batches to Submitted for cashier verification. Existing Preparing/Ready/Served/Completed records retain their actual historical status and are marked as legacy records; no cashier identity or approval is invented for past work.

The initial approval gate recognizes an existing non-cancelled batch with an actual saved staff approver and approval time. Historical preparation statuses alone do not authorize automatic routing. On startup, queued batches in already verified active visits are released with new system routing events; closed visits remain unchanged. This does not reserve stock again or rewrite captured items/prices. New visits inherit no approval from previous groups.

Table creation and visibility updates use the same atomic state transaction. New numbers exceed the highest saved number, including hidden tables; numbers and QR identities are never reassigned by hiding/restoration. Existing tables without a `hidden` flag remain visible without a migration. Hiding removes the card from the working floor and QR sheet, and disables fresh customer lookup/join and visit creation. It preserves session/order/payment history and existing closed-visit customer receipts. Restore tables from the Hidden tables section. Concurrent hide/open requests cannot produce an active hidden table.

A consistent backup was created at `data/restaurant-before-batch-workflow.sqlite` before the migration. The live database passes SQLite integrity checking. Comparison with the backup confirmed unchanged existing session/payment counts and unchanged inventory, sessions and payment records.

## Verification

Run `npm test`, `npm run build` and `npm run test:browser`.

API tests cover every transition, initial approval and queued release, unauthorized actions, automatic routing/retries, kitchen visibility, separate batches, stock races, cancellations/refunds, discount validation/rollback, closure blocking, payment idempotency, immutable audit events, migration and table reuse. Browser tests exercise cart quantity changes and persistence, two customer phones, a single initial approval, automatic follow-ups and read-only cashier records, kitchen preparation, delivery confirmation, blocked early closure, payment, fresh visits, cancellation and login/profile/recovery. Tests use isolated databases and do not reset restaurant data.

Physical scanning/printing and real payment-provider settlement still require restaurant checks; online payments remain manually verified by the cashier.
