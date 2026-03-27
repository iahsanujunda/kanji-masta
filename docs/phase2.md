# Phase 8 — Offline Hunting: Live Hunt Sessions

This phase brings the hunt session — the moment cards enter the platform — fully into the system. Today the upload and review happen in the app, but the window announcement is a WhatsApp message, demand is tracked mentally, and customers who miss the message miss the window entirely.

**Why now:** The hunt session is the top of the funnel. Without it, the highest-frequency operator activity generates no structured data, demand signals are invisible, and the WhatsApp group remains the primary product. Bringing the session into the platform also enables scheduled announcements — customers can see upcoming hunts in advance and opt in to be notified when the window opens, replacing the current dependency on catching a WhatsApp message at the right moment.

**Current workflow (unchanged by this phase):**
1. Operator goes to shop, photographs showcases
2. Uploads to system via existing ingest flow
3. System runs Gemini OCR, extracts cards
4. Operator reviews in `inventory_image_detail` — fixes names, prices
5. *(currently)* Sends WhatsApp message: "etalase sudah diupload, 30 menit ya"
6. Customers open gallery, place orders through the system
7. Operator returns to shop, buys

**What changes:** Steps 5–7 move into the platform. Steps 1–4 are untouched.

**Approach:** Iteration 18 proves the end-to-end loop using existing infrastructure for upload, review, and fulfillment. The only genuinely new surfaces are session lifecycle management, scheduled hunt visibility for customers, notification opt-in, and the live hunt card in the gallery. Iteration 19 adds the mobile pipeline screen, bulk actions, and the multi-tenant foundation.

---

# Iteration 18 — Hunt Session MVP

### 1. Database Schema & Migration (Supabase)

**A. Hunt sessions table:**

```sql
CREATE TABLE hunt_sessions (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operator_id      UUID NOT NULL REFERENCES operators(id),
    shop_name        TEXT NOT NULL,
    window_minutes   INT NOT NULL DEFAULT 30,
    scheduled_for    TIMESTAMPTZ,        -- NULL = unscheduled; set when operator announces in advance
    opens_at         TIMESTAMPTZ,        -- set when status transitions to OPEN
    closes_at        TIMESTAMPTZ,        -- set when status transitions to OPEN
    status           TEXT NOT NULL DEFAULT 'SCHEDULED',
                     -- SCHEDULED | DRAFT | OPEN | CLOSED | PURCHASING | DONE | ABANDONED
    notes            TEXT,
    created_by       UUID NOT NULL REFERENCES auth.users(id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE hunt_sessions ENABLE ROW LEVEL SECURITY;

-- Only one OPEN session per operator at a time
CREATE UNIQUE INDEX idx_hunt_sessions_one_open_per_operator
    ON hunt_sessions(operator_id)
    WHERE status = 'OPEN';

CREATE INDEX idx_hunt_sessions_status      ON hunt_sessions(status);
CREATE INDEX idx_hunt_sessions_operator    ON hunt_sessions(operator_id);
CREATE INDEX idx_hunt_sessions_scheduled   ON hunt_sessions(scheduled_for)
    WHERE scheduled_for IS NOT NULL AND status = 'SCHEDULED';

CREATE TRIGGER set_hunt_sessions_updated_at
    BEFORE UPDATE ON hunt_sessions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

**Status lifecycle:**

```
SCHEDULED ──→ DRAFT ──→ OPEN ──→ CLOSED ──→ PURCHASING ──→ DONE
    │            │                                │
    └────────────┴────────────────────────────────┴──→ ABANDONED
```

- `SCHEDULED` — operator has announced a future hunt. Customers can see it and opt in to notifications. No images linked yet.
- `DRAFT` — operator has linked processed showcase images and is ready to open the window. Not yet visible as "live" to customers.
- `OPEN` — window is active. Customers can request cards. Timer counts down.
- `CLOSED` — window has expired (auto or manual). No new requests accepted.
- `PURCHASING` — operator is back at the shop counter executing buys.
- `DONE` — all cards actioned (secured or sold out). Session complete.
- `ABANDONED` — session cancelled at any point before DONE.

**B. Junction table — session images:**

Images are processed before a session exists. The session references already-processed images rather than images pointing back to sessions. This keeps the ingest flow unchanged.

```sql
CREATE TABLE hunt_session_images (
    hunt_session_id    UUID NOT NULL REFERENCES hunt_sessions(id) ON DELETE CASCADE,
    inventory_image_id UUID NOT NULL REFERENCES inventory_images(id) ON DELETE CASCADE,
    added_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (hunt_session_id, inventory_image_id)
);

