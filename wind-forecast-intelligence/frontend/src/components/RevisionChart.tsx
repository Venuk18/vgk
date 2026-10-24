import { useState } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { RevisionsResponse, Vintage } from '../api/types'
import {
  formatLondon,
  formatMw,
  formatUtc,
  signedMw,
} from '../lib/format'
import { EmptyBlock } from './ui'

interface RevisionChartProps {
  data: RevisionsResponse
}

interface RevisionPoint {
  t: number
  forecast_mw: number
  publish_time: string
  label: string
  selected: boolean
  before_cutoff: boolean
  revision_mw: number | null
}

export function RevisionChart({ data }: RevisionChartProps) {
  const [showTable, setShowTable] = useState(false)

  if (!data || !data.vintages || data.vintages.length === 0) {
    return (
      <EmptyBlock
        title="No Forecast Vintages Available"
        body={
          data?.availability_note ||
          'No WINDFOR publications were found for this delivery hour. Delivery start lies outside the ingested window or Elexon returned no vintages.'
        }
      />
    )
  }

  const points: RevisionPoint[] = data.vintages.map((v) => ({
    t: new Date(v.publish_time).getTime(),
    forecast_mw: v.forecast_mw,
    publish_time: v.publish_time,
    label: formatLondon(v.publish_time),
    selected: v.selected,
    before_cutoff: v.before_cutoff,
    revision_mw: v.revision_mw,
  }))

  const cutoffTimestamp = new Date(data.decision_cutoff).getTime()
  const selectedPoint = points.find((p) => p.selected)

  // Timeline domain with margin so cutoff and endpoints are clearly visible
  const timestamps = points.map((p) => p.t).concat([cutoffTimestamp])
  const minTime = Math.min(...timestamps)
  const maxTime = Math.max(...timestamps)
  const timePadding = (maxTime - minTime) * 0.04 || 3600000

  const preCount = data.summary.vintages_before_cutoff
  const postCount = data.summary.vintages_after_cutoff
  const netPreChange = data.summary.net_revision_before_cutoff_mw

  return (
    <div className="revision-chart-container">
      {data.availability_note && (
        <div className="banner warn-banner" role="status">
          <strong>Notice:</strong> {data.availability_note}
        </div>
      )}

      {/* Delivery hour and cutoff summary bar */}
      <div className="revision-summary-strip">
        <div className="rev-stat-item">
          <span className="stat-label">Delivery Target</span>
          <strong className="stat-value">{formatLondon(data.delivery_start)}</strong>
          <span className="stat-sub">{formatUtc(data.delivery_start)}</span>
        </div>

        <div className="rev-stat-item cutoff-item">
          <span className="stat-label">Decision Cutoff (D-1)</span>
          <strong className="stat-value">{formatLondon(data.decision_cutoff)}</strong>
          <span className="stat-sub">09:20 London gate closure</span>
        </div>

        <div className="rev-stat-item selected-item">
          <span className="stat-label">Selected Decision Vintage</span>
          <strong className="stat-value">
            {selectedPoint ? formatMw(selectedPoint.forecast_mw) : '—'}
          </strong>
          <span className="stat-sub">
            {selectedPoint ? `Published ${formatLondon(selectedPoint.publish_time)}` : 'None eligible'}
          </span>
        </div>

        <div className="rev-stat-item actual-item">
          <span className="stat-label">Metered Actual Generation</span>
          <strong className="stat-value">{formatMw(data.actual_mw)}</strong>
          <span className="stat-sub">FUELHH 2-slot average</span>
        </div>

        <div className="rev-stat-item">
          <span className="stat-label">Net Pre-Cutoff Revision</span>
          <strong className={`stat-value ${netPreChange && netPreChange > 0 ? 'over' : netPreChange && netPreChange < 0 ? 'under' : ''}`}>
            {signedMw(netPreChange)}
          </strong>
          <span className="stat-sub">{preCount} eligible publications</span>
        </div>
      </div>

      {/* Revision trajectory chart */}
      <div className="chart-canvas-wrap">
        <ResponsiveContainer width="100%" height={290}>
          <LineChart
            data={points}
            margin={{ top: 20, right: 24, left: 4, bottom: 12 }}
          >
            <CartesianGrid stroke="var(--grid-line)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              domain={[minTime - timePadding, maxTime + timePadding]}
              scale="time"
              tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
              tickFormatter={(t: number) => formatLondon(new Date(t).toISOString())}
              minTickGap={36}
              tickLine={{ stroke: 'var(--border-subtle)' }}
              axisLine={{ stroke: 'var(--border-subtle)' }}
              label={{
                value: 'Forecast Publication Time (Europe/London)',
                position: 'insideBottom',
                offset: -6,
                fill: 'var(--text-muted)',
                fontSize: 11,
              }}
              height={40}
            />
            <YAxis
              tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
              tickFormatter={(v: number) => formatMw(v, false)}
              width={68}
              tickLine={{ stroke: 'var(--border-subtle)' }}
              axisLine={{ stroke: 'var(--border-subtle)' }}
              label={{
                value: data.units || 'MW',
                angle: -90,
                position: 'insideLeft',
                fill: 'var(--text-muted)',
                fontSize: 11,
                offset: 8,
              }}
            />
            <Tooltip content={<CustomRevisionTooltip cutoff={cutoffTimestamp} />} />
            <Legend verticalAlign="top" height={32} content={() => null} />

            {/* Vertical decision cutoff line */}
            <ReferenceLine
              x={cutoffTimestamp}
              stroke="var(--color-cutoff)"
              strokeDasharray="4 4"
              strokeWidth={2}
              label={{
                value: 'Decision Cutoff (09:20 D-1)',
                fill: 'var(--color-cutoff)',
                fontSize: 11,
                position: 'insideTopLeft',
                fontWeight: 600,
              }}
            />

            {/* Horizontal actual generation reference line */}
            {data.actual_mw !== null && (
              <ReferenceLine
                y={data.actual_mw}
                stroke="var(--color-actual)"
                strokeDasharray="3 3"
                strokeWidth={1.5}
                label={{
                  value: `Actual: ${formatMw(data.actual_mw)}`,
                  fill: 'var(--color-actual)',
                  fontSize: 10,
                  position: 'insideBottomRight',
                }}
              />
            )}

            {/* Trajectory line connecting publication vintages */}
            <Line
              type="linear"
              dataKey="forecast_mw"
              name="Forecast revision path"
              stroke="var(--color-forecast)"
              strokeWidth={2}
              dot={(dotProps) => {
                const { cx, cy, payload } = dotProps
                if (!cx || !cy) return null
                const isSelected = payload.selected
                const isPreCutoff = payload.before_cutoff
                return (
                  <circle
                    key={`${payload.publish_time}`}
                    cx={cx}
                    cy={cy}
                    r={isSelected ? 6 : 3.5}
                    fill={isSelected ? 'var(--accent-cyan)' : isPreCutoff ? 'var(--color-forecast)' : 'var(--slate-500)'}
                    stroke={isSelected ? '#ffffff' : 'var(--surface-card)'}
                    strokeWidth={isSelected ? 2 : 1}
                  />
                )
              }}
              activeDot={{ r: 7, fill: 'var(--accent-cyan)', stroke: '#ffffff', strokeWidth: 2 }}
            />

            {/* Highlighted marker for selected vintage */}
            {selectedPoint && (
              <ReferenceDot
                x={selectedPoint.t}
                y={selectedPoint.forecast_mw}
                r={8}
                fill="var(--accent-cyan)"
                stroke="#ffffff"
                strokeWidth={2.5}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Explanatory notes */}
      <div className="revision-calc-explanation">
        <p>
          <b>Revision Calculation:</b> Net pre-cutoff revision ({signedMw(netPreChange)}) is the difference between the latest eligible vintage ({selectedPoint ? formatMw(selectedPoint.forecast_mw) : '—'}) and the earliest eligible vintage before the 09:20 D-1 cutoff. Vintages published after cutoff ({postCount} rows) are stored for post-event audit but were ineligible for the day-ahead trading decision.
        </p>
      </div>

      {/* Audit table toggle */}
      <div className="audit-toggle-row">
        <button
          type="button"
          className="btn btn-outline-sm"
          onClick={() => setShowTable((prev) => !prev)}
        >
          {showTable ? 'Hide Publication Audit Table' : `View Vintage Audit Table (${points.length} publications)`}
        </button>
      </div>

      {showTable && (
        <div className="vintage-table-wrap">
          <table className="vintage-table">
            <thead>
              <tr>
                <th>Publish Time (London)</th>
                <th>Publish Time (UTC)</th>
                <th>Forecast (MW)</th>
                <th>Revision (Δ MW)</th>
                <th>Cutoff Status</th>
                <th>Decision Role</th>
              </tr>
            </thead>
            <tbody>
              {data.vintages.map((v: Vintage) => (
                <tr
                  key={v.publish_time}
                  className={`${v.selected ? 'selected-row' : ''} ${!v.before_cutoff ? 'post-cutoff-row' : ''}`}
                >
                  <td className="mono">{formatLondon(v.publish_time)}</td>
                  <td className="mono">{formatUtc(v.publish_time)}</td>
                  <td className="tabular-num">{formatMw(v.forecast_mw)}</td>
                  <td className={`tabular-num ${v.revision_mw && v.revision_mw > 0 ? 'over' : v.revision_mw && v.revision_mw < 0 ? 'under' : ''}`}>
                    {v.revision_mw === null ? 'Initial' : signedMw(v.revision_mw)}
                  </td>
                  <td>
                    <span className={`pill-badge ${v.before_cutoff ? 'pill-eligible' : 'pill-post-cutoff'}`}>
                      {v.before_cutoff ? 'Eligible (Pre-Cutoff)' : 'Post-Cutoff'}
                    </span>
                  </td>
                  <td>
                    {v.selected ? (
                      <span className="selected-decision-tag">★ Selected Decision Forecast</span>
                    ) : (
                      <span className="muted-tag">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function CustomRevisionTooltip({
  active,
  payload,
  cutoff,
}: {
  active?: boolean
  payload?: Array<{ payload: RevisionPoint }>
  cutoff: number
}) {
  if (!active || !payload || !payload.length) return null
  const p = payload[0].payload
  const isSelected = p.selected
  const isPreCutoff = p.before_cutoff

  return (
    <div className="custom-chart-tooltip revision-tooltip">
      <div className="tooltip-header">
        <strong>Published: {p.label} London</strong>
        <span className="tooltip-utc">{formatUtc(p.publish_time)}</span>
      </div>

      <div className="tooltip-grid">
        <div className="tooltip-row">
          <span className="tooltip-label">Forecast Value:</span>
          <strong className="tooltip-val forecast-val">{formatMw(p.forecast_mw)}</strong>
        </div>

        <div className="tooltip-row">
          <span className="tooltip-label">Revision vs Prior:</span>
          <strong className={`tooltip-val ${p.revision_mw && p.revision_mw > 0 ? 'over' : p.revision_mw && p.revision_mw < 0 ? 'under' : ''}`}>
            {p.revision_mw === null ? 'Initial publication' : signedMw(p.revision_mw)}
          </strong>
        </div>

        <div className="tooltip-row">
          <span className="tooltip-label">Cutoff Timing:</span>
          <span className={`pill-badge ${isPreCutoff ? 'pill-eligible' : 'pill-post-cutoff'}`}>
            {isPreCutoff ? `Eligible (${Math.abs((cutoff - p.t) / 3600000).toFixed(1)}h before cutoff)` : `Ineligible (${Math.abs((p.t - cutoff) / 3600000).toFixed(1)}h post-cutoff)`}
          </span>
        </div>

        {isSelected && (
          <div className="tooltip-selection-callout">
            ★ Selected as Decision-Time Forecast
          </div>
        )}
      </div>
    </div>
  )
}
