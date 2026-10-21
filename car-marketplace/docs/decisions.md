# Decisions

Short records of choices made while building, so the team knows what was decided and why. Newest last.

## Sprint 0 (October 2026)

**Working name "Magari".** The platform name is still open. It appears in one place per surface: `NEXT_PUBLIC_APP_NAME` (web), `APP_NAME` (SMS function) and the OTP template in `supabase/config.toml`. Change those when the name is final.

**Next.js 16 + Supabase, matching the rest of the portfolio.** Same platform as the Hercules migration, so auth, RLS patterns and tooling carry over.

**Phone OTP is the only sign-in method.** Kenyan buyers and sellers live on their phones; no passwords to forget. Email sign-up is disabled in `config.toml`.

**SMS through Africa's Talking via the Send SMS hook.** Supabase has no built-in Kenyan provider; the hook keeps Auth's OTP logic and lets us pay local SMS rates. Twilio and others remain a config change away.

**Security = column grants + row-level security, tested in SQL.** Private columns (phone, role, boost timestamps, KYC) are not granted to the API at all, so a client bug cannot leak or write them. RLS decides row access. Every rule has an assertion in `supabase/tests/`.

**Listings are moderated before going live.** Sellers submit for review; an admin (Sprint 6 console) approves. If moderation becomes a bottleneck, auto-approve for verified dealers is a one-line change in `private.guard_listing()`.

**Dealer KYC is a separate table.** A KRA PIN can never leak through a public dealer page because it isn't on that row.

**Money in whole shillings (`bigint`), double-entry ledger from day one.** Journals must balance at commit and rows are append-only; corrections are reversing journals. Ready for Cashia in Sprint 5 and Safe Deal in Phase 2.

**Phase 2 tables exist now, read-only.** `deals` and `inspections` are in the schema so Safe Deal adds behaviour, not migrations of live data.

**Self-hosted font.** Archivo (variable width + weight) ships from the repo: no runtime call to Google, faster on Kenyan mobile networks.

**Plain-Postgres test harness.** `pnpm db:test` runs migrations and RLS tests without Docker using a small Supabase stub, so every developer and CI run can check security in seconds. Against a real `supabase start` database the stub is skipped.

**Generated DB types without Docker.** `scripts/gen-db-types.mjs` produces the same shape as `supabase gen types`; CI fails if the committed types are stale.

## Sprint 1 (November 2026)

**Vehicle Passport is keyed by chassis number.** One `vehicles` row per car; listings link to it through `listing_identity`. Spaces and hyphens are ignored when matching, so the same car typed two ways is one Passport.

**Chassis number and plate are private.** Stored per listing in `listing_identity` (owner and admins only). Buyers see a masked chassis (NZE141-12•••67), enough to recognise the car without handing cloners a full number.

**The chassis is locked once a listing is submitted.** Changing it means a different car.

**A listing can't be submitted without chassis, 3 photos, a dashboard photo and full details.** Enforced in the database, not only the form. Drafts may be partial.

**One active listing per car.** A unique index stops the same chassis being under review or on sale twice — the commonest sign of a duplicate or cloned listing.

**Passport documents from other sellers count only once checked.** Otherwise anyone could pad a car's history through a throwaway draft. Mileage readings carry over once their listing has been published.

**A lower mileage than the car's history raises a flag, not a block.** Flags go to reviewers; meter replacements and typing mistakes are real. Public red flags arrive with Passport verification in Phase 2.

**Only drafts can be deleted.** Submitted listings are paused or marked sold, so the Passport and audit trail keep their history.

**Edits to a live listing publish straight away.** Price drops shouldn't wait for review. Revisit in Sprint 6 if sellers abuse it (e.g. swapping photos after approval).

**Photos shrink in the browser, then get processed on the server.** Browser resize to 2000px saves mobile data; the server re-encodes to 1600px WebP, strips all metadata (phone photos carry GPS), watermarks and thumbnails. Documents stay private in their own bucket.

**Watermark drawn from font outlines.** No dependence on fonts installed on the server, so it looks the same on any host.

