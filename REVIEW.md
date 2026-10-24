# Login, permissions and database review

The current batch-ordering review is documented in [WORKFLOW.md](WORKFLOW.md). The root causes addressed there were missing cashier verification, exposing unverified batches to kitchen staff, payment without a serving-completion check, overwriting batch statuses during closure, and absence of durable workflow audit events. The new flow separates batch progress from visit closure, preserves immutable contents/history, and validates the full lifecycle on the server. Cancelled batches are excluded from bills and paid-product reporting.

## Root causes and fixes

| Finding | Root cause | Fix |
| --- | --- | --- |
| Cashier, kitchen and owner accepted one PIN | All login files exported a shared PIN form; the server checked STAFF_PIN and created a roleless in-memory token | Separate role-labelled username/password forms; persistent role accounts with salted scrypt password hashes |
| Signed-in staff could perform another role's actions | Page guards only checked a successful state request; API mutations all used the same staffOnly middleware | Identity endpoint, role-aware route guards, server permission checks for management versus kitchen actions |
| Kitchen received financial and customer-access data | The state endpoint returned the entire dining document, including visit tokens | Remove customer tokens from staff responses; kitchen receives active orders without financial, inventory or visit-code data |
| Login screen appeared cream and stretched across the page | Generic dining layout inherited light theme tokens and had no full-page dark background | Dedicated responsive authentication layout with existing logo, Cinzel typography, brown surfaces, gold controls and accessible labelled inputs |
| Profile edits/password changes did nothing | Profile screens rendered fixed demo values and buttons without save handlers | Identity-backed profile forms and validated update/password endpoints; changing a password revokes other sessions |
| Owner charts and daily totals disagreed with saved payments | Screens imported demo sales arrays, hardcoded order counts and fake percentage trends; admin totals summed unpaid order extras | Shared sales calculations from confirmed payments, paid-visit product quantities and Asia/Manila dates; remove invented trends |
| Empty sales charts could generate NaN SVG coordinates | Chart scales divided by zero when every value was zero | Safe minimum scales; handle a single payment-method category as a complete ring |
| Staff data could remain visible after authentication expired | State polling swallowed failures without clearing prior state | Clear staff state on authentication failure and redirect protected pages when the session expires |
| Malformed order/status input could produce a server error or corrupt status | Null line items were dereferenced; an omitted status could compare equal to an undefined transition | Explicit item/status validation and regression assertions |

## Database inspection

SQLite integrity check returned `ok`. The dining document contains tables 1–10. Checks found no duplicate active visits for a table, occupied tables without an active visit, orders without visits, or payments without visits. Existing dining JSON was compared before/after account-schema initialization and remained unchanged.

The five legacy resource tables remain intact and unused by the current dining workflow; their presence is not database corruption. No restaurant orders, stock, visits or payments were reset for testing. Automated tests use disposable databases.

## Verification

- Syntax scan across 100 application/server source files before the added test files: no syntax errors.
- Production Vite build.
- API/data tests: account creation and hashed storage; all three logins; malformed/wrong-role login attempts; role permissions; redacted data; profile persistence; password validation and session revocation; logout and expiry; QR uniqueness; customer isolation/shared ordering; stock and retry validation; kitchen transitions; bill pause/reopen; cashier payment and fresh table reuse; confirmed sales totals and Manila date boundaries.
- Chrome browser tests: all three branded logins, show/hide password, correct destinations, invalid credentials, cross-role guards, logout, mobile layout, profile reload persistence, empty sales charts, and a full two-phone/customer/kitchen/cashier journey.

These checks cover the revised behavior and its integration points. They do not establish that every possible UI interaction is defect-free. Physical QR scanning/printing and real payment-provider settlement remain outside automated browser tests; online payments still require cashier verification.
