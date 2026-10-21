# Car marketplace (working name: Magari)

Buy and sell cars in Kenya — listings from private sellers and verified dealers, with checkout prepared behind a payment-provider interface.
This repo covers **Sprints 0–4 plus the local Sprint 5 payment/ledger flow**: foundations, listings with Vehicle Passport capture, search and discovery, leads and messaging, and dealers. Live Cashia, eTIMS, and Safe Deal settlement still need their merchant contracts and credentials.

- **Sprint 0 done when:** a user signs up by phone and sees an empty home page. ✅
- **Sprint 1 done when:** a seller publishes a car with photos from a phone in under 5 minutes. ✅
- **Sprint 2 done when:** a buyer filters to "Toyota, under KSh 1.5M, Mombasa" and saves the search. ✅
- **Sprint 3 done when:** a buyer message reaches the seller as an SMS and both chat in-app. ✅
- **Sprint 4 done when:** a dealer with two staff uploads 30 cars by CSV and sees leads per car. ✅
- **Sprint 5 internal flow:** local checkout records a boost or dealer plan, posts a balanced journal, and shows an account receipt.

## Sprint 5 progress

- **Checkout orders** — listing owners can buy a seven-day boost for KSh 500; dealer owners and managers can choose a seeded dealer plan. Prices and ownership are checked on the server.
- **Payment posting** — the service-only `record_order_payment()` function locks the order, rejects mismatched amounts, handles duplicate provider references, posts balanced cash/revenue/VAT entries, and applies the purchased listing boost or dealer subscription in the same transaction.
- **Recommended search** — featured and boosted cars rank first while active. Their promotion timestamps are cleared every five minutes when `pg_cron` is available; call `expire_listing_promotions()` on the same cadence otherwise. Promotion changes do not reset a listing's last-edited date.
- **Orders and receipts** — `/account/orders` and `/account/orders/<id>` show a buyer's order and payment receipt. The receipt keeps the eTIMS invoice number separate from Magari's receipt reference.
- **Dealer billing** — `/dealer/<id>/billing` shows the current plan and available plans.
- **Featured slots** — owners and managers assign the active plan's featured slots to live cars for seven days; the database enforces each plan's limit.
- **Local walkthrough** — `PAYMENT_PROVIDER=mock` opens a test checkout that does not move money. The mock adapter is disabled in production.
- **External connections still pending** — Cashia's [developer overview](https://www.cashia.com/developers/) describes hosted checkout and webhooks, but its detailed request and signature contract was not accessible from this environment. No merchant keys were provided. eTIMS requires the KRA's current system-to-system specs and a certified integration path; the service contract is absent. Safe Deal remains read-only until Cashia's hold, release and refund operations and the settlement process are defined.

## What's in Sprint 4

- **Dealer onboarding** — `/dealer`: business name, showroom phone, county and town, KRA PIN and registration number; then the KRA PIN certificate, business registration and owner's ID go to a private bucket that only owners, managers and reviewers can open. Verified details lock once approved.
- **Admin approval** — `/admin/dealers`: KYC details, signed document links and what's missing; approve, or send back with a reason (the owner gets an SMS either way and can fix and resubmit). Optional "publish their cars without review" for established dealers: their cars go live on submission unless the Vehicle Passport has an open flag.
- **Teams** — owners add managers and sales staff by phone number. People with an account join at once; others get an SMS invite and join the first time they sign in with that number. Owners change roles and remove people; anyone can leave. Every member sees the dealership's cars, chats and leads.
- **Shared inbox** — buyers see and message the dealership, never the salesperson; any colleague can answer, and replies show which colleague sent them. Calls and WhatsApp go to the showroom phone.
- **CSV upload** — up to 200 cars per file (Excel or Google Sheets saved as CSV; commas, semicolons or tabs). Every row is checked in the browser first: make and model matched to our catalogue with suggestions ("Did you mean Vitz?"), and Kenyan ways of writing things understood ("1.35M", "92,000 km", "Ex-Japan", "Auto"). Good rows become drafts with their Passport link; bad rows are listed by spreadsheet row. Template at `/dealer/stock-template.csv`.
- **Bulk photos** — drop every photo at once; files named after the chassis number (`NZE161-7012345_1.jpg`) go to the right car, and `…_dash.jpg` goes to the Passport as the mileage photo. Then "Submit all ready cars".
- **Dashboard** — overview (live cars, drafts ready, views and leads this week), stock list with views (total and 7 days), chats, calls and WhatsApp taps, unread messages, who listed each car and what each draft still needs; lead inbox filtered by type.
- **Showroom and badge** — `/dealers/<name>` with address, hours, call and WhatsApp buttons, every live car and `AutoDealer` structured data; `/dealers` directory; both in the sitemap. The "Verified dealer" badge shows on cards, car pages and the showroom.
- **Views per car** — counted once per visitor per day from a salted daily hash (no IP addresses stored), ignoring bots and the dealer's own team.

