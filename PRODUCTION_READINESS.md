# Production-readiness assessment

Assessment date: 22 October 2026, Asia/Manila.

## Verdict

The application has a working, tested restaurant-ordering workflow. It does **not yet meet a production-readiness bar for daily, publicly accessible restaurant operations**. Its present role is a functional prototype. A supervised pilot should follow remediation of the release blockers below.

There is no universal certificate called “industry level.” This assessment uses the application's business requirements, security-control expectations informed by OWASP ASVS, data integrity, operational recovery and test evidence. This is not a complete ASVS certification, penetration test, load qualification, or legal/tax compliance audit.

No application code or restaurant records were changed during this assessment. Risk probes ran against a disposable database. Building refreshes generated `dist` files.

## What passed

| Area | Evidence | Result |
| --- | --- | --- |
| Table visits and customer access | Ten table identities, visit-code joining, customer isolation and clean table reuse | Functional checks pass |
| Batch lifecycle | Submitted → approved → preparing → ready → served; unauthorized transitions rejected | Functional checks pass |
| Cashier gate | Unapproved batches hidden from kitchen; price snapshots calculated by server; explicit subtotal confirmation | Functional checks pass |
| Multiple phones and batches | Independent drafts, shared submitted history, retries do not create another reservation | Functional checks pass, with request-key caveat below |
| Stock correctness | Atomic reservations and cancellation refunds; concurrent orders cannot oversell the available quantity | Functional checks pass, with abuse/expiry gaps below |
| Finalization | Pending and unserved batches block closure; payment/closure atomic; served history retained | Functional checks pass |
| Staff access | Three roles, hashed passwords/session tokens, server-side role checks, logout, password-change session revocation | Basic checks pass; not release-ready |
| Audit history | Batch/visit events stored with actors and timestamps; update/delete triggers protect event rows | Partial: important events remain outside this log |
| Sales calculations | Confirmed payments, Manila day boundaries and exclusion of cancelled batches | Tested calculations pass |
| Build | Production Vite build succeeds | Pass |

Current automated results: **21 API/data tests passed; 12 Chrome browser tests passed**. Tests use isolated databases. Passing them establishes the tested paths, not overall production readiness.

## Database inspection

SQLite integrity check: `ok`. Foreign-key check: no reported violations. Additional application checks found no duplicate IDs, orphan batches/payments, negative/nonfinite stock, multiple active visits per table, table/visit occupancy mismatches, or closed-visit payment-count mismatches in the inspected data.

The inspected database contained 10 tables, 6 visits, 1 batch, 4 payments, 16 inventory records and 12 workflow audit events. The authoritative dining JSON was approximately 10.6 KiB. This is a small sample and is not evidence of high-volume capacity. SQL foreign keys do not validate relationships embedded inside the JSON document.

## Confirmed findings and release priorities

### P0 — Default production credentials remain active

All three saved role accounts match their published bootstrap passwords. `server/auth.js:30`–36 creates predictable defaults whenever the corresponding account is absent. There is no production-only requirement for unique initial secrets or forced first-login password change.

Impact: publishing the current database/accounts exposes management, payments and kitchen operations to anyone who knows those defaults. Replace defaults, revoke existing sessions after rotation, remove automatic weak production fallback and require explicit secure provisioning before public access.

### P1 — Staff identity and lifecycle are incomplete

`staff_users` has roles, but provisioning creates only role-named accounts. There is no account-management workflow for named employees, disabling departing staff, owner-driven credential recovery or targeted session administration. Shared role credentials mean an event attributed to “cashier” does not identify the individual employee.

Require named users, account disable/revoke controls, documented recovery, appropriate owner protection and an explicit permission matrix for discounts, stock changes, voids and refunds.

### P1 — HTTPS/proxy and password-hardening configuration is incomplete

`server/auth.js:59` adds Secure only when `req.secure` is true. `server/index.js` does not configure trusted reverse proxies. In an isolated login request representing an HTTPS-terminating proxy (`X-Forwarded-Proto: https`), the cookie omitted Secure. The real deployment's TLS/proxy configuration has not been validated.

