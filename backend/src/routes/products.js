/**
 * Products router
 *
 * GET /api/products
 *   ?limit=20          (default 20, max 100)
 *   ?category=Books    (optional filter)
 *   ?cursor=<token>    (opaque base64 cursor for next page)
 *
 * Pagination strategy: KEYSET (cursor-based), NOT offset.
 *
 * Why not OFFSET?
 *   With OFFSET N, the DB scans and discards N rows every time.
 *   More importantly, if new products are inserted while browsing:
 *     - Rows shift down → page 2 might repeat a row from page 1
 *     - Or a row is skipped entirely
 *   This is the "phantom row" problem and it's inherent to offset pagination.
 *
 * Keyset solution:
 *   We order by (created_at DESC, id DESC). The cursor encodes the
 *   (created_at, id) of the LAST item the client saw. The next page query is:
 *
 *     WHERE (created_at, id) < (cursor_ts, cursor_id)
 *
 *   This is stable: new inserts have newer timestamps so they don't shift
 *   existing items' positions relative to each other. The client sees a
 *   consistent snapshot moving forward through time.
 *
 *   The composite index on (created_at DESC, id DESC) makes this O(log N)
 *   instead of O(N) — the DB seeks directly to the cursor position.
 */

const express = require('express');
const router = express.Router();
const pool = require('../db');

const VALID_CATEGORIES = [
  'Electronics', 'Clothing', 'Home & Kitchen', 'Books', 'Sports & Outdoors',
  'Beauty & Personal Care', 'Toys & Games', 'Automotive', 'Health & Wellness',
  'Office Supplies', 'Garden & Outdoor', 'Food & Grocery',
];

function encodeCursor(createdAt, id) {
  const payload = JSON.stringify({ ts: createdAt, id });
  return Buffer.from(payload).toString('base64url');
}

function decodeCursor(token) {
  try {
    const payload = Buffer.from(token, 'base64url').toString('utf8');
    const { ts, id } = JSON.parse(payload);
    if (!ts || !id) throw new Error('Invalid cursor fields');
    return { ts: new Date(ts), id };
  } catch {
    return null;
  }
}

// GET /api/products
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const category = req.query.category || null;
    const cursorToken = req.query.cursor || null;

    // Validate category if provided
    if (category && !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    // Decode cursor if provided
    let cursor = null;
    if (cursorToken) {
      cursor = decodeCursor(cursorToken);
      if (!cursor) {
        return res.status(400).json({ error: 'Invalid cursor token' });
      }
    }

    // Build the query dynamically based on whether we have a cursor and/or category.
    // The ROW comparison (created_at, id) < ($ts, $id) is crucial:
    // PostgreSQL evaluates row constructors correctly, matching our composite index.
    const params = [];
    const conditions = [];

    if (category) {
      params.push(category);
      conditions.push(`category = $${params.length}`);
    }

    if (cursor) {
      params.push(cursor.ts);
      params.push(cursor.id);
      // Row value comparison — uses the composite index efficiently
      conditions.push(`(created_at, id) < ($${params.length - 1}, $${params.length})`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit + 1); // Fetch one extra to determine if there's a next page

    const sql = `
      SELECT id, name, category, price, created_at, updated_at
      FROM products
      ${whereClause}
      ORDER BY created_at DESC, id DESC
      LIMIT $${params.length}
    `;

    const { rows } = await pool.query(sql, params);

    const hasNextPage = rows.length > limit;
    const products = hasNextPage ? rows.slice(0, limit) : rows;

    // Build next cursor from the last item returned
    let nextCursor = null;
    if (hasNextPage && products.length > 0) {
      const last = products[products.length - 1];
      nextCursor = encodeCursor(last.created_at, last.id);
    }

    res.json({
      data: products,
      pagination: {
        limit,
        hasNextPage,
        nextCursor,
        // Send back the current cursor too, so client can track position
        currentCursor: cursorToken || null,
      },
    });
  } catch (err) {
    console.error('GET /api/products error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/products/categories — list all valid categories with counts
router.get('/categories', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT category, COUNT(*) AS count
      FROM products
      GROUP BY category
      ORDER BY category
    `);
    res.json({ data: rows });
  } catch (err) {
    console.error('GET /api/products/categories error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/products/:id — single product
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM products WHERE id = $1',
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    res.json({ data: rows[0] });
  } catch (err) {
    console.error('GET /api/products/:id error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
