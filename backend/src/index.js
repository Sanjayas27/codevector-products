require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pool = require('./db');
const productsRouter = require('./routes/products');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT COUNT(*) AS total FROM products');
    res.json({ status: 'ok', totalProducts: parseInt(rows[0].total, 10) });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.use('/api/products', productsRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
