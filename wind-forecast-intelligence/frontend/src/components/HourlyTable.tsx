import { useMemo, useState } from 'react'
import type { HourlyRecord } from '../api/types'
import {
  formatLondonTime,
  formatMw,
  formatUtc,
  signedMw,
} from '../lib/format'
import { EmptyBlock } from './ui'

type SortColumn = 'delivery' | 'forecast' | 'actual' | 'error' | 'abs_error'
type SortDir = 'asc' | 'desc'
type FilterMode = 'all' | 'over' | 'under'

interface HourlyTableProps {
  rows: HourlyRecord[]
  selectedStart: string | null
  onSelect: (startTime: string) => void
}

export function HourlyTable({ rows, selectedStart, onSelect }: HourlyTableProps) {
  const [sortCol, setSortCol] = useState<SortColumn>('delivery')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [filterMode, setFilterMode] = useState<FilterMode>('all')

  const toggleSort = (col: SortColumn) => {
    if (sortCol === col) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortCol(col)
      setSortDir(col === 'abs_error' || col === 'error' ? 'desc' : 'asc')
    }
  }

  const filteredRows = useMemo(() => {
    if (filterMode === 'over') return rows.filter((r) => r.error_mw !== null && r.error_mw > 0)
    if (filterMode === 'under') return rows.filter((r) => r.error_mw !== null && r.error_mw < 0)
    return rows
  }, [rows, filterMode])

  const sortedRows = useMemo(() => {
    return [...filteredRows].sort((a, b) => {
      let av = 0
      let bv = 0

      switch (sortCol) {
        case 'delivery':
          av = Date.parse(a.start_time)
          bv = Date.parse(b.start_time)
          break
        case 'forecast':
          av = a.forecast_mw ?? Number.NEGATIVE_INFINITY
          bv = b.forecast_mw ?? Number.NEGATIVE_INFINITY
          break
        case 'actual':
          av = a.actual_mw ?? Number.NEGATIVE_INFINITY
          bv = b.actual_mw ?? Number.NEGATIVE_INFINITY
          break
        case 'error':
          av = a.error_mw ?? Number.NEGATIVE_INFINITY
          bv = b.error_mw ?? Number.NEGATIVE_INFINITY
          break
        case 'abs_error':
          av = a.abs_error_mw ?? Number.NEGATIVE_INFINITY
          bv = b.abs_error_mw ?? Number.NEGATIVE_INFINITY
          break
      }

      return sortDir === 'asc' ? av - bv : bv - av
    })
  }, [filteredRows, sortCol, sortDir])

  if (!rows || rows.length === 0) {
    return <EmptyBlock title="No Hourly Records" body="No records available for the selected delivery date." />
  }

  const overCount = rows.filter((r) => r.error_mw !== null && r.error_mw > 0).length
  const underCount = rows.filter((r) => r.error_mw !== null && r.error_mw < 0).length

  return (
    <div className="hourly-table-container">
      <div className="table-toolbar">
        <div className="table-filter-group" role="group" aria-label="Filter rows by error sign">
          <span className="toolbar-label">Filter:</span>
          <button
            type="button"
            className={`filter-btn ${filterMode === 'all' ? 'active' : ''}`}
            onClick={() => setFilterMode('all')}
          >
            All Hours ({rows.length})
          </button>
          <button
            type="button"
            className={`filter-btn ${filterMode === 'over' ? 'active' : ''}`}
            onClick={() => setFilterMode('over')}
          >
            Overforecasts ({overCount})
          </button>
          <button
            type="button"
            className={`filter-btn ${filterMode === 'under' ? 'active' : ''}`}
            onClick={() => setFilterMode('under')}
          >
            Underforecasts ({underCount})
          </button>
        </div>

        <div className="table-help-hint">
          Click any row to load its forecast revision timeline
        </div>
      </div>

      <div className="table-wrap">
        <table className="hourly-data-table">
          <thead>
            <tr>
              <th
                className={`sortable-th ${sortCol === 'delivery' ? 'active-sort' : ''}`}
                onClick={() => toggleSort('delivery')}
              >
                Delivery (London) {sortCol === 'delivery' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th
                className={`sortable-th text-right ${sortCol === 'forecast' ? 'active-sort' : ''}`}
                onClick={() => toggleSort('forecast')}
              >
                Forecast (MW) {sortCol === 'forecast' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th
                className={`sortable-th text-right ${sortCol === 'actual' ? 'active-sort' : ''}`}
                onClick={() => toggleSort('actual')}
              >
                Actual (MW) {sortCol === 'actual' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th
                className={`sortable-th text-right ${sortCol === 'error' ? 'active-sort' : ''}`}
                onClick={() => toggleSort('error')}
              >
                Forecast Error {sortCol === 'error' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th
                className={`sortable-th text-right ${sortCol === 'abs_error' ? 'active-sort' : ''}`}
                onClick={() => toggleSort('abs_error')}
              >
                Abs Error {sortCol === 'abs_error' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th>Decision Vintage (UTC)</th>
              <th>Status</th>
              <th className="text-center">Eligible Vintages</th>
              <th className="text-center">Timeline</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => {
              const isSelected = row.start_time === selectedStart
              const isOver = row.error_mw !== null && row.error_mw > 0
              const isUnder = row.error_mw !== null && row.error_mw < 0

              return (
                <tr
                  key={row.start_time}
                  className={`data-row ${isSelected ? 'row-selected' : ''}`}
                  aria-selected={isSelected}
                  tabIndex={0}
                  onClick={() => onSelect(row.start_time)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onSelect(row.start_time)
                    }
                  }}
                >
                  <td className="mono delivery-cell">
                    <span className="row-selected-dot" aria-hidden />
                    <span title={`UTC: ${formatUtc(row.start_time)}`}>
                      <b>{formatLondonTime(row.start_time)}</b>
                    </span>
                  </td>
                  <td className="tabular-num text-right forecast-text">{formatMw(row.forecast_mw, false)}</td>
                  <td className="tabular-num text-right actual-text">{formatMw(row.actual_mw, false)}</td>
                  <td className={`tabular-num text-right ${isOver ? 'over' : isUnder ? 'under' : ''}`}>
                    {signedMw(row.error_mw)}
                  </td>
                  <td className="tabular-num text-right">{formatMw(row.abs_error_mw, false)}</td>
                  <td className="mono muted-mono">{formatUtc(row.forecast_publish_time)}</td>
                  <td>
                    <span className={`pill-badge status-pill status-${row.status}`}>
                      {row.status.replaceAll('_', ' ')}
                      {row.actual_slots ? ` (${row.actual_slots}/2 slots)` : ''}
                    </span>
                  </td>
                  <td className="text-center tabular-num">{row.eligible_vintages}</td>
                  <td className="text-center">
                    {isSelected ? (
                      <span className="inspect-active-badge">Active</span>
                    ) : (
                      <button type="button" className="inspect-btn" tabIndex={-1}>
                        Inspect
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