**Moderation is a minimal admin queue for now.** `/admin/review` with approve or reject-with-reason; the full console is Sprint 6.

**Listings expire after 60 days.** Hidden from public results immediately when overdue; a scheduled `expire_due_listings()` updates the status.

## Sprint 2 (November 2026)

**One definition of a match, in the database.** `search_listings(filters)` serves the search page, landing pages, similar cars and saved-search alerts, so an alert can never promise a car the search page doesn't show. It is a plain SQL function that Postgres inlines into each query, so sorting and paging use the indexes; row-level security still applies.

**Filters are one JSON shape everywhere.** The same keys are used in the URL, in `saved_searches.filters` (validated by a check constraint) and by the database function. Filters are normalised (lists sorted, ranges ordered), so the same search saved twice is caught as a duplicate.

**URLs: path for what Google should index, query for the rest.** `/cars/<make>/<model>/in/<county>` gets a page per combination; price, year, body and the rest go in the query and are `noindex`, with a canonical tag pointing at the clean page. Car pages moved to `/listings/<title>-<id>`, so make names can't collide with ids; old `/cars/<id>` links redirect.

**Only pages with cars are indexed or in the sitemap.** An empty "Toyota Prius in Lamu" page still works for buyers (with a save-search prompt) but stays out of Google, which avoids thin-content penalties.

**Unknown makes, models and counties get a real 404 from the proxy.** Inside a streamed page Next.js can only show a not-found screen with status 200. A missing car page is still such a soft 404, with `noindex`; a proper "sold" page is a candidate for later.

**Public pages stay cached; personal state loads separately.** Hearts, saved-search state and the alert badge come from one small `/api/me` call, made only when a session cookie exists.

**Favourites only for cars on sale, and they outlive the sale.** A sold car stays in the buyer's list marked "Sold". Limits: 500 saved cars and 20 saved searches per person; a saved search needs at least one filter.

**Alerts: queued now, sent from Sprint 3.** A job every 15 minutes writes one notification per saved search with new matches. Buyers see them as a badge and "N new" counts. A 5-minute overlap plus a record of announced cars means none is missed or announced twice. Buyers aren't alerted about their own listings.

**Keyword search is simple word matching.** Every word must appear in the title, colour, town or description. This is fine to tens of thousands of listings; move to full-text or trigram indexes in Sprint 7 if it slows down.

**Deep paging stops at page 50.** Past 1,200 results, filters work better than page numbers, and deep offsets are slow.

**"Newest" means first published.** A relisted car keeps its original date. Sprint 5 adds a "recommended" order that lifts paid boosts.

## Sprint 3 (November–December 2026)

**Numbers only for signed-in buyers, one car at a time.** Call and WhatsApp reveal the seller's number through `contact_seller()`, which logs the lead. One account can reveal at most 30 sellers a day. Harvesting numbers is how scammers find victims, and sign-in makes every contact traceable.

**Leads are written by the database, not the browser.** A new conversation logs a chat lead, and `contact_seller()` logs calls and WhatsApp taps (repeat taps count once a day). Direct inserts are refused, so sellers and, later, dealers can trust the counts.

**Sellers choose their channels.** Chat is always on; calls and WhatsApp can each be switched off. The car page hides the button straight away.

**Chat updates by polling, not websockets.** The open chat asks for new messages every 4 seconds (30 when the tab is hidden), and the header checks once a minute. It works on every network and host and costs little at launch volumes. Supabase Realtime is the upgrade when traffic justifies it; the page code changes, the data model doesn't.

**Warn about payment talk, don't block it.** Messages mentioning deposits, M-Pesa, paybill, booking or viewing fees and similar are flagged by the database. The reader sees a warning under them. Blocking would push those conversations to WhatsApp, where we can't warn anyone.

**One outbox for every SMS and email.** Nothing calls a provider directly: rows go into `private.deliveries`, a job sends them, failures retry twice, and admins see exactly what went out. Switching to Africa's Talking or changing email provider is one setting.