CREATE INDEX idx_hunt_session_images_session ON hunt_session_images(hunt_session_id);
CREATE INDEX idx_hunt_session_images_image   ON hunt_session_images(inventory_image_id);
```

`inventory_images` table is not modified.

**C. Notification opt-in table:**

```sql
CREATE TABLE hunt_session_optins (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hunt_session_id UUID NOT NULL REFERENCES hunt_sessions(id) ON DELETE CASCADE,
    customer_id     UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    opted_in_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notified_at     TIMESTAMPTZ,    -- set when HUNT_WINDOW_OPEN notification is sent to this customer
    UNIQUE (hunt_session_id, customer_id)
);

CREATE INDEX idx_hunt_optins_session  ON hunt_session_optins(hunt_session_id);
CREATE INDEX idx_hunt_optins_customer ON hunt_session_optins(customer_id);
```

**D. Operators seed row:**

```sql
INSERT INTO operators (id, name, slug, mode, is_active)
VALUES (gen_random_uuid(), 'Toko Izin Istri', 'tokoizinistri', 'ANCHOR', TRUE);
```

---

### 2. Backend: Hunt Session API (FastAPI)

New module: `server/modules/hunt/`

**A. Endpoints:**

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| `POST` | `/api/hunt-sessions` | Operator | Create session (SCHEDULED or jump straight to DRAFT) |
| `GET` | `/api/hunt-sessions` | Operator | List sessions, filterable by `?status=` |
| `GET` | `/api/hunt-sessions/{id}` | Operator | Session detail with linked images and opt-in count |
| `POST` | `/api/hunt-sessions/{id}/images` | Operator | Add processed images to session (SCHEDULED or DRAFT) |
| `DELETE` | `/api/hunt-sessions/{id}/images/{imageId}` | Operator | Remove image from session before window opens |
| `PATCH` | `/api/hunt-sessions/{id}/ready` | Operator | Transition SCHEDULED → DRAFT (images linked, ready to open) |
| `PATCH` | `/api/hunt-sessions/{id}/open` | Operator | Transition DRAFT → OPEN (starts window, fires notifications) |
| `PATCH` | `/api/hunt-sessions/{id}/close` | Operator | Transition OPEN → CLOSED (manual early close) |
| `PATCH` | `/api/hunt-sessions/{id}/purchasing` | Operator | Transition CLOSED → PURCHASING |
| `PATCH` | `/api/hunt-sessions/{id}/done` | Operator | Transition PURCHASING → DONE |
| `PATCH` | `/api/hunt-sessions/{id}/abandon` | Operator | Any status → ABANDONED |
| `GET` | `/api/hunt-sessions/{id}/demand` | Operator | Buy list grouped by showcase |
| `GET` | `/api/public/hunt-sessions/upcoming` | None | Scheduled sessions visible to all customers |
| `POST` | `/api/hunt-sessions/{id}/optin` | Customer | Opt in to window-open notification |
| `DELETE` | `/api/hunt-sessions/{id}/optin` | Customer | Remove opt-in |
| `GET` | `/api/hunt-sessions/{id}/optin` | Customer | Check own opt-in status |

**B. Create session:**

`POST /api/hunt-sessions`

```json
{
  "shop_name": "Card Secret Akihabara",
  "window_minutes": 30,
  "scheduled_for": "2026-04-05T10:00:00+09:00",
  "notes": "Fokus etalase AR dan SAR"
}
```

`scheduled_for` is optional. If omitted, session is created as `DRAFT` directly (operator is ready to open now). If set, session is created as `SCHEDULED` and becomes visible to customers in the upcoming hunts feed.

**C. Open window:**

`PATCH /api/hunt-sessions/{id}/open`

Logic:
1. Verify `status = DRAFT`
2. Verify at least one image is linked via `hunt_session_images`
3. Verify no other `OPEN` session for this operator — DB unique index enforces, return `409` with clear message if violated
4. Set `opens_at = now()`, `closes_at = now() + window_minutes * interval '1 minute'`, `status = OPEN`
5. Notify customers:
    - **Opted-in customers** (from `hunt_session_optins`): send `HUNT_WINDOW_OPEN` notification, set `notified_at`
    - **All other operator customers**: send `HUNT_WINDOW_OPEN` notification
    - Both groups receive the same notification — opt-in just guarantees delivery regardless of other notification settings
6. Invalidate `gallery_base` cache
7. Cron auto-close scheduled at `closes_at`

**D. Public upcoming sessions endpoint:**

`GET /api/public/hunt-sessions/upcoming`

Returns sessions with `status = SCHEDULED`, ordered by `scheduled_for` ascending. Only returns sessions where `scheduled_for` is in the future.

Response:
```json
{
  "sessions": [
    {
      "id": "uuid",
      "shop_name": "Card Secret Akihabara",
      "scheduled_for": "2026-04-05T10:00:00+09:00",
      "window_minutes": 30,
      "notes": "Fokus etalase AR dan SAR",
      "optin_count": 14,
      "viewer_has_opted_in": false
    }
  ]
}
```

`viewer_has_opted_in` is `false` for unauthenticated requests, derived from `hunt_session_optins` for authenticated customers.

Cached with TTL 60s. Invalidated when any session transitions into or out of `SCHEDULED`.

**E. Demand summary:**

`GET /api/hunt-sessions/{id}/demand`

```json
{
  "session_id": "uuid",
  "shop_name": "Card Secret Akihabara",
  "total_requests": 14,
  "estimated_value_jpy": 142000,
  "showcases": [
    {
      "inventory_image_id": "uuid",
      "image_title": "Showcase A",
      "image_url": "https://...",
      "items": [
        {
          "card_id": "uuid",
          "card_name": "Latias ex",
          "price_jpy": 8000,
          "request_count": 3,
          "queue_positions": [
            { "position": 1, "customer_name": "Andi W." },
            { "position": 2, "customer_name": "Budi S." },
            { "position": 3, "customer_name": "Citra M." }
          ],
          "is_high_value": true
        }
      ]
    }
  ]
}
```

`is_high_value`: `true` when `price_jpy` exceeds the threshold in `app_settings` (default ¥5,000). High-value items require an explicit confirmation checkbox in the UI before "Secure" becomes active.

**F. Auto-close cron:**

Add to `scheduler.py`:
```python
async def close_expired_hunt_sessions():
    """Close OPEN sessions whose closes_at has passed."""
    db.hunt_sessions.update(
        {"status": "CLOSED"},
        {"status": "OPEN", "closes_at": {"lt": now()}}
    )
