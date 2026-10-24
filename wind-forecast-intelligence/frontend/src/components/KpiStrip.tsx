import { useState } from 'react'
import type { AccuracyMetrics } from '../api/types'
import { formatLondonDate, formatMw, formatPct, signedMw } from '../lib/format'

type ScopeMode = 'month' | 'day'

interface KpiStripProps {
  monthMetrics: AccuracyMetrics
  dayMetrics?: AccuracyMetrics | null
  selectedDate: string
  scope: string
}

export function KpiStrip({ monthMetrics, dayMetrics, selectedDate, scope }: KpiStripProps) {
  const [mode, setMode] = useState<ScopeMode>('month')
  const [showDefinitions, setShowDefinitions] = useState(false)

  const activeMetrics = mode === 'day' && dayMetrics ? dayMetrics : monthMetrics
  const isDay = mode === 'day' && !!dayMetrics

  const bias = activeMetrics.bias_mw
  const biasTone = bias === null ? 'neutral' : bias > 0 ? 'over' : bias < 0 ? 'under' : 'neutral'

  const formattedDate = formatLondonDate(selectedDate)
  const matchedDetail = `${activeMetrics.matched_count} matched / ${activeMetrics.expected_periods} expected hours`

  return (
    <div className="kpi-section">
      <div className="kpi-header-row">
        <div className="kpi-scope-toggles" role="tablist" aria-label="Metrics scope">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'month'}
            className={`scope-pill-btn ${mode === 'month' ? 'active' : ''}`}
            onClick={() => setMode('month')}
          >
            <span className="scope-indicator" aria-hidden />
            <strong>Full Month Benchmark</strong>
            <span className="scope-tag">{scope} · 744 hrs</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'day'}
            disabled={!dayMetrics}
            className={`scope-pill-btn ${mode === 'day' ? 'active' : ''}`}
            onClick={() => setMode('day')}
          >
            <span className="scope-indicator" aria-hidden />
            <strong>Selected Delivery Day</strong>
            <span className="scope-tag">{formattedDate} · 24 hrs</span>
          </button>
        </div>

        <div className="kpi-controls-right">
          <span className="scope-badge">
            Viewing: {isDay ? `Delivery Day (${formattedDate})` : 'Full Window (Jan 1–31, 2026)'}
          </span>
          <button
            type="button"
            className="text-link-btn"
            aria-expanded={showDefinitions}
            onClick={() => setShowDefinitions((prev) => !prev)}
          >
            {showDefinitions ? 'Hide Metric Definitions' : 'Metric Definitions & Conventions'}
          </button>
        </div>
      </div>

      <div className="kpi-grid">
        <article className="kpi-card">
          <div className="kpi-top">
            <span className="kpi-label">Mean Absolute Error (MAE)</span>
            <span className="kpi-scope-tag">{isDay ? 'Selected Day' : 'Jan Benchmark'}</span>
          </div>
          <div className="kpi-value">{formatMw(activeMetrics.mae_mw)}</div>
          <div className="kpi-formula">Mean of |Forecast − Actual|</div>
          <div className="kpi-footer">
            {isDay && monthMetrics.mae_mw !== null ? (
              <span className="kpi-compare">
                Month benchmark: <b>{formatMw(monthMetrics.mae_mw)}</b>
              </span>
            ) : (
              <span>Calculated across {activeMetrics.matched_count} matched hours</span>
            )}
          </div>
        </article>

        <article className="kpi-card">
          <div className="kpi-top">
            <span className="kpi-label">Root Mean Squared Error (RMSE)</span>
            <span className="kpi-scope-tag">{isDay ? 'Selected Day' : 'Jan Benchmark'}</span>
          </div>
          <div className="kpi-value">{formatMw(activeMetrics.rmse_mw)}</div>
          <div className="kpi-formula">Square root of mean squared errors</div>
          <div className="kpi-footer">
            {isDay && monthMetrics.rmse_mw !== null ? (
              <span className="kpi-compare">
                Month benchmark: <b>{formatMw(monthMetrics.rmse_mw)}</b>
              </span>
            ) : (
              <span>Penalizes larger forecast deviations</span>
            )}
          </div>
        </article>

        <article className={`kpi-card bias-card tone-${biasTone}`}>
          <div className="kpi-top">
            <span className="kpi-label">Forecast Bias</span>
            <span className={`kpi-bias-pill ${biasTone}`}>
              {biasTone === 'over' ? 'Overforecast (+)' : biasTone === 'under' ? 'Underforecast (−)' : 'Unbiased'}
            </span>
          </div>
          <div className="kpi-value">{signedMw(bias)}</div>
          <div className="kpi-formula">Mean of (Forecast − Actual)</div>
          <div className="kpi-footer">
            <span className="kpi-bias-detail">
              {activeMetrics.overforecast_periods} over · {activeMetrics.underforecast_periods} under · {activeMetrics.exact_periods} exact
            </span>
          </div>
        </article>

        <article className="kpi-card coverage-card">
          <div className="kpi-top">
            <span className="kpi-label">Matched Coverage</span>
            <span className="kpi-coverage-pill good">{formatPct(activeMetrics.matched_coverage_pct)}</span>
          </div>
          <div className="kpi-value">{formatPct(activeMetrics.matched_coverage_pct)}</div>
          <div className="kpi-formula">{matchedDetail}</div>
          <div className="kpi-footer">
            <span className="kpi-coverage-note" title="Coverage indicates data availability, not forecast accuracy">
              Data availability · Not forecast accuracy
            </span>
          </div>
        </article>
      </div>

      {showDefinitions && (
        <div className="metric-definitions-box">
          <div className="def-item">
            <strong>Error Definition:</strong> Error = Forecast − Actual (MW).
          </div>
          <div className="def-item">
            <strong>Forecast Bias:</strong> A positive bias means the forecast was higher than actual generation (overforecast / shortfall). A negative bias means actual generation exceeded forecast (underforecast).
          </div>
          <div className="def-item">
            <strong>Matched Coverage:</strong> The proportion of expected hourly periods with valid, eligible forecasts and completed metered actuals. 100% coverage confirms zero missing delivery hours, NOT 100% forecast accuracy.
          </div>
        </div>
      )}
    </div>
  )
}
