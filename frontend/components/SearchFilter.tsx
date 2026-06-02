import React, { useEffect, useMemo, useRef, useState } from 'react'

type Item = {
  id: string | number
  date?: string // ISO date
  amount?: number
  description?: string
  [key: string]: any
}

type FilterState = {
  query: string
  operator: 'AND' | 'OR' | 'NOT'
  dateFrom?: string
  dateTo?: string
  amountMin?: number | ''
  amountMax?: number | ''
}

export default function SearchFilter({
  items,
  onResults,
  presets = [],
}: {
  items: Item[]
  onResults?: (results: Item[]) => void
  presets?: { id: string; name: string; filter: Partial<FilterState> }[]
}) {
  const [filter, setFilter] = useState<FilterState>({
    query: '',
    operator: 'AND',
  })

  const [savedFilters, setSavedFilters] = useState<{
    id: string
    name: string
    filter: FilterState
  }[]>(() => {
    try {
      const raw = localStorage.getItem('savedFilters')
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  })

  const [history, setHistory] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('searchHistory')
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  })

  const [results, setResults] = useState<Item[]>(items)
  const debounceRef = useRef<number | null>(null)

  useEffect(() => {
    // simple debounce
    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(() => {
      const r = applyFilter(items, filter)
      setResults(r)
      onResults?.(r)
      // update history for non-empty queries
      if (filter.query && filter.query.trim()) {
        setHistory((h) => {
          const next = [filter.query, ...h.filter((x) => x !== filter.query)].slice(0, 20)
          try {
            localStorage.setItem('searchHistory', JSON.stringify(next))
          } catch {}
          return next
        })
      }
    }, 180)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, items])

  useEffect(() => {
    try {
      localStorage.setItem('savedFilters', JSON.stringify(savedFilters))
    } catch {}
  }, [savedFilters])

  const saveCurrent = (name: string) => {
    const id = String(Date.now())
    const entry = { id, name, filter }
    setSavedFilters((s) => [entry, ...s])
  }

  const applySaved = (f: FilterState) => setFilter(f)

  const deleteSaved = (id: string) => setSavedFilters((s) => s.filter((x) => x.id !== id))

  return (
    <div style={{ border: '1px solid #ddd', padding: 12, borderRadius: 6 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          aria-label="Search"
          placeholder="Search..."
          value={filter.query}
          onChange={(e) => setFilter({ ...filter, query: e.target.value })}
          style={{ flex: 1, minWidth: 200, padding: 8 }}
        />
        <select
          aria-label="Operator"
          value={filter.operator}
          onChange={(e) => setFilter({ ...filter, operator: e.target.value as any })}
        >
          <option>AND</option>
          <option>OR</option>
          <option>NOT</option>
        </select>
        <input
          type="date"
          aria-label="From date"
          value={filter.dateFrom || ''}
          onChange={(e) => setFilter({ ...filter, dateFrom: e.target.value || undefined })}
        />
        <input
          type="date"
          aria-label="To date"
          value={filter.dateTo || ''}
          onChange={(e) => setFilter({ ...filter, dateTo: e.target.value || undefined })}
        />
        <input
          type="number"
          placeholder="Min"
          aria-label="Min amount"
          value={filter.amountMin as any}
          onChange={(e) => setFilter({ ...filter, amountMin: e.target.value === '' ? '' : Number(e.target.value) })}
          style={{ width: 100 }}
        />
        <input
          type="number"
          placeholder="Max"
          aria-label="Max amount"
          value={filter.amountMax as any}
          onChange={(e) => setFilter({ ...filter, amountMax: e.target.value === '' ? '' : Number(e.target.value) })}
          style={{ width: 100 }}
        />
        <button onClick={() => saveCurrent(prompt('Save filter name') || `Filter ${new Date().toISOString()}`)}>Save</button>
        <div>
          <label>Presets</label>
          <select onChange={(e) => {
            const id = e.target.value
            const p = presets.find((x) => x.id === id)
            if (p) applySaved({ ...filter, ...p.filter } as FilterState)
          }}>
            <option value="">--</option>
            {presets.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ marginTop: 8, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <h4 style={{ margin: '8px 0' }}>Results ({results.length})</h4>
          <ResultList items={results} />
        </div>

        <aside style={{ width: 260 }}>
          <div>
            <strong>Saved Filters</strong>
            <ul>
              {savedFilters.map((s) => (
                <li key={s.id}>
                  <button onClick={() => applySaved(s.filter)}>{s.name}</button>
                  <button onClick={() => deleteSaved(s.id)} style={{ marginLeft: 8 }}>Delete</button>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <strong>History</strong>
            <ul>
              {history.map((h, i) => (
                <li key={i}><button onClick={() => setFilter({ ...filter, query: h })}>{h}</button></li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  )
}

function applyFilter(items: Item[], f: FilterState) {
  const q = f.query || ''
  const terms = q.split(/\s+/).filter(Boolean)

  return items.filter((it) => {
    // date filter
    if (f.dateFrom) {
      if (!it.date || new Date(it.date) < new Date(f.dateFrom)) return false
    }
    if (f.dateTo) {
      if (!it.date || new Date(it.date) > new Date(f.dateTo)) return false
    }
    // amount filter
    if (f.amountMin !== '' && f.amountMin !== undefined) {
      if (typeof it.amount !== 'number' || it.amount < (f.amountMin as number)) return false
    }
    if (f.amountMax !== '' && f.amountMax !== undefined) {
      if (typeof it.amount !== 'number' || it.amount > (f.amountMax as number)) return false
    }

    if (!terms.length) return true

    // build searchable string
    const hay = Object.values(it).join(' ').toLowerCase()

    if (f.operator === 'AND') {
      return terms.every((t) => hay.includes(t.toLowerCase()))
    }
    if (f.operator === 'OR') {
      return terms.some((t) => hay.includes(t.toLowerCase()))
    }
    // NOT
    return terms.every((t) => !hay.includes(t.toLowerCase()))
  })
}

function ResultList({ items }: { items: Item[] }) {
  const [cursor, setCursor] = useState(0)
  const listRef = useRef<HTMLUListElement | null>(null)

  useEffect(() => setCursor(0), [items])

  useEffect(() => {
    const el = listRef.current
    if (!el) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setCursor((c) => Math.min(c + 1, items.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setCursor((c) => Math.max(c - 1, 0))
      } else if (e.key === 'Enter') {
        const sel = items[cursor]
        if (sel) window.alert(`Selected: ${sel.id || JSON.stringify(sel)}`)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [cursor, items])

  return (
    <ul ref={listRef} style={{ listStyle: 'none', padding: 0, maxHeight: 400, overflow: 'auto' }}>
      {items.map((it, i) => (
        <li
          key={it.id ?? i}
          tabIndex={0}
          style={{
            padding: 8,
            background: i === cursor ? '#eef' : 'transparent',
            borderBottom: '1px solid #eee',
          }}
          onClick={() => window.alert(`Selected: ${it.id}`)}
          onMouseEnter={() => setCursor(i)}
        >
          <div style={{ fontWeight: 600 }}>{it.description ?? `Item ${it.id}`}</div>
          <div style={{ fontSize: 12, color: '#555' }}>{it.date} • {typeof it.amount === 'number' ? `$${it.amount}` : ''}</div>
        </li>
      ))}
    </ul>
  )
}
