import { useState, useEffect, useCallback, useRef } from 'react'

const API = import.meta.env.VITE_API_URL || ''

const CATEGORY_COLORS = {
  'Electronics': '#6c6ef5',
  'Clothing': '#f43f5e',
  'Home & Kitchen': '#f59e0b',
  'Books': '#10b981',
  'Sports & Outdoors': '#06b6d4',
  'Beauty & Personal Care': '#ec4899',
  'Toys & Games': '#f97316',
  'Automotive': '#8b5cf6',
  'Health & Wellness': '#14b8a6',
  'Office Supplies': '#64748b',
  'Garden & Outdoor': '#84cc16',
  'Food & Grocery': '#ef4444',
}

function formatPrice(price) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(price)
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric'
  })
}

function CategoryBadge({ category }) {
  const color = CATEGORY_COLORS[category] || '#6c6ef5'
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: '4px',
      fontSize: '11px',
      fontWeight: 500,
      letterSpacing: '0.03em',
      background: color + '20',
      color: color,
      border: `1px solid ${color}30`,
    }}>
      {category}
    </span>
  )
}

function ProductCard({ product }) {
  return (
    <div className="product-card">
      <div className="product-card-top">
        <div className="product-name">{product.name}</div>
        <div className="product-price">{formatPrice(product.price)}</div>
      </div>
      <div className="product-card-bottom">
        <CategoryBadge category={product.category} />
        <div className="product-date">{formatDate(product.created_at)}</div>
      </div>
      <div className="product-id">
        <span className="mono">{product.id.slice(0, 8)}…</span>
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <div className="spinner-wrap">
      <div className="spinner" />
    </div>
  )
}