`hashPassword` and `verify` use default synchronous scrypt parameters rather than an explicit, versioned work-factor policy. Node defaults are N=16384, r=8, p=1; OWASP's listed N=2^14 alternative uses p=5. Synchronous verification also occupies the API event loop. Set and benchmark an appropriate asynchronous hashing policy with a migration strategy. Configure trusted proxy boundaries, secure cookies, HTTPS and security headers for the selected host; verify the actual deployed response rather than trusting development behavior.

### P1 — Customer reservations can monopolize stock before verification

`server/dining.js:94`–119 validates available stock but reserves it immediately on submission. Login/join failed attempts are limited; successful joins and batch submissions have no comparable per-visit quota or reservation timeout.

Isolated reproduction: one visit with one guest submitted **48 Cokes**, received HTTP 200 with status Submitted, and reduced available Coke stock to **0**, without cashier approval. This is not an overselling race; it is an abuse/business-control gap. Add quantity policies, submitted-batch limits, submission throttling, reservation expiry/abandonment handling and an operator recovery process. Retain the atomic stock checks.

### P1 — Financial exception and reconciliation workflows are missing

`server/dining.js:159`–177 rejects cancellation after approval. There is no controlled post-approval void, kitchen rejection, replacement, wastage, refund or post-payment correction workflow. A genuine preparation failure can leave a session unable to close unless someone incorrectly marks food served. Implement authorized compensating events that preserve the original records and represent the real outcome.

Online payment is manually asserted through a reference string (`server/dining.js:133`–147). In an isolated probe, **the same reference was accepted for two different served-and-closed visits**, both HTTP 200, creating separate payment records. No provider confirmation, duplicate-reference handling or reconciliation process is implemented. Manual verification can be an operating model, but it needs defined evidence, reconciliation and exception controls.

Additional POS features requiring a business decision include numbered receipts/invoices, cash-drawer/shift reconciliation, split/partial payments, refund policy, tax/discount rules and late-arriving guest/headcount adjustments. No jurisdiction-specific fiscal compliance is established by the current code.

### P1 — Audit coverage is incomplete

Batch and session audit events are useful, but the stock endpoint (`server/dining.js:204`) writes generic inventory movements without the acting staff identity. Archiving is not an attributed audit event. Authentication attempts, administrative recovery and profile/password changes also lack a durable security event log.

Isolated reproduction: a staff stock adjustment produced **zero additional `dining_events` rows**, and the movement had no actor ID. Extend attributable logs to all sensitive changes, with reasons and appropriate retention/access controls. Append-only triggers on one local table do not constitute independent tamper-evident/offsite audit storage.

### P1 — Recovery and production operations have not been established

One-time database backups exist, but there is no scheduled encrypted/offsite backup policy or tested restore automation in the codebase. There is no supplied production service configuration, crash/boot recovery procedure, alerting, structured request/error telemetry, graceful shutdown handling or documented incident/fallback process. `/api/health` checks a SQL read, not write readiness, disk capacity, backup freshness or business-state integrity.

Define business recovery targets, configure persistent storage and automatic process startup, test restoring to a clean machine, and document operation during internet/server/printer failure. Verify host configuration externally; absence from this repository does not prove that a separate provider account lacks controls.

### P1/P2 — Dependency advisory requires triage and remediation

The production dependency audit (`npm audit --omit=dev`) reported **one high-severity package finding** for the direct dependency `react-router` at 7.13.0. npm reported 7.18.4 as a non-major update available at assessment time.

Several aggregated advisories concern SSR/RSC or server-framework features that this client-rendered SPA does not appear to use. The audit result is **not proof that this application has an exploitable remote-code-execution path**. Inventory the affected features, update to an appropriate patched release and rerun regression/security checks before release. No dependencies were changed during this assessment.

### P2 — Request-ID reuse can silently discard a changed submission

`server/dining.js:99` returns a previous batch for a matching visit/request ID without comparing submitted contents.

