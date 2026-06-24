/**
 * Seed script: generates 200,000 products using PostgreSQL's unnest()
 * for a single bulk INSERT instead of 200,000 individual queries.
 *
 * unnest() unpacks arrays into rows server-side — the DB engine
 * handles the expansion, so we only make one round-trip per batch.
 * This runs in seconds vs minutes with a JS loop approach.
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

const CATEGORIES = [
  'Electronics', 'Clothing', 'Home & Kitchen', 'Books', 'Sports & Outdoors',
  'Beauty & Personal Care', 'Toys & Games', 'Automotive', 'Health & Wellness',
  'Office Supplies', 'Garden & Outdoor', 'Food & Grocery',
];

const ADJECTIVES = ['Premium', 'Deluxe', 'Ultra', 'Pro', 'Essential', 'Classic', 'Advanced', 'Smart'];
const NOUNS = ['Widget', 'Gadget', 'Device', 'Tool', 'Kit', 'Set', 'Pack', 'Bundle'];

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomPrice() {
  return (Math.random() * 999 + 1).toFixed(2);
}

function randomDate(start, end) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

async function seed() {
  const client = await pool.connect();

  try {
    console.log('Creating products table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        name        TEXT        NOT NULL,
        category    TEXT        NOT NULL,
        price       NUMERIC(10, 2) NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    // Composite index is the KEY to fast keyset pagination:
    // WHERE (created_at, id) < (cursor_ts, cursor_id)
    // ORDER BY created_at DESC, id DESC
    // Without this, every paginated query is a full table scan.
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_products_created_at_id
        ON products (created_at DESC, id DESC)
    `);

    // Separate index for category filtering + keyset
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_products_category_created_at_id
        ON products (category, created_at DESC, id DESC)
    `);

    console.log('Checking existing rows...');
    const { rows: countRows } = await client.query('SELECT COUNT(*) FROM products');
    const existing = parseInt(countRows[0].count, 10);
    if (existing >= 200000) {
      console.log(`Already have ${existing} products. Skipping seed.`);
      return;
    }

    const TOTAL = 200000;
    const BATCH_SIZE = 10000; // Each unnest call inserts 10k rows
    const startDate = new Date('2022-01-01');
    const endDate = new Date('2025-12-31');

    console.log(`Seeding ${TOTAL} products in batches of ${BATCH_SIZE}...`);

    let inserted = 0;
    while (inserted < TOTAL) {
      const batchCount = Math.min(BATCH_SIZE, TOTAL - inserted);

      const names = [];
      const categories = [];
      const prices = [];
      const createdAts = [];

      for (let i = 0; i < batchCount; i++) {
        names.push(`${randomItem(ADJECTIVES)} ${randomItem(NOUNS)} ${inserted + i + 1}`);
        categories.push(randomItem(CATEGORIES));
        prices.push(randomPrice());
        createdAts.push(randomDate(startDate, endDate).toISOString());
      }

      // unnest() expands each array into rows in parallel — one INSERT for 10k rows
      await client.query(`
        INSERT INTO products (name, category, price, created_at, updated_at)
        SELECT
          unnest($1::text[]),
          unnest($2::text[]),
          unnest($3::numeric[]),
          unnest($4::timestamptz[]),
          unnest($4::timestamptz[])
      `, [names, categories, prices, createdAts]);

      inserted += batchCount;
      console.log(`  Inserted ${inserted} / ${TOTAL}`);
    }

    const { rows: final } = await client.query('SELECT COUNT(*) FROM products');
    console.log(`\nDone. Total products in DB: ${final[0].count}`);
  } catch (err) {
    console.error('Seed failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