**SMS for new messages: only when it helps.** Wait a minute, skip if read in the app, at most one per chat every 30 minutes, and at most 12 SMS per person a day. Live chats cost nothing in SMS, and a buyer who forgets their phone still hears about a reply.

**Saved-search SMS default to a daily summary at 08:00.** Instant and off are one tap away, per channel. The daily summary costs one SMS per buyer per day at most.

**Texts stay in one SMS segment.** Everything is converted to the GSM-7 alphabet (one curly quote or emoji would make an SMS Unicode, cutting it from 160 to 70 characters and doubling the cost). Message excerpts are trimmed to fit, and links are short (`/m/<8 characters>`).

**Short links are resolved in the proxy and at sign-in.** After signing in, Next.js reaches the destination from inside a Server Action and can't follow another redirect. So `/m/…` and `/s/…` are resolved before the page and again when sign-in finishes.

**Email is optional and verified by code.** Most buyers and sellers live on SMS and WhatsApp; email is for those who want a record. A 6-digit code sent through the same outbox proves the address, and the code is wiped once sent.

**Admins can read every chat, but don't count it as theirs.** The access is for handling reports (Sprint 6). Unread badges only count the person's own conversations.

## Sprint 4 (December 2026)

**Approval before stock.** A dealership can prepare its team and spreadsheet while waiting, but can't list cars until a reviewer has checked the KRA PIN certificate, business registration and owner's ID. The badge means something only if nobody gets it by default.

**Documents in their own private bucket, not on the dealer row.** Only owners, managers and reviewers can open them, through 5–10 minute signed links. The dealer row stays public; the KYC row and files never are.

**Verified details lock on approval.** Business name, county and KRA PIN change through support after approval, so an approved badge can't be moved to a different business.

**Trusted dealers skip the review queue, not the Passport.** Admins can let an established dealer publish on submission; any car whose mileage history raises a flag still waits for a reviewer. This answers the open question from Sprint 1 with a per-dealer switch rather than a blanket rule.

**Staff join by phone number, with an SMS.** No email invitations or links to forward: the owner types a number; existing users join at once, new ones the first time they sign in with it. Nobody can be added silently, and memberships can't be reassigned to someone else.

**The dealership is the seller.** Buyers see and message the dealer, never the salesperson. The listing remembers which colleague added it (for the stock list and the new-message SMS), and any colleague can reply. A buyer's message read by one colleague is read for all, so nobody gets a pointless SMS.

**CSV, checked in the browser, imported row by row.** Most yards keep stock in Excel; CSV export works from Excel, Google Sheets and Numbers without another library. Checking in the browser shows every problem before anything is saved; the database checks again and a bad row never blocks the rest. Cars arrive as drafts, because a car without photos shouldn't go on sale.

**Photos matched by file name.** Naming files after the chassis number is something a yard can do with its phone's gallery or a laptop, and it lets one drop handle 30 cars. The same file-name rule marks the dashboard photo.

**Views: once per visitor per day, stored as a hash.** The server hashes the network address and browser with a secret and the date; the hash can't be traced back and is deleted the next day. Bots, the seller and the dealer's staff don't count. Counting a view doesn't change a listing's "last updated" time.

## Open questions

- Final platform name and domain.
- Which dealers get "publish without review" at launch (built as a per-dealer admin switch, off by default).
- Whether reviewed auction sheets should be viewable by buyers (they carry no personal data and are the strongest trust signal).
- How long to keep Passport documents after an account is deleted (Data Protection Act retention policy).
- Starting dealer plan prices (5,000 / 12,000 / 25,000 KSh are hypotheses to test with 10–20 dealers).
- Cashia sandbox keys and API reference for hold, payout and refund (needed by Sprint 5).
- Saved-search SMS default: built as a daily 08:00 summary with instant and off as options. Confirm, or switch the default to instant.
- Email provider (Resend is wired in; any HTTPS email API fits the same interface) and the sending domain.
- Africa's Talking sender ID (e.g. MAGARI) to register once the platform name is final.
- Rate limits for the public search count endpoint and server actions (planned for Sprint 7's security review).
- Dealer logos on showroom pages and cards (the column exists; upload is not built yet).