export default function App() {
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [selectedCategory, setSelectedCategory] = useState('')
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [error, setError] = useState(null)
  const [totalCount, setTotalCount] = useState(null)

  // Cursor stack: each entry is the cursor needed to fetch that page
  // page 0 = no cursor (first page)
  // page N = cursor from item N*limit on first load
  const [cursorStack, setCursorStack] = useState([null]) // [null] = first page has no cursor
  const [currentPage, setCurrentPage] = useState(0)
  const [nextCursor, setNextCursor] = useState(null)

  const limit = 20
  const abortRef = useRef(null)

  const fetchProducts = useCallback(async (cursor, category) => {
    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()

    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({ limit })
      if (cursor) params.set('cursor', cursor)
      if (category) params.set('category', category)

      const res = await fetch(`${API}/api/products?${params}`, {
        signal: abortRef.current.signal,
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()

      setProducts(json.data)
      setNextCursor(json.pagination.nextCursor)
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError('Failed to load products. Is the API running?')
      }
    } finally {
      setLoading(false)
      setInitialLoading(false)
    }
  }, [])

  // Fetch categories and total count on mount
  useEffect(() => {
    fetch(`${API}/api/products/categories`)
      .then(r => r.json())
      .then(json => {
        setCategories(json.data || [])
        const total = (json.data || []).reduce((sum, c) => sum + parseInt(c.count), 0)
        setTotalCount(total)
      })
      .catch(() => {})
  }, [])

  // Fetch whenever page or category changes
  useEffect(() => {
    const cursor = cursorStack[currentPage]
    fetchProducts(cursor, selectedCategory)
  }, [currentPage, cursorStack, selectedCategory, fetchProducts])

  const goNext = () => {
    if (!nextCursor) return
    const newStack = [...cursorStack]
    // Push next cursor at index currentPage+1 (overwrite if revisiting)
    newStack[currentPage + 1] = nextCursor
    setCursorStack(newStack)
    setCurrentPage(p => p + 1)
  }

  const goPrev = () => {
    if (currentPage === 0) return
    setCurrentPage(p => p - 1)
  }

  const handleCategoryChange = (cat) => {
    setSelectedCategory(cat)
    // Reset pagination when filter changes
    setCursorStack([null])
    setCurrentPage(0)
    setNextCursor(null)
  }

  const pageNumber = currentPage + 1

  return (
    <div className="app">
      <style>{`
        .app { max-width: 1100px; margin: 0 auto; padding: 32px 24px; }

        .header { margin-bottom: 36px; }
        .header-top { display: flex; align-items: baseline; gap: 16px; margin-bottom: 6px; }
        .logo { font-size: 22px; font-weight: 600; letter-spacing: -0.03em; color: var(--text-primary); }
        .logo span { color: var(--accent); }
        .subtitle { font-size: 13px; color: var(--text-muted); }
        .stat-pill {
          display: inline-flex; align-items: center; gap: 6px;
          background: var(--accent-dim); border: 1px solid var(--accent)30;
          color: var(--accent); border-radius: 20px;
          padding: 3px 12px; font-size: 12px; font-weight: 500;
        }
        .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--green); }

        .controls {
          display: flex; align-items: center; gap: 12px;
          margin-bottom: 24px; flex-wrap: wrap;
        }
        .controls-label { font-size: 12px; color: var(--text-muted); font-weight: 500; text-transform: uppercase; letter-spacing: 0.06em; }

        .cat-btn {
          padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 500;
          border: 1px solid var(--border); background: transparent; color: var(--text-secondary);
          transition: all 0.15s;
        }
        .cat-btn:hover { border-color: var(--border-hover); color: var(--text-primary); }
        .cat-btn.active {
          background: var(--accent); border-color: var(--accent); color: #fff;
        }

        .grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 12px;
          margin-bottom: 28px;
          min-height: 200px;
        }

        .product-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 16px;
          display: flex; flex-direction: column; gap: 10px;
          transition: border-color 0.15s, transform 0.15s;
        }
        .product-card:hover { border-color: var(--border-hover); transform: translateY(-1px); }
        .product-card-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
        .product-name { font-size: 14px; font-weight: 500; color: var(--text-primary); line-height: 1.4; flex: 1; }
        .product-price { font-size: 14px; font-weight: 600; color: var(--green); white-space: nowrap; font-variant-numeric: tabular-nums; }
        .product-card-bottom { display: flex; justify-content: space-between; align-items: center; }
        .product-date { font-size: 11px; color: var(--text-muted); }
        .product-id { font-size: 10px; color: var(--text-muted); border-top: 1px solid var(--border); padding-top: 8px; }
        .mono { font-family: 'DM Mono', monospace; }

        .pagination {
          display: flex; align-items: center; gap: 12px; justify-content: center;
          padding: 20px 0;
        }
        .page-btn {
          padding: 8px 20px; border-radius: var(--radius-sm); font-size: 13px; font-weight: 500;
          border: 1px solid var(--border); background: var(--surface); color: var(--text-secondary);
          transition: all 0.15s;
        }
        .page-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
        .page-btn:disabled { opacity: 0.35; cursor: not-allowed; }
        .page-info { font-size: 13px; color: var(--text-muted); }

        .spinner-wrap { display: flex; justify-content: center; align-items: center; padding: 60px; grid-column: 1/-1; }
        .spinner {
          width: 28px; height: 28px;
          border: 2px solid var(--border);
          border-top-color: var(--accent);
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .error-box {
          background: #ef444415; border: 1px solid #ef444440;
          border-radius: var(--radius); padding: 16px; color: #ef4444;
          font-size: 14px; text-align: center; grid-column: 1/-1;
        }
        .empty { text-align: center; color: var(--text-muted); font-size: 14px; padding: 60px; grid-column: 1/-1; }

        .loading-overlay { opacity: 0.5; pointer-events: none; }

        @media (max-width: 600px) {
          .app { padding: 20px 16px; }
          .grid { grid-template-columns: 1fr; }
        }
      `}</style>

      <header className="header">
        <div className="header-top">
          <div className="logo">Product<span>Vault</span></div>
          {totalCount !== null && (
            <span className="stat-pill">
              <span className="dot" />
              {totalCount.toLocaleString()} products
            </span>
          )}
        </div>
        <p className="subtitle">Browse products newest first · cursor-based pagination keeps results stable during live data changes</p>
      </header>

      <div className="controls">
        <span className="controls-label">Category</span>
        <button
          className={`cat-btn${selectedCategory === '' ? ' active' : ''}`}
          onClick={() => handleCategoryChange('')}
        >
          All
        </button>
        {categories.map(c => (
          <button
            key={c.category}
            className={`cat-btn${selectedCategory === c.category ? ' active' : ''}`}
            onClick={() => handleCategoryChange(c.category)}
          >
            {c.category}
            <span style={{ marginLeft: 6, opacity: 0.6, fontSize: 11 }}>
              {parseInt(c.count).toLocaleString()}
            </span>
          </button>
        ))}
      </div>

      <div className={`grid${loading && !initialLoading ? ' loading-overlay' : ''}`}>
        {initialLoading ? (
          <Spinner />
        ) : error ? (
          <div className="error-box">{error}</div>
        ) : products.length === 0 ? (
          <div className="empty">No products found.</div>
        ) : (
          products.map(p => <ProductCard key={p.id} product={p} />)
        )}
        {loading && !initialLoading && <Spinner />}
      </div>

      {!initialLoading && !error && products.length > 0 && (
        <div className="pagination">
          <button className="page-btn" onClick={goPrev} disabled={currentPage === 0 || loading}>
            ← Prev
          </button>
          <span className="page-info">Page {pageNumber}</span>
          <button className="page-btn" onClick={goNext} disabled={!nextCursor || loading}>
            Next →
          </button>
        </div>
      )}
    </div>
  )
}