Isolated reproduction: after submitting Coke ×48, reusing the same request ID for Sprite ×1 returned HTTP 200 with the original Coke batch. The current UI ordinarily generates a new ID when editing, so this is an API-contract gap rather than proof of the normal UI losing orders. Bind idempotency keys to a canonical request fingerprint and return conflict for changed contents.

### P2 — Data access and growth need a production design or measured limits

`server/dining.js:27`–28 parses and rewrites the entire authoritative JSON document for each mutation, including joins. `GET /dining/state` returns historical state and calculates bills repeatedly; staff/customer screens poll every three seconds. Audit rows grow separately, while account/visit tokens and history have no full retention/pagination policy.

SQLite itself can support suitable production workloads. The concerns here are the growing whole-document rewrite, synchronous work, lack of indexed relational constraints on embedded business records, and absence of peak-load/recovery measurements. Normalize the business schema or establish a rigorously bounded document design. Test representative and worst-case historical data before choosing infrastructure or claiming a supported customer count.

### P2 — Inventory implementation and UI claims disagree

`src/app/pages/cashier/Inventory.tsx:82` and `admin/Inventory.tsx:87` claim FIFO deduction. The active server uses aggregate quantities, not received inventory lots with receipt/expiry dates. The StockBatch type is not a persisted FIFO implementation. Remove the claim or implement/test lot-based consumption and traceability.

The stock-edit handlers use `parseFloat(editValue) || 0` (`cashier/Inventory.tsx:56`, `admin/Inventory.tsx:60`). An empty/invalid UI value can be converted into a valid request to set stock to zero. Validate explicit nonempty numeric input and preserve the edit on failure. Clarify physical on-hand versus reserved/available stock and audit adjustments.

### P2 — Frontend failure recovery can mislead operators

`src/app/lib/api.ts:7` assumes every response is JSON and sets no request timeout. Proxy failures with empty/non-JSON bodies produce parsing errors. `RestaurantContext.tsx:11`–15 clears state after fetch failures, so an outage may appear as empty orders/tables/stock rather than clearly identified stale data. Fixed-interval polling can overlap slow requests and has no backoff or freshness indication.

Preserve last-known data with a visible offline/stale marker, block unsafe actions as appropriate, handle non-JSON errors, set timeouts and make request cancellation/retry behavior explicit. Keep submission/payment idempotency safeguards.

### P2 — Quality gates and operational qualification are incomplete

The test suite exercises important paths, including two concurrent reservations. It is not a sustained load/soak test, failure-injection test or a real phone/printer acceptance test. Browser coverage uses Chrome; the mobile-viewport check is for login, not a full iOS/Android customer-ordering journey. No CI workflow, lint gate or TypeScript type-check command was found. Vite transpilation/build success is not a complete type check.

Add CI, automated type/lint/security checks, representative load/soak tests, network-loss/retry tests, crash/restart tests, backup-restore acceptance tests, accessible customer UI checks and real-device restaurant acceptance testing.

## Release sequence

1. **Before exposing the app publicly:** secure account provisioning/default rotation, dependency remediation, verified TLS/cookie/proxy configuration, persistent storage, automated backups with a restore test, and basic monitoring/process recovery.
2. **Before using it as the primary ordering/payment system:** controlled void/refund/failed-preparation handling, payment reconciliation and reference handling, reservation abuse/expiry controls, attributable stock/financial changes and employee account administration.
3. **Before claiming capacity/reliability:** data-growth strategy, normalized/indexed persistence where appropriate, CI, real-device acceptance, sustained peak-load tests and measured recovery against agreed business targets.

The existing approval, stock, permissions, payment-blocking and audit tests should remain regression gates throughout these changes.

## Reference baseline

- [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/) — security verification requirements; not a certification obtained by running this application's tests.
- [OWASP password storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) — hashing policies and work factors.
- [OWASP session management guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) — session protection and lifecycle.
- [Node.js crypto defaults](https://nodejs.org/docs/latest-v24.x/api/crypto.html#cryptoscryptsyncpassword-salt-keylen-options) — scrypt defaults used by the runtime family inspected.
- [SQLite deployment suitability](https://sqlite.org/whentouse.html) — SQLite is a deployment/design choice, not an automatic indicator of non-production software.
