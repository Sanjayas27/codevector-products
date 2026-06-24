import { useState, useEffect, useCallback, useRef } from 'react'

const API = import.meta.env.VITE_API_URL || ''

const CATEGORY_META = {
  'Electronics':           { icon: '⚡', color: '#6366f1' },
  'Clothing':              { icon: '👕', color: '#ec4899' },
  'Home & Kitchen':        { icon: '🏠', color: '#f59e0b' },
  'Books':                 { icon: '📚', color: '#10b981' },
  'Sports & Outdoors':     { icon: '🏃', color: '#06b6d4' },
  'Beauty & Personal Care':{ icon: '✨', color: '#a855f7' },
  'Toys & Games':          { icon: '🎮', color: '#f97316' },
  'Automotive':            { icon: '🚗', color: '#8b5cf6' },
  'Health & Wellness':     { icon: '💊', color: '#14b8a6' },
  'Office Supplies':       { icon: '📎', color: '#64748b' },
  'Garden & Outdoor':      { icon: '🌿', color: '#84cc16' },
  'Food & Grocery':        { icon: '🛒', color: '#ef4444' },
}

function formatPrice(price) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(price)
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function SkeletonCard() {
  return (
    <div style={{
      background: 'var(--card-bg)', border: '1px solid var(--border)',
      borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 12
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <div className="skel" style={{ height: 16, borderRadius: 6, flex: 1 }} />
        <div className="skel" style={{ height: 16, borderRadius: 6, width: 64 }} />
      </div>
      <div className="skel" style={{ height: 12, borderRadius: 6, width: '60%' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
        <div className="skel" style={{ height: 22, borderRadius: 20, width: 80 }} />
        <div className="skel" style={{ height: 12, borderRadius: 6, width: 70 }} />
      </div>
    </div>
  )
}

function ProductCard({ product, index }) {
  const meta = CATEGORY_META[product.category] || { icon: '📦', color: '#6366f1' }
  return (
    <div className="p-card" style={{ animationDelay: `${index * 30}ms` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 6 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', lineHeight: 1.45, flex: 1 }}>
          {product.name}
        </div>
        <div style={{
          fontSize: 15, fontWeight: 700, color: '#22c55e',
          whiteSpace: 'nowrap', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums'
        }}>
          {formatPrice(product.price)}
        </div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace', marginBottom: 10, letterSpacing: '0.01em' }}>
        {product.id.slice(0, 8)}…{product.id.slice(-4)}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
          letterSpacing: '0.02em',
          background: meta.color + '18',
          color: meta.color,
          border: `1px solid ${meta.color}35`,
        }}>
          {meta.icon} {product.category}
        </span>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>{formatDate(product.created_at)}</span>
      </div>
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
  const [waking, setWaking] = useState(false)
  const [cursorStack, setCursorStack] = useState([null])
  const [currentPage, setCurrentPage] = useState(0)
  const [nextCursor, setNextCursor] = useState(null)
  const limit = 20
  const abortRef = useRef(null)

  const fetchWithRetry = useCallback(async (url, options, retries = 3) => {
    for (let i = 0; i < retries; i++) {
      try {
        const res = await fetch(url, options)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        setWaking(false)
        return res
      } catch (err) {
        if (err.name === 'AbortError') throw err
        if (i === 0) setWaking(true)
        if (i < retries - 1) await new Promise(r => setTimeout(r, 2500))
        else throw err
      }
    }
  }, [])

  const fetchProducts = useCallback(async (cursor, category) => {
    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ limit })
      if (cursor) params.set('cursor', cursor)
      if (category) params.set('category', category)
      const res = await fetchWithRetry(`${API}/api/products?${params}`, { signal: abortRef.current.signal })
      const json = await res.json()
      setProducts(json.data)
      setNextCursor(json.pagination.nextCursor)
    } catch (err) {
      if (err.name !== 'AbortError') { setWaking(false); setError('Could not reach the API. Please try again.') }
    } finally {
      setLoading(false)
      setInitialLoading(false)
    }
  }, [fetchWithRetry])

  useEffect(() => {
    fetch(`${API}/api/products/categories`)
      .then(r => r.json())
      .then(json => {
        setCategories(json.data || [])
        setTotalCount((json.data || []).reduce((s, c) => s + parseInt(c.count), 0))
      }).catch(() => {})
  }, [])

  useEffect(() => {
    fetchProducts(cursorStack[currentPage], selectedCategory)
  }, [currentPage, cursorStack, selectedCategory, fetchProducts])

  const goNext = () => {
    if (!nextCursor) return
    const s = [...cursorStack]
    s[currentPage + 1] = nextCursor
    setCursorStack(s)
    setCurrentPage(p => p + 1)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const goPrev = () => {
    if (currentPage === 0) return
    setCurrentPage(p => p - 1)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleCategory = (cat) => {
    setSelectedCategory(cat)
    setCursorStack([null])
    setCurrentPage(0)
    setNextCursor(null)
  }

  const activeCatCount = categories.find(c => c.category === selectedCategory)?.count
  const displayCount = selectedCategory ? activeCatCount : totalCount

  return (
    <>
      <style>{`
        :root {
          --bg: #09090b;
          --card-bg: #111113;
          --card-bg-hover: #161618;
          --border: #1f1f23;
          --border-hover: #2e2e34;
          --text: #f4f4f5;
          --sub: #a1a1aa;
          --muted: #52525b;
          --accent: #6366f1;
          --accent-glow: #6366f120;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: var(--bg); color: var(--text); font-family: 'Inter', 'DM Sans', system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
        
        .shell { min-height: 100vh; }
        
        .topbar {
          position: sticky; top: 0; z-index: 50;
          background: rgba(9,9,11,0.85); backdrop-filter: blur(12px);
          border-bottom: 1px solid var(--border);
          padding: 0 24px;
          display: flex; align-items: center; justify-content: space-between;
          height: 56px;
        }
        .logo { font-size: 17px; font-weight: 700; letter-spacing: -0.04em; color: var(--text); }
        .logo-accent { color: var(--accent); }
        .logo-dot { color: var(--accent); margin-right: 1px; }
        .topbar-right { display: flex; align-items: center; gap: 8px; }
        .live-badge {
          display: inline-flex; align-items: center; gap: 5px;
          background: #16a34a18; border: 1px solid #16a34a35;
          color: #22c55e; border-radius: 20px;
          padding: 3px 10px; font-size: 11px; font-weight: 600; letter-spacing: 0.03em;
        }
        .live-dot { width: 5px; height: 5px; border-radius: 50%; background: #22c55e; animation: pulse 2s ease-in-out infinite; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }

        .main { max-width: 1200px; margin: 0 auto; padding: 32px 24px 80px; }

        .hero { margin-bottom: 32px; }
        .hero-title { font-size: 28px; font-weight: 700; letter-spacing: -0.04em; margin-bottom: 6px; }
        .hero-title span { color: var(--accent); }
        .hero-sub { font-size: 13px; color: var(--sub); line-height: 1.6; max-width: 520px; }

        .stats-row { display: flex; gap: 12px; margin-bottom: 28px; flex-wrap: wrap; }
        .stat-card {
          background: var(--card-bg); border: 1px solid var(--border);
          border-radius: 10px; padding: 14px 18px; min-width: 140px;
        }
        .stat-label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; }
        .stat-value { font-size: 22px; font-weight: 700; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; }

        .filter-bar {
          background: var(--card-bg); border: 1px solid var(--border);
          border-radius: 12px; padding: 16px;
          margin-bottom: 20px;
          display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
        }
        .filter-label { font-size: 11px; color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.07em; white-space: nowrap; margin-right: 2px; }
        .cat-chip {
          padding: 5px 12px; border-radius: 20px; font-size: 12px; font-weight: 500;
          border: 1px solid var(--border); background: transparent; color: var(--sub);
          cursor: pointer; transition: all 0.12s; white-space: nowrap;
          display: inline-flex; align-items: center; gap: 4px;
        }
        .cat-chip:hover { border-color: var(--border-hover); color: var(--text); }
        .cat-chip.active { background: var(--accent); border-color: var(--accent); color: #fff; }
        .cat-chip-count { opacity: 0.65; font-size: 10px; }

        .waking-bar {
          background: #92400e18; border: 1px solid #92400e40;
          border-radius: 10px; padding: 10px 16px;
          color: #f59e0b; font-size: 13px; margin-bottom: 16px;
          display: flex; align-items: center; gap: 8px;
        }
        .spin { animation: spin 1s linear infinite; display: inline-block; }
        @keyframes spin { to { transform: rotate(360deg); } }

        .grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 12px;
          min-height: 300px;
          transition: opacity 0.15s;
        }
        .grid.dimmed { opacity: 0.4; pointer-events: none; }

        .p-card {
          background: var(--card-bg); border: 1px solid var(--border);
          border-radius: 12px; padding: 18px;
          cursor: default;
          transition: border-color 0.12s, background 0.12s, transform 0.12s;
          animation: fadeUp 0.25s ease both;
        }
        .p-card:hover { border-color: var(--border-hover); background: var(--card-bg-hover); transform: translateY(-2px); }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

        .skel { background: linear-gradient(90deg, var(--border) 25%, var(--border-hover) 50%, var(--border) 75%); background-size: 200% 100%; animation: shimmer 1.4s ease-in-out infinite; }
        @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

        .empty-state { grid-column: 1/-1; text-align: center; padding: 80px 20px; color: var(--muted); font-size: 14px; }
        .error-state { grid-column: 1/-1; background: #ef444412; border: 1px solid #ef444430; border-radius: 12px; padding: 20px; color: #ef4444; text-align: center; font-size: 14px; }
        .retry-btn { margin-top: 10px; background: transparent; border: 1px solid #ef444450; color: #ef4444; padding: 6px 16px; border-radius: 8px; font-size: 13px; cursor: pointer; }
        .retry-btn:hover { background: #ef444415; }

        .pagination {
          display: flex; align-items: center; justify-content: center; gap: 12px;
          margin-top: 32px; padding-top: 24px; border-top: 1px solid var(--border);
        }
        .page-btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 9px 20px; border-radius: 10px; font-size: 13px; font-weight: 500;
          border: 1px solid var(--border); background: var(--card-bg); color: var(--sub);
          cursor: pointer; transition: all 0.12s;
        }
        .page-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); background: var(--accent-glow); }
        .page-btn:disabled { opacity: 0.3; cursor: not-allowed; }
        .page-info {
          padding: 9px 16px; border-radius: 10px; font-size: 13px; font-weight: 600;
          background: var(--accent-glow); border: 1px solid var(--accent)40;
          color: var(--accent); min-width: 80px; text-align: center;
          letter-spacing: -0.01em;
        }

        @media (max-width: 640px) {
          .main { padding: 20px 16px 60px; }
          .hero-title { font-size: 22px; }
          .grid { grid-template-columns: 1fr; }
          .stats-row { gap: 8px; }
          .stat-card { min-width: 120px; }
        }
      `}</style>

      <div className="shell">
        <nav className="topbar">
          <div className="logo">
            <span className="logo-dot">◆</span> Product<span className="logo-accent">Vault</span>
          </div>
          <div className="topbar-right">
            {totalCount !== null && (
              <span className="live-badge">
                <span className="live-dot" /> Live
              </span>
            )}
          </div>
        </nav>

        <main className="main">
          <div className="hero">
            <h1 className="hero-title">Browse <span>200k</span> Products</h1>
            <p className="hero-sub">Newest first · cursor-based pagination guarantees no duplicates or skipped items, even as new products are added in real time.</p>
          </div>

          <div className="stats-row">
            <div className="stat-card">
              <div className="stat-label">Total products</div>
              <div className="stat-value" style={{ color: 'var(--accent)' }}>
                {totalCount !== null ? totalCount.toLocaleString() : '—'}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">{selectedCategory ? 'In category' : 'Per page'}</div>
              <div className="stat-value">
                {selectedCategory
                  ? (activeCatCount ? parseInt(activeCatCount).toLocaleString() : '—')
                  : limit}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Current page</div>
              <div className="stat-value">{currentPage + 1}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Categories</div>
              <div className="stat-value">{categories.length || '—'}</div>
            </div>
          </div>

          <div className="filter-bar">
            <span className="filter-label">Filter</span>
            <button
              className={`cat-chip${selectedCategory === '' ? ' active' : ''}`}
              onClick={() => handleCategory('')}
            >All</button>
            {categories.map(c => (
              <button
                key={c.category}
                className={`cat-chip${selectedCategory === c.category ? ' active' : ''}`}
                onClick={() => handleCategory(c.category)}
              >
                {CATEGORY_META[c.category]?.icon} {c.category}
                <span className="cat-chip-count">{parseInt(c.count).toLocaleString()}</span>
              </button>
            ))}
          </div>

          {waking && (
            <div className="waking-bar">
              <span className="spin">↻</span>
              Server waking from sleep (free tier) — retrying automatically…
            </div>
          )}

          <div className={`grid${(loading && !initialLoading) ? ' dimmed' : ''}`}>
            {initialLoading
              ? Array.from({ length: 12 }).map((_, i) => <SkeletonCard key={i} />)
              : error
                ? (
                  <div className="error-state">
                    {error}
                    <br />
                    <button className="retry-btn" onClick={() => fetchProducts(cursorStack[currentPage], selectedCategory)}>
                      Try again
                    </button>
                  </div>
                )
                : products.length === 0
                  ? <div className="empty-state">No products found in this category.</div>
                  : products.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)
            }
          </div>

          {!initialLoading && !error && products.length > 0 && (
            <div className="pagination">
              <button className="page-btn" onClick={goPrev} disabled={currentPage === 0 || loading}>
                ← Prev
              </button>
              <span className="page-info">Page {currentPage + 1}</span>
              <button className="page-btn" onClick={goNext} disabled={!nextCursor || loading}>
                Next →
              </button>
            </div>
          )}
        </main>
      </div>
    </>
  )
}
