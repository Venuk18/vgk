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
import type { HourlyRecord } from '../api/types'
import {
  formatLondon,
  formatLondonTime,
  formatMw,
  formatUtc,
  signedMw,
} from '../lib/format'
import { EmptyBlock } from './ui'

interface ForecastChartProps {
  rows: HourlyRecord[]
  selectedStart: string | null
  onSelect: (startTime: string) => void
  units: string
}

interface ChartPoint {
  start_time: string
  timeLabel: string
  fullLabel: string
  forecast_mw: number | null
  actual_mw: number | null
  error_mw: number | null
  abs_error_mw: number | null
  status: string
  eligible_vintages: number
}

export function ForecastChart({ rows, selectedStart, onSelect, units }: ForecastChartProps) {
  if (!rows || rows.length === 0) {
    return <EmptyBlock title="No Hourly Records" body="The API returned no delivery periods for this date." />
  }

  const data: ChartPoint[] = rows.map((row) => ({
    start_time: row.start_time,
    timeLabel: formatLondonTime(row.start_time),
    fullLabel: formatLondon(row.start_time),
    forecast_mw: row.forecast_mw,
    actual_mw: row.actual_mw,
    error_mw: row.error_mw,
    abs_error_mw: row.abs_error_mw,
    status: row.status,
    eligible_vintages: row.eligible_vintages,
  }))

  const selectedPoint = data.find((p) => p.start_time === selectedStart)

  return (
    <div className="forecast-chart-container">
      <div className="chart-legend-banner">
        <div className="legend-items">
          <span className="legend-chip forecast-chip">
            <span className="legend-swatch forecast-swatch" />
            <strong>Decision-Time Forecast (WINDFOR)</strong>
          </span>
          <span className="legend-chip actual-chip">
            <span className="legend-swatch actual-swatch" />
            <strong>Metered Actual (FUELHH)</strong>
          </span>
          {selectedPoint && (
            <span className="legend-chip selected-chip">
              <span className="legend-swatch selected-swatch" />
              <span>Selected Hour: <b>{selectedPoint.timeLabel}</b></span>
            </span>
          )}
        </div>
        <span className="chart-interaction-tip">
          Click any hour to inspect its revision history
        </span>
      </div>

      <div className="chart-canvas-wrap">
        <ResponsiveContainer width="100%" height={320}>
          <LineChart
            data={data}
            margin={{ top: 16, right: 16, left: 4, bottom: 8 }}
            onClick={(state) => {
              const index = typeof state.activeTooltipIndex === 'number' ? state.activeTooltipIndex : undefined
              const point = index !== undefined ? data[index] : undefined
              if (point?.start_time) {
                onSelect(point.start_time)
              }
            }}
          >
            <CartesianGrid stroke="var(--grid-line)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="timeLabel"
              tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
              interval={2}
              minTickGap={20}
              tickLine={{ stroke: 'var(--border-subtle)' }}
              axisLine={{ stroke: 'var(--border-subtle)' }}
              label={{
                value: 'Delivery Hour (Europe/London)',
                position: 'insideBottom',
                offset: -4,
                fill: 'var(--text-muted)',
                fontSize: 11,
              }}
              height={36}
            />
            <YAxis
              tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
              tickFormatter={(v: number) => formatMw(v, false)}
              width={68}
              tickLine={{ stroke: 'var(--border-subtle)' }}
              axisLine={{ stroke: 'var(--border-subtle)' }}
              label={{
                value: units || 'MW',
                angle: -90,
                position: 'insideLeft',
                fill: 'var(--text-muted)',
                fontSize: 11,
                offset: 8,
              }}
            />
            <Tooltip
              content={<CustomForecastTooltip />}
              cursor={{ stroke: 'var(--accent-cyan)', strokeWidth: 1, strokeDasharray: '3 3' }}
            />
            <Legend verticalAlign="top" height={36} content={() => null} />

            {selectedPoint && (
              <ReferenceLine
                x={selectedPoint.timeLabel}
                stroke="var(--accent-cyan)"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{
                  value: `Selected: ${selectedPoint.timeLabel}`,
                  position: 'insideTop',
                  fill: 'var(--accent-cyan)',
                  fontSize: 11,
                  fontWeight: 600,
                  offset: 4,
                }}
              />
            )}

            <Line
              type="monotone"
              dataKey="forecast_mw"
              name="Decision-time forecast"
              stroke="var(--color-forecast)"
              strokeWidth={2.5}
              dot={{ r: 3, fill: 'var(--color-forecast)', strokeWidth: 1, stroke: 'var(--surface-card)' }}
              activeDot={{ r: 6, fill: 'var(--color-forecast)', stroke: '#ffffff', strokeWidth: 2 }}
              connectNulls={false}
            />

            <Line
              type="monotone"
              dataKey="actual_mw"
              name="Metered actual"
              stroke="var(--color-actual)"
              strokeWidth={2.5}
              dot={{ r: 2.5, fill: 'var(--color-actual)', strokeWidth: 1, stroke: 'var(--surface-card)' }}
              activeDot={{ r: 6, fill: 'var(--color-actual)', stroke: '#ffffff', strokeWidth: 2 }}
              connectNulls={false}
            />

            {selectedPoint && selectedPoint.forecast_mw !== null && (
              <ReferenceDot
                x={selectedPoint.timeLabel}
                y={selectedPoint.forecast_mw}
                r={7}
                fill="var(--accent-cyan)"
                stroke="#ffffff"
                strokeWidth={2}
              />
            )}
            {selectedPoint && selectedPoint.actual_mw !== null && (
              <ReferenceDot
                x={selectedPoint.timeLabel}
                y={selectedPoint.actual_mw}
                r={7}
                fill="var(--color-actual)"
                stroke="#ffffff"
                strokeWidth={2}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-caption-bar">
        <span><b>Hourly Resolution:</b> WINDFOR hourly forecast aligned with mean of 2 FUELHH half-hour slots under start-of-hour convention.</span>
        <span><b>Error Convention:</b> Forecast Error = Forecast − Actual (positive is overforecast).</span>
      </div>
    </div>
  )
}

function CustomForecastTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ChartPoint }> }) {
  if (!active || !payload || !payload.length) return null
  const p = payload[0].payload
  const errorTone = p.error_mw === null ? 'neutral' : p.error_mw > 0 ? 'over' : p.error_mw < 0 ? 'under' : 'exact'
  const errorLabel = p.error_mw === null ? '—' : p.error_mw > 0 ? 'Overforecast' : p.error_mw < 0 ? 'Underforecast' : 'Zero Error'

  return (
    <div className="custom-chart-tooltip">
      <div className="tooltip-header">
        <strong>Delivery: {p.timeLabel} London</strong>
        <span className="tooltip-utc">{formatUtc(p.start_time)}</span>
      </div>

      <div className="tooltip-grid">
        <div className="tooltip-row">
          <span className="tooltip-label">
            <span className="swatch-inline forecast-swatch" />
            Forecast:
          </span>
          <strong className="tooltip-val forecast-val">{formatMw(p.forecast_mw)}</strong>
        </div>

        <div className="tooltip-row">
          <span className="tooltip-label">
            <span className="swatch-inline actual-swatch" />
            Metered Actual:
          </span>
          <strong className="tooltip-val actual-val">{formatMw(p.actual_mw)}</strong>
        </div>

        <div className="tooltip-row">
          <span className="tooltip-label">Forecast Error:</span>
          <strong className={`tooltip-val error-val ${errorTone}`}>
            {signedMw(p.error_mw)}
            <small className="tooltip-error-sub">({errorLabel})</small>
          </strong>
        </div>

        <div className="tooltip-row">
          <span className="tooltip-label">Absolute Error:</span>
          <strong className="tooltip-val">{formatMw(p.abs_error_mw)}</strong>
        </div>

        <div className="tooltip-row status-row">
          <span className="tooltip-label">Status:</span>
          <span className={`status-mini-pill status-${p.status}`}>
            {p.status.replaceAll('_', ' ')} · {p.eligible_vintages} eligible vintages
          </span>
        </div>
      </div>

      <div className="tooltip-footer">Click to inspect publication revisions</div>
    </div>
  )
}
