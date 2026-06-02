import React from 'react'
import SearchFilter from '../../components/SearchFilter'

const SAMPLE = new Array(60).fill(0).map((_, i) => ({
  id: i + 1,
  description: `Transaction ${i + 1} payment to vendor ${i % 7}`,
  date: new Date(Date.now() - i * 86400000).toISOString().slice(0, 10),
  amount: Math.round(Math.random() * 2000) / 100,
  type: ['deposit', 'withdrawal', 'transfer'][i % 3],
}))

export default function Page() {
  return (
    <div style={{ padding: 24 }}>
      <h2>Search / Filter Demo</h2>
      <p>Reusable search component demo — supports operators, date/amount ranges, saved filters, history, keyboard nav.</p>
      <SearchFilter
        items={SAMPLE}
        presets={[
          { id: 'last7', name: 'Last 7 days', filter: { dateFrom: new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10) } },
          { id: 'big', name: 'Big amounts (>10)', filter: { amountMin: 10 } },
        ]}
      />
    </div>
  )
}
