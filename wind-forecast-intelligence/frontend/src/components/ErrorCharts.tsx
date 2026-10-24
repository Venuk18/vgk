import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { DailyBreakdown, ErrorBin, HourOfDayBreakdown } from '../api/types'
import {
  formatLondonDate,
  formatMw,
  formatPct,
  hourLabel,
  signedMw,
} from '../lib/format'
import { Card, EmptyBlock } from './ui'

interface ErrorChartsProps {
  daily: DailyBreakdown[]
  hourOfDay: HourOfDayBreakdown[]
  bins: ErrorBin[]
  binWidth: number
  selectedDate?: string
  onSelectDate?: (date: string) => void
}

export function ErrorCharts({
  daily,
  hourOfDay,
  bins,
  binWidth,
  selectedDate,
  onSelectDate,
}: ErrorChartsProps) {
  const compactDate = (dateStr: string) => {
    const parts = dateStr.split('-')
    if (parts.length === 3) {
      const day = parts[2]
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      const mIdx = parseInt(parts[1], 10) - 1
      return `${day} ${months[mIdx] || 'Jan'}`
    }
    return dateStr
  }

  const totalBinnedHours = bins.reduce((acc, b) => acc + b.count, 0)

  return (
    <div className="error-analytics-grid">
      {/* 1. Daily Forecast Error */}
      <Card
        className="daily-error-card"
        title="Daily Forecast Error Trend"
        subtitle="Daily MAE and Mean Bias across January 2026 delivery dates. Click any point to select that day."
        badge={
          <div className="card-badge-group">
            <span className="legend-chip">
              <span className="legend-swatch mae-swatch" />
              <span>Daily MAE</span>
            </span>
            <span className="legend-chip">
              <span className="legend-swatch bias-swatch" />
              <span>Daily Bias</span>
            </span>
          </div>
        }
      >
        {!daily || !daily.length ? (
          <EmptyBlock title="No Daily Breakdown" body="The metrics endpoint returned no daily records." />
        ) : (
          <div className="chart-canvas-wrap">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart
                data={daily}
                margin={{ top: 12, right: 16, left: 4, bottom: 8 }}
                onClick={(state) => {
                  const idx = typeof state.activeTooltipIndex === 'number' ? state.activeTooltipIndex : undefined
                  const point = idx !== undefined ? daily[idx] : undefined
                  if (point?.date && onSelectDate) {
                    onSelectDate(point.date)
                  }
                }}
              >
                <CartesianGrid stroke="var(--grid-line)" strokeDasharray="3 3" vertical={false} />
                <ReferenceLine
                  y={0}
                  stroke="var(--text-muted)"
                  strokeDasharray="4 4"
                  strokeWidth={1}
                  label={{
                    value: 'Zero Bias (Unbiased)',
                    position: 'insideTopRight',
                    fill: 'var(--text-muted)',
                    fontSize: 10,
                  }}
                />
                <XAxis
                  dataKey="date"
                  tickFormatter={compactDate}
                  tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                  interval={4}
                  minTickGap={24}
                  tickLine={{ stroke: 'var(--border-subtle)' }}
                  axisLine={{ stroke: 'var(--border-subtle)' }}
                  label={{
                    value: 'Delivery Date (January 2026)',
                    position: 'insideBottom',
                    offset: -4,
                    fill: 'var(--text-muted)',
                    fontSize: 10,
                  }}
                  height={34}
                />
                <YAxis
                  tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                  tickFormatter={(v: number) => formatMw(v, false)}
                  width={60}
                  tickLine={{ stroke: 'var(--border-subtle)' }}
                  axisLine={{ stroke: 'var(--border-subtle)' }}
                  label={{
                    value: 'MW',
                    angle: -90,
                    position: 'insideLeft',
                    fill: 'var(--text-muted)',
                    fontSize: 10,
                    offset: 8,
                  }}
                />
                <Tooltip content={<CustomDailyTooltip />} />

                {selectedDate && (
                  <ReferenceLine
                    x={selectedDate}
                    stroke="var(--accent-cyan)"
                    strokeDasharray="3 3"
                    strokeWidth={1.5}
                    label={{
                      value: `Selected: ${compactDate(selectedDate)}`,
                      position: 'insideTopLeft',
                      fill: 'var(--accent-cyan)',
                      fontSize: 10,
                    }}
                  />
                )}

                <Line
                  type="monotone"
                  dataKey="mae_mw"
                  name="MAE"
                  stroke="var(--color-mae)"
                  strokeWidth={2.2}
                  dot={{ r: 2, fill: 'var(--color-mae)' }}
                  activeDot={{ r: 5, fill: 'var(--color-mae)', stroke: '#ffffff', strokeWidth: 1.5 }}
                />
                <Line
                  type="monotone"
                  dataKey="bias_mw"
                  name="Bias"
                  stroke="var(--color-forecast)"
                  strokeWidth={2}
                  strokeDasharray="4 3"
                  dot={{ r: 2, fill: 'var(--color-forecast)' }}
                  activeDot={{ r: 5, fill: 'var(--color-forecast)', stroke: '#ffffff', strokeWidth: 1.5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* 2. Hour-of-Day Error */}
      <Card
        className="hourly-error-card"
        title="Hour-of-Day Error Profile"
        subtitle="Mean Absolute Error by local hour (Europe/London). Identifies diurnal forecasting patterns."
      >
        {!hourOfDay || !hourOfDay.length ? (
          <EmptyBlock title="No Hour Breakdown" body="The metrics endpoint returned no hour-of-day series." />
        ) : (
          <div className="chart-canvas-wrap">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={hourOfDay}
                margin={{ top: 12, right: 12, left: 4, bottom: 8 }}
              >
                <CartesianGrid stroke="var(--grid-line)" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="hour"
                  tickFormatter={hourLabel}
                  tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                  interval={3}
                  minTickGap={16}
                  tickLine={{ stroke: 'var(--border-subtle)' }}
                  axisLine={{ stroke: 'var(--border-subtle)' }}
                  label={{
                    value: 'Local Hour (00:00–23:00)',
                    position: 'insideBottom',
                    offset: -4,
                    fill: 'var(--text-muted)',
                    fontSize: 10,
                  }}
                  height={34}
                />
                <YAxis
                  tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                  tickFormatter={(v: number) => formatMw(v, false)}
                  width={56}
                  tickLine={{ stroke: 'var(--border-subtle)' }}
                  axisLine={{ stroke: 'var(--border-subtle)' }}
                  label={{
                    value: 'MAE (MW)',
                    angle: -90,
                    position: 'insideLeft',
                    fill: 'var(--text-muted)',
                    fontSize: 10,
                    offset: 8,
                  }}
                />
                <Tooltip content={<CustomHourOfDayTooltip />} />
                <Bar dataKey="mae_mw" name="MAE">
                  {hourOfDay.map((row) => (
                    <Cell
                      key={`hour-${row.hour}`}
                      fill={row.sufficient_sample ? 'var(--color-hour-bar)' : 'var(--slate-600)'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="chart-caption-bar tiny">
          <span>Sample adequacy: All 24 hours have 31 delivery samples in January 2026 (threshold: min 10 samples).</span>
        </div>
      </Card>

      {/* 3. Error Distribution — Full Screen Width */}
      <Card
        className="distribution-card full-width-card"
        title="Error Distribution Histogram (January 2026)"
        subtitle={`Forecast − Actual (MW) binned in ${binWidth} MW increments across all 744 matched delivery periods. Green bins (< 0 MW) represent underforecasting; Coral bins (≥ 0 MW) represent overforecasting.`}
        badge={
          <div className="card-badge-group">
            <span className="legend-chip">
              <span className="legend-swatch good-swatch" />
              <span>Underforecast (&lt; 0 MW)</span>
            </span>
            <span className="legend-chip">
              <span className="legend-swatch mae-swatch" />
              <span>Overforecast (≥ 0 MW)</span>
            </span>
            <span className="pill-badge pill-neutral">744 Hours Binned</span>
          </div>
        }
      >
        {!bins || !bins.length ? (
          <EmptyBlock title="No Error Distribution" body="No matched delivery periods to bin." />
        ) : (
          <div className="chart-canvas-wrap">
            <ResponsiveContainer width="100%" height={290}>
              <BarChart
                data={bins.map((b) => {
                  const fmt = (v: number) => {
                    if (v === 0) return '0'
                    const k = v / 1000
                    return Number.isInteger(k) ? `${v > 0 ? '+' : ''}${k}k` : `${v > 0 ? '+' : ''}${k.toFixed(1)}k`
                  }
                  return {
                    ...b,
                    mid_mw: (b.from_mw + b.to_mw) / 2,
                    label: `${signedMw(b.from_mw)} to ${signedMw(b.to_mw)}`,
                    shortLabel: `${fmt(b.from_mw)}..${fmt(b.to_mw)}`,
                    pct: totalBinnedHours > 0 ? (b.count / totalBinnedHours) * 100 : 0,
                    isOver: b.from_mw >= 0,
                  }
                })}
                margin={{ top: 12, right: 16, left: 4, bottom: 8 }}
              >
                <CartesianGrid stroke="var(--grid-line)" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="shortLabel"
                  tick={{ fill: 'var(--text-muted)', fontSize: 9.5 }}
                  interval={0}
                  minTickGap={10}
                  tickLine={{ stroke: 'var(--border-subtle)' }}
                  axisLine={{ stroke: 'var(--border-subtle)' }}
                  label={{
                    value: 'Error Bin Range [From..To] (MW)',
                    position: 'insideBottom',
                    offset: -4,
                    fill: 'var(--text-muted)',
                    fontSize: 10,
                  }}
                  height={36}
                />
                <YAxis
                  tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                  allowDecimals={false}
                  width={52}
                  tickLine={{ stroke: 'var(--border-subtle)' }}
                  axisLine={{ stroke: 'var(--border-subtle)' }}
                  label={{
                    value: 'Matched Hours',
                    angle: -90,
                    position: 'insideLeft',
                    fill: 'var(--text-muted)',
                    fontSize: 10,
                    offset: 8,
                  }}
                />
                <Tooltip content={<CustomDistributionTooltip />} />
                <Bar dataKey="count" name="Hours">
                  {bins.map((b, idx) => (
                    <Cell
                      key={`bin-${idx}`}
                      fill={b.from_mw >= 0 ? 'var(--color-mae)' : 'var(--color-good)'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="chart-caption-bar tiny">
          <span>744 matched hours binned. Skew toward positive errors reflects systemic overforecasting bias.</span>
        </div>
      </Card>
    </div>
  )
}

function CustomDailyTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload: DailyBreakdown }>
}) {
  if (!active || !payload || !payload.length) return null
  const d = payload[0].payload
  const biasTone = d.bias_mw === null ? 'neutral' : d.bias_mw > 0 ? 'over' : d.bias_mw < 0 ? 'under' : 'exact'
  const biasLabel = d.bias_mw === null ? '—' : d.bias_mw > 0 ? 'Overforecast' : d.bias_mw < 0 ? 'Underforecast' : 'Unbiased'

  return (
    <div className="custom-chart-tooltip">
      <div className="tooltip-header">
        <strong>Delivery Date: {formatLondonDate(d.date)}</strong>
        <span className="tooltip-utc">{d.date}</span>
      </div>
      <div className="tooltip-grid">
        <div className="tooltip-row">
          <span className="tooltip-label">Mean Absolute Error (MAE):</span>
          <strong className="tooltip-val mae-val">{formatMw(d.mae_mw)}</strong>
        </div>
        <div className="tooltip-row">
          <span className="tooltip-label">Forecast Bias:</span>
          <strong className={`tooltip-val error-val ${biasTone}`}>
            {signedMw(d.bias_mw)}
            <small className="tooltip-error-sub">({biasLabel})</small>
          </strong>
        </div>
        <div className="tooltip-row">
          <span className="tooltip-label">Root Mean Squared (RMSE):</span>
          <strong className="tooltip-val">{formatMw(d.rmse_mw)}</strong>
        </div>
        <div className="tooltip-row status-row">
          <span className="tooltip-label">Coverage:</span>
          <span className="status-mini-pill status-matched">
            {d.matched_count} / {d.expected_periods} matched hours ({formatPct(d.forecast_coverage_pct)})
          </span>
        </div>
      </div>
      <div className="tooltip-footer">Click to view hourly records for this date</div>
    </div>
  )
}

function CustomHourOfDayTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload: HourOfDayBreakdown }>
}) {
  if (!active || !payload || !payload.length) return null
  const h = payload[0].payload
  const biasTone = h.bias_mw === null ? 'neutral' : h.bias_mw > 0 ? 'over' : h.bias_mw < 0 ? 'under' : 'exact'
  const biasLabel = h.bias_mw === null ? '—' : h.bias_mw > 0 ? 'Overforecast' : h.bias_mw < 0 ? 'Underforecast' : 'Unbiased'

  return (
    <div className="custom-chart-tooltip">
      <div className="tooltip-header">
        <strong>Local Hour: {hourLabel(h.hour)} Europe/London</strong>
      </div>
      <div className="tooltip-grid">
        <div className="tooltip-row">
          <span className="tooltip-label">Mean Absolute Error:</span>
          <strong className="tooltip-val mae-val">{formatMw(h.mae_mw)}</strong>
        </div>
        <div className="tooltip-row">
          <span className="tooltip-label">Mean Bias:</span>
          <strong className={`tooltip-val error-val ${biasTone}`}>
            {signedMw(h.bias_mw)}
            <small className="tooltip-error-sub">({biasLabel})</small>
          </strong>
        </div>
        <div className="tooltip-row">
          <span className="tooltip-label">Root Mean Squared (RMSE):</span>
          <strong className="tooltip-val">{formatMw(h.rmse_mw)}</strong>
        </div>
        <div className="tooltip-row status-row">
          <span className="tooltip-label">Sample Count:</span>
          <span className="status-mini-pill status-matched">
            {h.matched_count} delivery periods in Jan 2026
          </span>
        </div>
      </div>
    </div>
  )
}

function CustomDistributionTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload: ErrorBin & { label: string; pct: number; isOver: boolean } }>
}) {
  if (!active || !payload || !payload.length) return null
  const b = payload[0].payload

  return (
    <div className="custom-chart-tooltip">
      <div className="tooltip-header">
        <strong>Error Bin: {b.label}</strong>
      </div>
      <div className="tooltip-grid">
        <div className="tooltip-row">
          <span className="tooltip-label">Matched Delivery Hours:</span>
          <strong className="tooltip-val">{b.count} hours</strong>
        </div>
        <div className="tooltip-row">
          <span className="tooltip-label">Proportion of Month:</span>
          <strong className="tooltip-val">{b.pct.toFixed(1)}% of 744 hrs</strong>
        </div>
        <div className="tooltip-row">
          <span className="tooltip-label">Classification:</span>
          <span className={`pill-badge ${b.isOver ? 'pill-post-cutoff' : 'pill-eligible'}`}>
            {b.isOver ? 'Overforecast (Forecast > Actual)' : 'Underforecast (Actual > Forecast)'}
          </span>
        </div>
      </div>
    </div>
  )
}
