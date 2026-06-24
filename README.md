# ProductVault — CodeVector Take-Home

Live demo: `< https://thunderous-jelly-3607d5.netlify.app>`  
API: ` https://codevector-products-1wp8.onrender.com/api/products`

---

## What I built

A backend API that lets you browse ~200,000 products (newest first), filter by category, and paginate through them safely even while data is being inserted or updated.

**Stack:**
- **Backend:** Node.js + Express
- **Database:** PostgreSQL (Neon — free, serverless)
- **Frontend:** React + Vite (bonus)
- **Hosting:** Render (backend), Netlify (frontend)

---

## The core problem: why offset pagination breaks

The naive approach is:

```sql
SELECT * FROM products ORDER BY created_at DESC LIMIT 20 OFFSET 40;
```

This looks fine but has two critical flaws:

**1. The phantom row problem (correctness)**  
If 50 new products arrive while you're on page 3, every existing product shifts down by 50 rows. When you go to page 4, you see products that were already on page 3. Or you skip products entirely. The task specifically required this to not happen.

**2. Performance at scale**  
With 200,000 rows, `OFFSET 100000` means PostgreSQL scans and discards 100,000 rows, then gives you 20. That's O(N) work for every page request, getting slower as you go deeper.

---

## The fix: keyset (cursor-based) pagination

Instead of "skip N rows", we ask "give me rows *after* this specific point".

The cursor encodes the `(created_at, id)` of the last item the client saw:

```sql
WHERE (created_at, id) < ($cursor_ts, $cursor_id)
ORDER BY created_at DESC, id DESC
LIMIT 20
```

**Why this is correct:** New inserts have newer `created_at` timestamps. They appear at the *start* of the list, not in the middle. Existing items' relative order never changes. The client's cursor stays valid no matter what gets inserted.

**Why this is fast:** PostgreSQL evaluates the row comparison `(created_at, id) < (x, y)` using the composite index directly — it seeks to the cursor position in O(log N) and reads forward. No rows are discarded.

**The cursor itself** is base64-encoded JSON (`{ ts, id }`) so it's opaque to the client but doesn't require any server-side session state.

---

## Indexes

```sql
-- Primary pagination index (all products, newest first)
CREATE INDEX idx_products_created_at_id
  ON products (created_at DESC, id DESC);

-- Category filter + keyset (avoids full scan when filtering)
CREATE INDEX idx_products_category_created_at_id
  ON products (category, created_at DESC, id DESC);
```

Without these, every paginated query is a full table scan. With them, each page fetch is O(log N) regardless of position.

---

## Seed script approach

The seed uses PostgreSQL's `unnest()` to insert rows in bulk:

```sql
INSERT INTO products (name, category, price, created_at, updated_at)
SELECT
  unnest($1::text[]),
  unnest($2::text[]),
  unnest($3::numeric[]),
  unnest($4::timestamptz[]),
  unnest($4::timestamptz[])
```

This sends 10,000 rows per round-trip (20 total round-trips for 200k rows) instead of 200,000 individual INSERT statements. Runs in seconds, not minutes.

---

## API

```
GET /api/products
  ?limit=20           (default 20, max 100)
  ?category=Books     (optional filter)
  ?cursor=<token>     (opaque cursor for next page)

GET /api/products/categories   (category list with counts)
GET /api/products/:id          (single product)
GET /health                    (health check + total count)
```

**Response shape:**
```json
{
  "data": [...],
  "pagination": {
    "limit": 20,
    "hasNextPage": true,
    "nextCursor": "eyJ0cyI6..."
  }
}
```

---

## Running locally

```bash
# Backend
cd backend
cp .env.example .env   # Fill in DATABASE_URL
npm install
npm run seed           # Seeds 200k products
npm run dev            # Starts on :3000

# Frontend
cd frontend
echo "VITE_API_URL=http://localhost:3000" > .env.local
npm install
npm run dev            # Starts on :5173
```

---

## What I'd improve with more time

1. **Search** — full-text search with `tsvector` and a GIN index, or integrate something like Meilisearch
2. **Sorting options** — price asc/desc, name — keyset cursors are more complex when the sort column isn't unique, would need to handle ties carefully  
3. **Rate limiting** — add `express-rate-limit` to the API
4. **Tests** — integration tests for the cursor logic, especially the edge cases (empty pages, last page, simultaneous inserts)
5. **Optimistic UI updates** — the frontend could show a skeleton while loading rather than dimming the current page

---

## How I used AI

I used Claude to help write this project, with the following breakdown:

**What AI helped with:**
- Boilerplate (Express setup, React component structure, CSS styling)  
- The `unnest()` bulk insert pattern — I knew batch inserts were the right call, and AI confirmed the specific PostgreSQL syntax
- Writing out the README explanation coherently

**What I figured out / verified myself:**
- The fundamental choice of keyset vs offset pagination — this is the actual engineering decision the task is testing
- The composite index design — understanding *why* `(category, created_at DESC, id DESC)` is the right shape for a filtered keyset query
- The row comparison syntax `(created_at, id) < ($ts, $id)` and confirming PostgreSQL will use the index for it
- The cursor stack approach on the frontend (maintaining a stack of cursors per page so "back" works correctly)
- AI initially suggested using `created_at` alone as the cursor key — I caught that this breaks for products with identical timestamps (a tie) and added `id` as the tiebreaker

**Full AI conversation:** [link if sharing]