```
Runs every 60 seconds. Same pattern as `expire_stale_public_images`.
Cron endpoint: `POST /api/cron/close-expired-hunt-sessions` (service token auth).

**G. Gallery API — inject active and upcoming sessions:**

`GET /api/public/gallery`

Add to response envelope:
```json
{
  "active_hunt": {
    "id": "uuid",
    "shop_name": "Card Secret Akihabara",
    "status": "OPEN",
    "closes_at": "2026-04-05T10:30:00+09:00",
    "window_minutes": 30,
    "image_ids": ["uuid1", "uuid2"]
  },
  "upcoming_hunt": {
    "id": "uuid",
    "shop_name": "Radio Kaikan (2F)",
    "scheduled_for": "2026-04-07T14:00:00+09:00",
    "window_minutes": 45,
    "optin_count": 8,
    "viewer_has_opted_in": false
  },
  "batches": [...]
}
```

`active_hunt` is `null` when no OPEN session. `upcoming_hunt` is the next SCHEDULED session, `null` if none. At most one of each is returned. Both are injected as distinct cards in the gallery feed.

**H. Notification templates:**

Add to `translations` table:

| namespace | key | lang | value |
|-----------|-----|------|-------|
| `notifications.HUNT_WINDOW_OPEN` | `title` | `id` | `Hunting live sekarang!` |
| `notifications.HUNT_WINDOW_OPEN` | `message` | `id` | `{{shop_name}} — {{window_minutes}} menit tersisa untuk request kartu` |
| `notifications.HUNT_WINDOW_OPEN` | `title` | `en` | `Live hunt is open!` |
| `notifications.HUNT_WINDOW_OPEN` | `message` | `en` | `{{shop_name}} — {{window_minutes}} minutes left to request cards` |
| `notifications.HUNT_SCHEDULED` | `title` | `id` | `Hunting dijadwalkan!` |
| `notifications.HUNT_SCHEDULED` | `message` | `id` | `{{shop_name}} akan hunting pada {{scheduled_date}}. Mau diingatkan?` |
| `notifications.HUNT_SCHEDULED` | `title` | `en` | `Hunt session scheduled` |
| `notifications.HUNT_SCHEDULED` | `message` | `en` | `{{shop_name}} hunting on {{scheduled_date}}. Want a reminder?` |

`HUNT_SCHEDULED` is sent to all operator customers when a new SCHEDULED session is created, giving them a chance to opt in before the window opens.

---

### 3. Frontend: Operator — Session Management

**File:** `client/app/routes/operator/hunting_queue.tsx`

Add **"Hunt Sessions"** tab alongside existing tabs (Waiting, Check Condition, Cancel Requests, Wishlists).

**Session list:**

```
┌──────────────────────────────────────────────────────────────┐
│ Card Secret Akihabara      [OPEN]    14:22 remaining         │
│ Started 10:02  ·  30 min window  ·  14 requests             │
│                                          [View Demand List]  │
├──────────────────────────────────────────────────────────────┤
│ Radio Kaikan (2F)          [SCHEDULED]  Sat 5 Apr · 10:00   │
│ 45 min window  ·  8 opted in  ·  "Fokus etalase AR"        │
│                              [Link Images]  [Edit]  [Cancel] │
├──────────────────────────────────────────────────────────────┤
│ Surugaya Akihabara         [DONE]   2026-03-26              │
│ 23 cards secured  ·  4 sold out                             │
│                                              [View Session]  │
└──────────────────────────────────────────────────────────────┘
```

Status chip colours: `OPEN` → error (red, pulsing), `SCHEDULED` → info (blue), `DRAFT` → warning (amber), `CLOSED` → default, `PURCHASING` → warning, `DONE` → success, `ABANDONED` → default muted.

**"+ New Session" button** opens a dialog. Two paths:

*Path A — Schedule in advance:*
- Shop name (text input or autocomplete from `source_shops`)
- Date and time (`scheduled_for`) — date picker + time picker
- Window duration — segmented: 15 / 30 / 45 / 60 min
- Notes — optional free text ("Fokus etalase AR dan SAR")
- Creates `SCHEDULED` session → system sends `HUNT_SCHEDULED` notification to all customers

*Path B — Open now (skip scheduling):*
- Toggle: "Buka langsung sekarang"
- Same fields minus date/time
- Creates `DRAFT` session → operator immediately links images and opens window

**"Link Images" action (SCHEDULED sessions):**

Opens image picker: filtered to `inventory_images` with `processing_status = COMPLETED` from the last 7 days, not already linked to another active session. Operator selects one or more showcases → `POST /api/hunt-sessions/{id}/images` for each.

Once images are linked, session transitions to `DRAFT` via `PATCH /api/hunt-sessions/{id}/ready`. "Link Images" button becomes "Open Window →".

**Session detail — demand list:**

Rendered for `CLOSED` and `PURCHASING` sessions. Collapsible accordion per showcase. Each card item:

```
┌──────────────────────────────────────────────────────────┐
│ Latias ex                      3 requests    ¥8,000      │
│ [!] High value — confirm condition before securing        │
│ Queue: Andi W. (1)  ·  Budi S. (2)  ·  Citra M. (3)    │
│                                                          │
│  [ ] I've checked the condition                          │
│  [✓ Secure (3)]    [Partial...]    [✗ Sold Out]         │
└──────────────────────────────────────────────────────────┘
```

High-value items (`is_high_value: true`) lock the Secure button behind a confirmation checkbox. Checkbox is per-card, unchecked by default on page load.

"Secure (N)" calls `POST /api/operator/hunting/{requestId}/secured` sequentially for each queue position. Bulk endpoint deferred to Iteration 19.

---

### 4. Frontend: Customer — Gallery & Notifications

**Files:** `landing.tsx`, `portal/inventory.tsx`, `public_inventory_detail.tsx`

**A. Active hunt card (OPEN session)**

Injected at position 0 in the gallery feed when `active_hunt` is non-null in the gallery response. Distinct visual treatment — matches the dark live hunt card from the prototype.

Contents:
- "SEDANG LIVE" badge with animated pulse dot
- Shop name
- Countdown — derived from `closes_at`, recalculates every 60 seconds in JS
- "GABUNG HUNTING" button → navigates to gallery filtered by `active_hunt.image_ids`

After window closes: card transitions to "Window closed" state. No countdown. "Lihat kartu →" links to showcase images without a request button.

**B. Upcoming hunt card (SCHEDULED session)**

Injected at position 1 (below active if present, or position 0 if no active session) when `upcoming_hunt` is non-null.

```
┌─────────────────────────────────────────────────────────┐
│  UPCOMING HUNT                                           │
│  Card Secret Akihabara                                   │
│  Sabtu, 5 April · 10:00 WIB  ·  30 menit window        │
│  "Fokus etalase AR dan SAR"                             │
│                                                         │
│  14 orang mau diingatkan                               │
│                                                         │
│  [🔔 Ingatkan saya]                                     │
└─────────────────────────────────────────────────────────┘
```

"Ingatkan saya" / "Notify me":
- Unauthenticated: prompts login, then returns to this action
- Authenticated, not opted in: calls `POST /api/hunt-sessions/{id}/optin` → button becomes "✓ Akan diingatkan" (dismissible)
- Authenticated, opted in: button shows "✓ Akan diingatkan" with an × to remove opt-in (`DELETE /api/hunt-sessions/{id}/optin`)

`optin_count` updates optimistically on click (no refetch needed for the number).

**C. Countdown chip on individual gallery cards**

When a card's parent image belongs to the active hunt session:

```
┌──────────────────────────────┐
│ [Card image]                 │
│ Latias ex         ¥8,000    │
│ [🕐 22 menit tersisa]        │  ← red chip, hidden after closes_at
│ [Request Card]               │
└──────────────────────────────┘
```

**D. Window-closed card state**

After window expires:
- Request button replaced with muted "Window closed" label
- "Tambah ke wishlist →" CTA appears, pre-filling card name and `price_jpy`
- Calls existing `POST /api/storefront/wishlists`

**E. Notifications**

`HUNT_WINDOW_OPEN` and `HUNT_SCHEDULED` both route through the existing `notifications` table → Supabase Realtime → `useNotifications` hook → bell badge. No frontend changes needed for delivery. Notification body includes deep link via `action_url`.

---

### Files to Create

| File | Description |
|------|-------------|
| `supabase/migrations/XXXXXX_hunt_sessions.sql` | `hunt_sessions`, `hunt_session_images`, `hunt_session_optins` tables + indexes + trigger |
| `server/modules/hunt/__init__.py` | Module init |
| `server/modules/hunt/router.py` | All hunt session endpoints |

### Files to Modify

| File | Change |
|------|--------|
| `server/main.py` | Register hunt router |
| `server/modules/public_statement/router.py` | Inject `active_hunt` + `upcoming_hunt` into `GET /api/public/gallery` response |
| `server/core/scheduler.py` | Add `close_expired_hunt_sessions()` cron |
| `server/core/notifications.py` | Register `HUNT_WINDOW_OPEN` and `HUNT_SCHEDULED` notification types |
| `client/app/routes/operator/hunting_queue.tsx` | Hunt Sessions tab, session list, new session dialog, image picker |
| `client/app/routes/landing.tsx` | Active hunt card + upcoming hunt card injection |
| `client/app/routes/portal/inventory.tsx` | Same injections for authenticated portal view |
| `client/app/routes/public_inventory_detail.tsx` | Countdown chip, window-closed card state, wishlist CTA |
| `translations` table | `HUNT_WINDOW_OPEN` and `HUNT_SCHEDULED` templates (id + en) |

### Definition of Done

* [ ] Migration: `hunt_sessions` table with all statuses, unique index on single OPEN per operator, `updated_at` trigger
* [ ] Migration: `hunt_session_images` junction table
* [ ] Migration: `hunt_session_optins` table with unique constraint on (session, customer)
* [ ] FastAPI: `POST /api/hunt-sessions` — creates SCHEDULED (with `scheduled_for`) or DRAFT (without), sends `HUNT_SCHEDULED` notification when SCHEDULED
* [ ] FastAPI: `POST /api/hunt-sessions/{id}/images` — links processed images to session
* [ ] FastAPI: `PATCH /api/hunt-sessions/{id}/ready` — SCHEDULED → DRAFT
* [ ] FastAPI: `PATCH /api/hunt-sessions/{id}/open` — sets window times, notifies opted-in customers first then all others, returns 409 if another session already OPEN, validates at least one image is linked
* [ ] FastAPI: `PATCH /api/hunt-sessions/{id}/close` — OPEN → CLOSED
* [ ] FastAPI: Cron `close_expired_hunt_sessions` closes sessions past `closes_at`
* [ ] FastAPI: `GET /api/public/hunt-sessions/upcoming` — future SCHEDULED sessions with opt-in count
* [ ] FastAPI: `POST /api/hunt-sessions/{id}/optin` — idempotent, authenticated customers only
* [ ] FastAPI: `DELETE /api/hunt-sessions/{id}/optin` — remove opt-in
* [ ] FastAPI: `GET /api/hunt-sessions/{id}/demand` — buy list grouped by showcase with `is_high_value` flag
* [ ] FastAPI: `GET /api/public/gallery` includes `active_hunt` and `upcoming_hunt` in response envelope
* [ ] Operator UI: Hunt Sessions tab with session list and correct status chips
* [ ] Operator UI: New session dialog — Path A (scheduled) and Path B (open now)
* [ ] Operator UI: `HUNT_SCHEDULED` notification sent when scheduled session created
* [ ] Operator UI: Image picker for linking processed showcases to session
* [ ] Operator UI: Session transitions SCHEDULED → DRAFT → OPEN via UI actions
* [ ] Operator UI: Demand list grouped by showcase, high-value confirmation checkbox, secured/sold-out actions
* [ ] Customer UI: Active hunt card at position 0 in gallery when OPEN session exists
* [ ] Customer UI: Upcoming hunt card in gallery when SCHEDULED session exists
* [ ] Customer UI: "Ingatkan saya" opt-in button — login gate for unauthenticated, toggle for authenticated
* [ ] Customer UI: Opt-in count updates optimistically
* [ ] Customer UI: Countdown chip on gallery cards during active window
* [ ] Customer UI: Window-closed card state with wishlist CTA
* [ ] Customer UI: `HUNT_WINDOW_OPEN` and `HUNT_SCHEDULED` appear in notification dropdown with deep links
* [ ] Verified: scheduled path — create scheduled session → customers see upcoming card + opt in → link images → open window → opted-in customers notified → customers request → operator views demand → secure/sold-out → done
* [ ] Verified: direct path — create draft session → link images → open window immediately → rest of flow same

---

# Iteration 19 — Mobile Pipeline + Scale Hardening

Adds the mobile-optimised pipeline screen for in-shop use, bulk fulfillment actions, image compression, gallery discovery improvements, and the `operator_id` migration that makes the system multi-tenant ready.

### 1. Database Schema & Migration (Supabase)

**A. `operator_id` on core tables:**

```sql
-- Seed anchor operator first (done in Iteration 18)
-- Backfill all existing rows
UPDATE customers        SET operator_id = (SELECT id FROM operators WHERE slug = 'tokoizinistri');
UPDATE orders           SET operator_id = (SELECT id FROM operators WHERE slug = 'tokoizinistri');
UPDATE invoices         SET operator_id = (SELECT id FROM operators WHERE slug = 'tokoizinistri');
UPDATE inventory_images SET operator_id = (SELECT id FROM operators WHERE slug = 'tokoizinistri');
UPDATE hunt_sessions    SET operator_id = (SELECT id FROM operators WHERE slug = 'tokoizinistri');