## What's in Sprint 3

- **Chat** — "Message seller" on every car (quick replies for first messages), `/messages` inbox, and a conversation view that updates every few seconds while open, with "Sent"/"Seen" receipts and an unread badge in the header. Messages that ask for a deposit or M-Pesa payment carry a warning for the reader; every chat shows the never-pay-first rule.
- **Calls and WhatsApp** — signed-in buyers tap Call (shows the number and dials) or WhatsApp (opens a chat with the car's name and link). Each tap is a lead; sellers see "2 chats · 1 call · 3 WhatsApp" per car on `/sell`. Sellers can switch calls or WhatsApp off; one account can reveal at most 30 sellers' numbers a day.
- **SMS and email** — a private outbox (`private.deliveries`) and a delivery job (`/api/jobs/deliver`). New-message texts wait a minute and are skipped if the message was read in the app; at most one per chat every 30 minutes and 12 SMS per person a day. Saved-search alerts go instantly, as an 8am daily summary (the default), or not at all, per channel. Texts are kept to one 160-character plain-text segment with short links (`/m/…`, `/s/…`). Email is optional and verified with a 6-digit code.
- **Settings** — `/account/notifications`: SMS and email choices, email address, and whether buyers may call or WhatsApp.
- **Outbox for admins** — `/admin/outbox` lists every SMS and email with its exact text and status, which is how staging is demonstrated before the Africa's Talking account exists.

## What's in Sprint 2

- **Search** — `/cars` with make, model, county, price band, year, mileage, body, fuel, gearbox, condition and keyword; sort by recommended, newest, price, mileage or model year; 24 per page. Filters apply at once on wide screens and from a full-screen sheet with a live "Show 23 cars" count on phones. Removable filter chips; every search works without JavaScript too.
- **Landing pages for Google** — one clean URL per make, model and county combination (`/cars/toyota/corolla-axio/in/mombasa`), server-rendered with headings, price-range intros, breadcrumbs and links to related pages. Only pages with cars are indexed; filtered and sorted variants carry `noindex`. `sitemap.xml` (hourly) and `robots.txt`.
- **Listing URLs** — `/listings/2016-toyota-corolla-axio-<id>` with `Car` structured data (price, mileage, fuel…) and similar cars. Old `/cars/<id>` links redirect.
- **Favourites** — a heart on every card and car page; `/account/saved` keeps sold cars on the list, marked sold.
- **Saved searches and alerts** — "Save search" (signing in on the way if needed); `/account/saved/searches` shows how many cars match and how many are new since the last visit; a job every 15 minutes queues alerts that show as a badge in the header. Sprint 3 sends the same alerts by SMS.

## What's in Sprint 1

- **Selling flow** — `/sell` dashboard, `/sell/new` (make, model, year, chassis number), `/sell/[id]` editor: photos, price and details, mileage proof and papers, submit for review. Pause, reactivate, mark sold, renew, delete drafts.
- **Photos** — up to 20 per car, shrunk in the browser to save mobile data, then straightened, stripped of metadata (phone GPS), resized to 1600px WebP, watermarked and thumbnailed on the server. Reorder and choose the cover.
- **Vehicle Passport capture** — one `vehicles` row per chassis number (Japanese frame numbers and 17-character VINs). Chassis and plate stay private; buyers see a masked chassis. Private uploads for the dashboard photo (required), auction sheet, export certificate, JEVIC, QISJ and logbook. Every submission records a dated mileage reading, and a reading lower than the car's history raises a flag for reviewers.
- **Review** — `/admin/review` queue for admins: full chassis, plate, photos, signed links to papers, the car's earlier readings and flags; approve or send back with a reason.
- **Public pages** — the car page (now `/listings/…`) with gallery, details, Passport panel and seller card; `/sellers/[id]`; latest cars on the home page.
- **Rules in the database** — a listing can't be submitted without chassis, 3 photos, a dashboard photo and full details; one active listing per car; only drafts can be deleted; listings expire after 60 days.

## What's in Sprint 0

- **Phone sign-in** — Kenyan numbers in any format (`0712…`, `+254…`, `0110…`), 6-digit SMS code, new users finish a short profile (name + county).
- **Database schema** — 28 tables at the time (33 after Sprints 2–4) covering all of Phase 1 (listings, dealers, chat, leads, orders, ledger, reports, Vehicle Passport) plus Safe Deal and inspections as schema only.
- **Security on every table and storage bucket** — row-level security plus column grants; 426 automated SQL assertions (Sprints 0–4) prove who can see and change what.
- **Vehicle catalogue** — 47 counties, 32 makes, 280 models popular in Kenya, 3 dealer plans.
- **Design system** — tokens, buttons, fields, alerts, the plate brand mark; mobile-first.
- **Payments interface** — `PaymentProvider` with a local mock; Cashia still needs the merchant API reference and sandbox access.
- **CI** — lint, types, unit tests, migrations + RLS tests on Postgres 17, production build.

## Stack

| Layer | Choice |
| --- | --- |
| Web | Next.js 16 (App Router, Cache Components, Turbopack), React 19, Tailwind CSS 4 |
| Backend | Supabase: Postgres 17, Auth (phone OTP), Storage (public photos, private documents) |
| Images | sharp: orientation, metadata strip, resize, WebP, watermark from bundled font outlines |
| SMS | Africa's Talking via Supabase's Send SMS hook (`supabase/functions/send-sms`) |
| Payments | Local-only mock behind `@cm/payments`; Cashia adapter pending merchant API details |
| Tooling | pnpm workspaces, TypeScript strict, Vitest, ESLint, GitHub Actions |

## Repo layout

```
apps/web/                 Next.js app
  src/app/                / · /cars/[[...filters]] (search and landing pages) · /listings/[slug]
                          /sellers/[id] · /login · /account (+ /saved, /saved/searches, /notifications, /orders)
                          /sell · /sell/new · /sell/[id] · /messages · /messages/[id] · /messages/new
                          /dealer/[id]/billing · /account/orders · /account/orders/[id]
                          /admin/review · /admin/outbox · /payments/mock-checkout · sitemap.xml · robots.txt
                          /api/me · /api/search/count · /api/conversations/[id]/messages
                          /api/listings/[id]/{photos,documents} · /api/jobs/deliver
  src/components/         Design system (ui/), listings, search, chat, buyer state, site chrome
  src/lib/                env, auth, Supabase clients, catalogue, queries, actions, media, notifications
  src/proxy.ts            Session refresh, sign-in guard, clean search URLs, 404s, SMS short links
packages/shared/          Phone numbers, counties, vehicle vocabularies, money, search filters, zod schemas
packages/messaging/       SMS (Africa's Talking) and email (Resend) providers, console stand-ins, templates
packages/db/              Generated database types (do not edit by hand)
packages/payments/        PaymentProvider interface + MockPaymentProvider
supabase/migrations/      Schema, security, reference data, search, messaging — the source of truth
supabase/tests/           SQL tests for schema and row-level security
supabase/functions/       Edge functions (send-sms for sign-in codes)
scripts/                  db-test.sh, gen-db-types.mjs, assets/build-watermark-glyphs.py
docs/decisions.md         Decisions made so far and why
```

## Getting started

Prerequisites: Node 22, pnpm 10, and for a local backend the [Supabase CLI](https://supabase.com/docs/guides/local-development) with Docker.

```bash
pnpm install
supabase start                      # local Postgres, Auth, Studio — applies migrations
cp apps/web/.env.example apps/web/.env.local
#   paste the API URL and publishable key that `supabase start` printed
#   set SUPABASE_SECRET_KEY to the local service_role key for payment walkthroughs
pnpm dev                            # http://localhost:3000
```

Sign in locally with **0700 000 001** and code **123456** (test numbers in `supabase/config.toml` — no SMS is sent).
To review listings locally, make yourself an admin, then open `/admin/review`:
`update public.profiles set role = 'admin' where phone = '+254700000001';`

## Everyday commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Run the web app |
| `pnpm check` | Lint, type-check and unit-test every package |
| `pnpm db:test` | Apply all migrations to a throwaway Postgres and run the SQL tests (no Docker needed) |
| `pnpm db:types` | Same, then regenerate `packages/db/src/database.types.ts` — commit the result |
| `pnpm build` | Production build (works without a reachable backend) |

`pnpm db:test` uses a local Postgres 16+ install (`initdb`/`pg_ctl`), or `DATABASE_URL=… pnpm db:test` for an existing database.

## Database and security

Migrations in `supabase/migrations/` are the source of truth:

1. `…_init_schema.sql` — tables, enums, triggers (profile on sign-up, dealer owner, double-entry ledger that must balance and is append-only).
2. `…_security.sql` — column grants, row-level security policies, listing status rules.
3. `…_reference_data.sql` — counties, makes, models, plans (needed in every environment).
4. `…_listings_and_passport.sql` — Vehicle Passport tables, storage buckets and policies, the `listing_overview` view, submission rules, review and expiry functions.
5. `…_search_and_saved.sql` — `search_listings()`, landing-page facets, favourites, saved searches, notifications and the alert job.
6. `…_schedules.sql` — pg_cron jobs (expiry daily, saved-search alerts every 15 minutes). Skipped with a notice where pg_cron isn't installed.
7. `…_messaging_and_notifications.sql` — chat rules and payment flags, `contact_seller()` leads, notification settings, email verification, the delivery outbox, its throttles and the daily summary.
8. `…_schedules.sql` (Sprint 3) — the 08:00 daily summary.
9. `…_dealer_enum_values.sql` and `…_dealers.sql` (Sprint 4) — dealer registration and review, documents bucket, staff invites, the shared dealer inbox, views per car, trusted publishing, CSV import and the dashboard functions.
10. `…_payment_fulfillment.sql` (Sprint 5 internal flow) — service-only payment reconciliation, balanced ledger posting, boost/plan fulfillment, and promotion expiry.

Rules worth knowing before writing queries:

- **Select explicit columns.** Some columns are not granted to the API (`profiles.phone`, `profiles.role`, `listings.boosted_until` writes…). `select('*')` on `profiles` fails by design.
- **Your own phone number comes from the Auth session**, not `profiles`.
- **Money is whole shillings in `bigint`** columns named `*_kes`. Phone numbers are E.164.
- **Listings:** sellers move `draft ⇄ pending_review`, `live → paused/sold`, `paused → live/sold`. Only admins approve `pending_review → live`, through `admin_review_listing()`.
- **Read listings through `listing_overview`** — one view (RLS-aware) with make, model, county, cover photo and seller name. `is_public` already excludes expired cars.
- **Start listings with `start_listing()`** so the draft and its chassis link are created together.
- **Storage paths are `<listing id>/<file>`.** Ownership of a file follows the listing; `vehicle-documents` is private (open with short signed URLs).
- **Search through `search_listings(filters)`** and add order and range in the query. It is the one definition of a match: search pages, landing pages, similar cars and alerts all use it. Filter keys equal the URL parameters (`packages/shared/src/search.ts`).
- **Background jobs** run in the database via pg_cron (see the schedules migrations). Without pg_cron, run `expire_due_listings()` daily, `queue_saved_search_alerts()` every 15 minutes, `queue_search_digests()` daily at 05:00 UTC, and `expire_listing_promotions()` every five minutes with the service role.
- **Dealers register through `apply_dealer()`** (the dealer, its owner and KYC row together) and add staff through `invite_dealer_staff()`, which texts them. Direct inserts into `dealers` and `dealer_members` are refused.
- **Dealer stock belongs to the dealership.** `seller_id` is the colleague who listed it; every member can edit it, chat about it and see its leads. "Seller side" checks go through `private.on_seller_side()`.
- **Views are written only by `record_listing_view()`**, which only the service role can call (from `/api/listings/[id]/view`).
- **Leads come only from `contact_seller()` and new conversations.** Direct inserts into `leads` are refused so counts can't be inflated.
- **Never send SMS or email directly.** Queue a row in `private.deliveries` (see `private.queue_delivery()`), so throttles, caps, retries and the outbox apply.
- **Money tables are read-only through the API.** Orders, payments, ledger and subscriptions are written server-side with the service role (Sprint 5).
- After changing a migration: `pnpm db:types`, then add or update tests in `supabase/tests/`.

## Next.js 16 notes for the team

This is not the Next.js most tutorials describe. Read `apps/web/node_modules/next/dist/docs/` before adding routes.

- **Cache Components is on.** Anything that reads cookies, headers or search params must sit inside `<Suspense>`. `getCurrentUser()` is request-time only.
- **Public data** (catalogue, live listings) uses `createPublicClient()` inside `"use cache"` functions with a `cacheLife`.
- **`proxy.ts` replaces `middleware.ts`.** It only refreshes the session and does optimistic redirects; real checks live in `lib/auth.ts` and RLS.
- **Hidden pages keep their state** (React Activity). Forms that show results call `useResetOnHide` so users don't return to stale messages.
- **After a mutation that changes the header** (name, sign-in state), call `refresh()` in the Server Action.
- **Cache tags:** public listing data is tagged `listings` and `listing:<id>`. Server Actions call `updateTag`; route handlers call `revalidateTag(tag, "max")`.
- **Uploads go through route handlers** (`/api/listings/[id]/photos`, `/documents`), not Server Actions, because of body size limits.
- **Personal bits on public pages** (hearts, "Search saved", the alert badge) come from `/api/me` through `BuyerProvider`, so the pages themselves stay cached for everyone.
- **A page that has started streaming can't change its status code.** `notFound()` inside `<Suspense>` shows the not-found screen with status 200 and `noindex`. Where a real 404 matters (unknown makes, models and counties under `/cars`), `proxy.ts` checks first.
- **`usePathname` and `useSearchParams` need a `<Suspense>` boundary** on routes with dynamic segments.

## Production SMS (Africa's Talking)

1. Create an Africa's Talking app; note the username, API key and (optionally) a registered sender ID.
2. Deploy the hook: `supabase functions deploy send-sms --no-verify-jwt`
3. In the Supabase dashboard → Authentication → Hooks → **Send SMS**: choose HTTPS, point it at the function URL, and generate a secret.
4. Set secrets: `supabase secrets set SEND_SMS_HOOK_SECRET=v1,whsec_… AFRICASTALKING_USERNAME=… AFRICASTALKING_API_KEY=… AFRICASTALKING_SENDER_ID=… APP_NAME=…`
5. Enable the **Phone** provider under Authentication → Providers.

## Sending SMS and email (the delivery job)

`POST /api/jobs/deliver` drains the outbox. It needs `SUPABASE_SECRET_KEY` and `CRON_SECRET` set, and must be called every minute with `Authorization: Bearer <CRON_SECRET>`. Any of these works:

- **Supabase pg_cron + pg_net** (no extra service). In the SQL editor, store the URL and secret in Vault, then:
  ```sql
  select cron.schedule('deliver-notifications', '* * * * *', $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'deliver_url'),
      headers := jsonb_build_object('Authorization', 'Bearer ' ||
        (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')))
  $$);
  ```
- **Vercel Cron** (Pro plan for every-minute jobs): add a cron for `/api/jobs/deliver`; Vercel sends the `CRON_SECRET` header itself.
- **Any cron service** (cron-job.org, a server's crontab) calling the URL with the header.

Notification providers are chosen with `SMS_PROVIDER` (`console` or `africastalking`) and `EMAIL_PROVIDER` (`console` or `resend`); see `apps/web/.env.example`. With `console`, nothing leaves the server: texts and emails are logged and appear in `/admin/outbox`. The job is safe to run twice at once (rows are claimed with `SKIP LOCKED`), retries failures twice, and never texts someone who already read the message in the app. `PAYMENT_PROVIDER=mock` is only for local walkthroughs and is rejected in production.

## Deploying

- **Database:** `supabase link --project-ref …` then `supabase db push`.
- **Web:** any Node 22 host (Vercel, Render, a VPS). Set `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, plus the server-only `SUPABASE_SECRET_KEY`, `CRON_SECRET` and provider settings for notifications.
- Add the site URL to Supabase → Authentication → URL Configuration.

## Watermark lettering

The watermark is drawn from vector outlines of the brand font, so servers need no fonts installed. If the font or brand style changes, rebuild them with `pip install fonttools brotli && python3 scripts/assets/build-watermark-glyphs.py`.

## External payment launch requirements

Cashia's [public developer overview](https://www.cashia.com/developers/) describes hosted checkout sessions and webhooks, but detailed request fields, signature verification rules, and status lookup operations are not available from the documentation page reachable in this environment. Add the Cashia adapter against the merchant's current API reference; browser redirects must never count as proof of payment. Configure sandbox keys before selecting a live provider. eTIMS requires KRA's current [system-to-system integration process](https://www.kra.go.ke/business/etims-electronic-tax-invoice-management-system/learn-about-etims/etims-system-to-system-integration), an approved taxpayer service request, sandbox work, and a certified integration path. Safe Deal needs Cashia's supported hold/release/refund contract and an agreed dispute and payout process.