-- Apply NOT NULL
ALTER TABLE customers        ALTER COLUMN operator_id SET NOT NULL;
ALTER TABLE orders           ALTER COLUMN operator_id SET NOT NULL;
ALTER TABLE invoices         ALTER COLUMN operator_id SET NOT NULL;
ALTER TABLE inventory_images ALTER COLUMN operator_id SET NOT NULL;

-- Row-level security
CREATE POLICY "operator_isolation" ON customers
    USING (operator_id = (SELECT operator_id FROM profiles WHERE id = auth.uid()));
-- Same pattern on orders, invoices, inventory_images, hunt_sessions
```

**B. Card condition field (LP support):**

```sql
ALTER TABLE cards
    ADD COLUMN condition TEXT NOT NULL DEFAULT 'NM';
    -- NM | LP | MP | HP | DMG
```

Existing `PATCH /api/cards/{id}` accepts this — add `condition` to the validated payload fields.

**C. Shop purchase limits:**

```sql
ALTER TABLE hunt_sessions
    ADD COLUMN default_shop_limit INT;  -- null = no limit known

CREATE TABLE hunt_session_card_limits (
    hunt_session_id UUID NOT NULL REFERENCES hunt_sessions(id) ON DELETE CASCADE,
    card_id         UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    max_purchasable INT NOT NULL,
    PRIMARY KEY (hunt_session_id, card_id)
);
```

### 2. Backend: Bulk Actions & Improvements

**A. Bulk secure:**

`POST /api/hunt-sessions/{id}/bulk-secure`

```json
{
  "actions": [
    { "card_id": "uuid", "quantity_secured": 2 },
    { "card_id": "uuid", "quantity_secured": 0 }
  ]
}
```

`quantity_secured = 0` → sold-out all queue positions for that card.
`quantity_secured > 0` → create orders for positions 1→N, sold-out N+1 onward.
All actions in a single DB transaction. Partial success not allowed.

Response:
```json
{ "secured": 5, "sold_out": 3, "notifications_sent": 8 }
```

**B. Buy list share image:**

`POST /api/hunt-sessions/{id}/summary`

Generates a shareable image of the demand list grouped by showcase. Same PIL/AWT approach as the existing `POST /api/inventory-image/{id}/summary-image`. Returns image URL. Operator shares to WhatsApp via native share sheet.

**C. Gallery single image — add navigation and wishlist context:**

`GET /api/public/gallery/{id}` additions:

```json
{
  "prev_image_id": "uuid | null",
  "next_image_id": "uuid | null",
  "hunt_session": { "status": "OPEN", "closes_at": "..." }
}
```

Per-card user overlay (authenticated only):
```json
{ "wishlist_match": true }
```

`wishlist_match` is `true` when any active wishlist entry for this customer fuzzy-matches `card.name` using the same Jaccard token similarity as `MetaDataMatcher` (threshold 0.6).

### 3. Frontend: Mobile Hunt Pipeline Screen

**File:** `client/app/routes/operator/hunt_pipeline.tsx`
**Route:** `/operator/hunt/{sessionId}`

Purpose-built for phone-in-hand in-shop use. Linked from the Hunt Sessions tab via "Pipeline View" per session. Runs alongside the desktop flow — operators can use either.

**Sticky progress header:**
```
1. Setup   2. Upload & Review   3. Live   4. Buy List
━━━━━━━━━━░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```
Active step = yellow, completed = green, future = slate.

**Stage 1 — Setup**

Fields: shop name, window duration (15/30/45/60), optional shop purchase limit ("max lembar per judul di toko ini"), LP mode toggle ("aktifkan field kondisi LP saat review kartu").

Creates or updates the session.

**Stage 2 — Upload & Review**

Image compression applied before upload:
```typescript
import imageCompression from 'browser-image-compression';
const compressed = await imageCompression(file, {
  maxSizeMB: 1,
  maxWidthOrHeight: 1920,
  useWebWorker: true,
});
```

Also applied to `arrivals_upload.tsx` — same change, different file.

Per-file progress:
```
showcase_A.jpg   ████████████████  Done ✓
showcase_B.jpg   ████████░░░░░░░░  Uploading…
showcase_C.jpg   ░░░░░░░░░░░░░░░░  Queued
showcase_D.jpg   ████░░░░░░░░░░░░  FAILED  [Retry ↺]
```

State per file: `QUEUED → COMPRESSING → UPLOADING → PROCESSING → DONE | FAILED`

Failed files show retry button — retries only that file.

Card review list after upload: editable name, editable price, condition toggle (NM / LP / MP) with price-override field for LP and MP. Calls existing `PATCH /api/cards/{id}`.

**Stage 3 — Live**

Circular countdown timer. Live stats polled every 30s from `GET /api/hunt-sessions/{id}/demand`:

```
┌──────────────┐   ┌──────────────┐
│      14      │   │   ¥142,000   │
│   REQUESTS   │   │    POTENSI   │
└──────────────┘   └──────────────┘
```

"Close Window Early" → `PATCH /api/hunt-sessions/{id}/close` → advance to Stage 4.

**Stage 4 — Buy List**

Grouped by showcase. Per card:
```
┌────────────────────────────────────────────────────┐
│ Latias ex                     3 reqs    ¥8,000     │
│ Shop limit: 2  ·  Andi (1)  ·  Budi (2)  ·  +1   │
│  [✓ Secure 2 of 3]   [Partial ▾]   [✗ Sold Out]  │
└────────────────────────────────────────────────────┘
```

Default "Secure N" = min(requests, shop_limit). "Partial" opens inline number picker. "Sold Out" fires sold-out for all positions.

Calls `POST /api/hunt-sessions/{id}/bulk-secure` with all actions in one request.

"Finish & Notify" at bottom → `DONE` status → fires `REQUEST_SECURED` and `REQUEST_SOLD_OUT` notifications via existing types.

"Share Buy List" → `POST /api/hunt-sessions/{id}/summary` → `navigator.share()`.

### 4. Frontend: Gallery Discovery Improvements

**File:** `client/app/routes/public_inventory_detail.tsx`

**Prev / next showcase navigation:**
```
← Showcase A     Showcase B     Showcase C →
```
Left/right arrow keys. Swipe gesture: `touchstart`/`touchend` delta > 50px. Uses `prev_image_id`/`next_image_id` from the updated API response — no extra calls.

**Viewed marking:**
On mount: write `imageId` to `localStorage['viewed_gallery_images']` (JSON array, max 200 entries, FIFO eviction). Portal inventory grid shows a "Sudah dilihat" chip on viewed images.

**Wishlist filter toggle:**
Filter button above card grid: "Tampilkan wishlist saya saja". Hides cards where `wishlist_match = false`. Matched cards get a wishlist badge in their corner. State persists in URL param `?wishlist_only=true`.

**Jump-to-match banner:**
When `wishlist_match = true` cards exist and filter is off:
```
┌──────────────────────────────────────┐
│  ★  2 kartu cocok wishlist kamu  ↓  │
└──────────────────────────────────────┘
```
Taps scroll to first match. Dismissed with ×. Dismissal saved to localStorage per image — doesn't reappear on revisit.

### Files to Create

| File | Description |
|------|-------------|
| `supabase/migrations/XXXXXX_operator_id_migration.sql` | Backfill + NOT NULL + RLS policies |
| `supabase/migrations/XXXXXX_card_condition.sql` | `cards.condition`, `hunt_session_card_limits` |
| `client/app/routes/operator/hunt_pipeline.tsx` | Mobile pipeline screen |

### Files to Modify

| File | Change |
|------|--------|
| `server/modules/hunt/router.py` | Add bulk-secure, summary endpoints |
| `server/modules/public_statement/router.py` | Add `prev_image_id`, `next_image_id`, `wishlist_match` to single gallery image response |
| `server/modules/inventory/router.py` | Add `condition` to `PATCH /api/cards/{id}` |
| `client/app/routes/operator/arrivals_upload.tsx` | Add image compression |
| `client/app/routes/public_inventory_detail.tsx` | Prev/next nav, viewed marking, wishlist badge, jump-to-match banner |
| `client/app/routes/portal/inventory.tsx` | Wishlist filter toggle, viewed chip on grid |
| `client/package.json` | Add `browser-image-compression` |

### Definition of Done

* [ ] Migration: `operator_id` backfilled on all core tables, NOT NULL applied, RLS policies enforced
* [ ] Migration: `cards.condition` column, `hunt_session_card_limits` table
* [ ] FastAPI: `POST /api/hunt-sessions/{id}/bulk-secure` — single transaction, returns counts
* [ ] FastAPI: `POST /api/hunt-sessions/{id}/summary` — generates shareable demand image
* [ ] FastAPI: `GET /api/public/gallery/{id}` returns `prev_image_id`, `next_image_id`, `wishlist_match` per card
* [ ] FastAPI: `PATCH /api/cards/{id}` accepts `condition` field
* [ ] Mobile pipeline: all 4 stages working end-to-end
* [ ] Mobile pipeline: per-file compression + progress + partial retry in Stage 2
* [ ] Mobile pipeline: condition toggle + tax label in Stage 2 card review
* [ ] Mobile pipeline: bulk secure with shop limit awareness in Stage 4
* [ ] Mobile pipeline: "Finish & Notify" fires all pending notifications
* [ ] Mobile pipeline: "Share Buy List" calls summary endpoint, opens native share sheet
* [ ] Image compression also applied to `arrivals_upload.tsx`
* [ ] Gallery: prev/next with keyboard + swipe
* [ ] Gallery: viewed chip on portal inventory grid
* [ ] Gallery: wishlist filter toggle + matched card badge
* [ ] Gallery: jump-to-match banner, dismissible, persists per image in localStorage
* [ ] RLS verified: operator A cannot read operator B's data
* [ ] Verified end-to-end mobile: scheduled session on desktop → customer opts in → images linked → window opens on mobile → customer requests → operator uses mobile buy list → bulk secure → done