import { useEffect, useMemo, useState } from 'react'
import { ApiError, apiGet } from './api/client'
import type {
  ForecastsResponse,
  HealthResponse,
  MetricsResponse,
  RevisionsResponse,
  SummaryResponse,
} from './api/types'
import { ErrorCharts } from './components/ErrorCharts'
import { ForecastChart } from './components/ForecastChart'
import { HourlyTable } from './components/HourlyTable'
import { KpiStrip } from './components/KpiStrip'
import { QualityPanel } from './components/QualityPanel'
import { RevisionChart } from './components/RevisionChart'
import { Card, EmptyBlock, ErrorBlock, LoadingBlock, SkeletonKpis } from './components/ui'
import {
  formatLondonDate,
  formatLondonDayName,
  formatLondonTime,
  formatMw,
} from './lib/format'

export default function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [summary, setSummary] = useState<SummaryResponse | null>(null)
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null)
  const [bootError, setBootError] = useState<string | null>(null)
  const [bootGeneration, setBootGeneration] = useState(0)

  const [date, setDate] = useState('')
  const [hour, setHour] = useState<string | null>(null)
  const [forecasts, setForecasts] = useState<ForecastsResponse | null>(null)
  const [forecastsDate, setForecastsDate] = useState<string | null>(null)
  const [dayError, setDayError] = useState<string | null>(null)

  const [revisions, setRevisions] = useState<RevisionsResponse | null>(null)
  const [revisionsHour, setRevisionsHour] = useState<string | null>(null)
  const [revError, setRevError] = useState<string | null>(null)

  const booting = summary === null && bootError === null
  const dayLoading = Boolean(date) && forecastsDate !== date
  const revLoading = Boolean(hour) && revisionsHour !== hour

  const windowLabel = useMemo(
    () => (summary ? `${summary.delivery_window.start} → ${summary.delivery_window.end}` : 'January 2026'),
    [summary],
  )

  // 1. Initial boot: health, summary, monthly metrics
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [h, s] = await Promise.all([
          apiGet<HealthResponse>('/api/health'),
          apiGet<SummaryResponse>('/api/summary'),
        ])
        if (cancelled) return
        setHealth(h)
        setSummary(s)

        const m = await apiGet<MetricsResponse>('/api/metrics', {
          start_date: s.delivery_window.start,
          end_date: s.delivery_window.end,
        })
        if (cancelled) return
        setMetrics(m)
        setDate((prev) => prev || s.delivery_window.start)
        setBootError(null)
      } catch (err) {
        if (!cancelled) {
          setBootError(err instanceof ApiError ? err.message : 'Unexpected error loading data services.')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [bootGeneration])

  // 2. Fetch forecasts when selected date changes
  useEffect(() => {
    if (!date) return
    let cancelled = false
    void (async () => {
      try {
        const data = await apiGet<ForecastsResponse>('/api/forecasts', { date })
        if (cancelled) return
        setForecasts(data)
        setDayError(null)
        setForecastsDate(date)

        // Select an hour on the new date (midday 12:00 UTC default or first available)
        setHour((prev) => {
          if (prev && data.hourly.some((r) => r.start_time === prev)) {
            return prev
          }
          const midday = data.hourly.find((r) => r.start_time.endsWith('T12:00:00Z'))
          return midday ? midday.start_time : data.hourly[0]?.start_time ?? null
        })
      } catch (err) {
        if (!cancelled) {
          setForecasts(null)
          setDayError(err instanceof ApiError ? err.message : 'Failed to load forecasts for this date.')
          setForecastsDate(date)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [date])

  // 3. Fetch revision history when selected hour changes
  useEffect(() => {
    if (!hour) return
    let cancelled = false
    void (async () => {
      try {
        const data = await apiGet<RevisionsResponse>('/api/revisions', { delivery_start: hour })
        if (cancelled) return
        setRevisions(data)
        setRevError(null)
        setRevisionsHour(hour)
      } catch (err) {
        if (!cancelled) {
          setRevisions(null)
          setRevError(err instanceof ApiError ? err.message : 'Failed to load revision vintages.')
          setRevisionsHour(hour)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [hour])

  const retryBoot = () => {
    setBootError(null)
    setSummary(null)
    setBootGeneration((n) => n + 1)
  }

  const retryDay = () => {
    setForecastsDate(null)
    setDayError(null)
  }

  const retryRevision = () => {
    setRevisionsHour(null)
    setRevError(null)
  }

  // Date increment/decrement handlers
  const handlePrevDay = () => {
    if (!summary || !date) return
    const cur = new Date(date)
    cur.setDate(cur.getDate() - 1)
    const nextIso = cur.toISOString().split('T')[0]
    if (nextIso >= summary.delivery_window.start) {
      setDate(nextIso)
    }
  }

  const handleNextDay = () => {
    if (!summary || !date) return
    const cur = new Date(date)
    cur.setDate(cur.getDate() + 1)
    const nextIso = cur.toISOString().split('T')[0]
    if (nextIso <= summary.delivery_window.end) {
      setDate(nextIso)
    }
  }

  const selectedHourFormatted = hour ? formatLondonTime(hour) : '—'

  return (
    <div className="dashboard-shell">
      {/* Sidebar navigation */}
      <aside className="sidebar">
        <a className="brand" href="#overview" aria-label="WindSight overview">
          <span className="brand-mark" aria-hidden="true">✳</span>
          <span className="brand-text">Wind<span className="brand-accent">Sight</span></span>
        </a>

        <nav className="side-nav" aria-label="Dashboard sections">
          <a className="nav-item" href="#overview">
            <span className="nav-icon">▦</span>
            <span className="nav-label">Overview</span>
          </a>
          <a className="nav-item" href="#forecast-analysis">
            <span className="nav-icon">⌁</span>
            <span className="nav-label">Forecast vs Actual</span>
          </a>
          <a className="nav-item" href="#revisions">
            <span className="nav-icon">⟳</span>
            <span className="nav-label">Revision Timeline</span>
          </a>
          <a className="nav-item" href="#hourly-records">
            <span className="nav-icon">▤</span>
            <span className="nav-label">Hourly Records</span>
          </a>
          <a className="nav-item" href="#error-analysis">
            <span className="nav-icon">📊</span>
            <span className="nav-label">Error Analytics</span>
          </a>
          <a className="nav-item" href="#data-quality">
            <span className="nav-icon">🛡</span>
            <span className="nav-label">Data Quality</span>
          </a>
          <a className="nav-item" href="#methodology">
            <span className="nav-icon">ⓘ</span>
            <span className="nav-label">Methodology</span>
          </a>
        </nav>

        <div className="sidebar-foot">
          <div className="windfarm-art" aria-hidden="true">
            <i /><i /><i />
          </div>
          <div className="data-source-badge">
            <div className="live-status-indicator">
              <span className="live-dot" />
              <span>Real Elexon Data</span>
            </div>
            <p>
              January 2026<br />
              WINDFOR forecasts<br />
              FUELHH actuals
            </p>
          </div>
        </div>
      </aside>

      {/* Main dashboard content */}
      <main className="app-content">
        {/* Top bar with header and delivery controls */}
        <header className="topbar" id="overview">
          <div className="brand-block">
            <div className="eyebrow-tag">Energy Intelligence · UK Wind Power</div>
            <h1>UK Wind Forecast Intelligence</h1>
            <p className="muted">
              Decision-time WINDFOR forecasts versus FUELHH metered wind generation
              <span className="header-separator">•</span> Europe/London timezone
            </p>
          </div>

          <div className="topbar-controls">
            {/* API and Ingestion Status */}
            <div className="control-widget status-widget">
              <span className="widget-label">Data Service</span>
              <HealthPill
                health={health}
                loading={booting}
                error={bootError}
                incomplete={summary?.ingest?.complete === false}
              />
              <span className="widget-sub">
                {health?.data_loaded ? 'January 2026 dataset ready' : booting ? 'Checking API...' : 'Status verified'}
              </span>
            </div>

            {/* Delivery Date Navigator */}
            <div className="control-widget date-navigator-widget">
              <span className="widget-label">Selected Delivery Date</span>
              <div className="date-picker-row">
                <button
                  type="button"
                  className="date-nav-arrow"
                  aria-label="Previous day"
                  onClick={handlePrevDay}
                  disabled={!summary || date <= (summary?.delivery_window.start || '')}
                >
                  ◀
                </button>
                <label className="date-input-wrap">
                  <input
                    type="date"
                    value={date}
                    min={summary?.delivery_window.start}
                    max={summary?.delivery_window.end}
                    disabled={!summary}
                    onChange={(e) => setDate(e.target.value)}
                  />
                  <span className="date-display-text">{date ? formatLondonDate(date) : 'Loading…'}</span>
                </label>
                <button
                  type="button"
                  className="date-nav-arrow"
                  aria-label="Next day"
                  onClick={handleNextDay}
                  disabled={!summary || date >= (summary?.delivery_window.end || '')}
                >
                  ▶
                </button>
              </div>
              <span className="widget-sub">
                {date ? formatLondonDayName(date) : 'Choose date'}
              </span>
            </div>

            {/* Full Analysis Window Reference */}
            <div className="control-widget window-widget">
              <span className="widget-label">Full Analysis Window</span>
              <strong>{summary ? '01–31 January 2026' : 'January 2026'}</strong>
              <span className="widget-sub">
                {metrics?.metrics.expected_periods ?? 744} total hourly delivery periods
              </span>
            </div>
          </div>
        </header>

        {/* Boot loading and error states */}
        {booting && <SkeletonKpis />}
        {bootError && <ErrorBlock message={bootError} onRetry={retryBoot} />}

        {/* Section 1: KPI strip with dual scope comparison */}
        {!booting && !bootError && summary && metrics && (
          <section aria-label="Forecast Accuracy KPIs" className="overview-section">
            <KpiStrip
              monthMetrics={metrics.metrics}
              dayMetrics={forecasts?.metrics ?? null}
              selectedDate={date}
              scope={windowLabel}
            />
          </section>
        )}

        {/* Section 2: Split Hero Row (Forecast vs Actual & Forecast Revision Timeline) */}
        <section className="hero-charts-section" id="forecast-analysis">
          <div className="split-hero-grid">
            {/* Chart 1: Forecast versus Actual */}
            <Card
              className="forecast-hero-card"
              title="Forecast versus Metered Actual Generation"
              subtitle={
                forecasts
                  ? `${formatLondonDate(forecasts.date)} · Day MAE: ${formatMw(forecasts.metrics.mae_mw)} · Bias: ${forecasts.metrics.bias_mw !== null && forecasts.metrics.bias_mw > 0 ? '+' : ''}${formatMw(forecasts.metrics.bias_mw)}`
                  : 'Hourly decision-time forecasts against metered actual generation.'
              }
              badge={
                forecasts ? (
                  <span className="pill-badge pill-eligible">
                    {forecasts.metrics.matched_count}/24 Hours Matched
                  </span>
                ) : undefined
              }
            >
              {dayLoading && <LoadingBlock label="Loading hourly forecasts…" />}
              {!dayLoading && dayError && <ErrorBlock message={dayError} onRetry={retryDay} />}
              {!dayLoading && !dayError && forecasts && (
                <ForecastChart
                  rows={forecasts.hourly}
                  selectedStart={hour}
                  onSelect={setHour}
                  units={forecasts.units}
                />
              )}
              {!dayLoading && !dayError && !forecasts && (
                <EmptyBlock title="No Forecast Series" body="Select a delivery date inside January 2026." />
              )}
            </Card>

            {/* Chart 2: Revision Timeline */}
            <Card
              className="revision-hero-card"
              id="revisions"
              title="Forecast Revision Timeline"
              subtitle={`Publication vintages leading to delivery hour ${selectedHourFormatted} London. Cutoff at 09:20 D-1 separates eligible from post-gate vintages.`}
              badge={
                hour ? (
                  <span className="pill-badge pill-selected-hour">
                    Selected Hour: {selectedHourFormatted} London
                  </span>
                ) : undefined
              }
            >
              {!hour && (
                <EmptyBlock
                  title="Select a Delivery Hour"
                  body="Click any hour point on the forecast chart or a row in the hourly table below."
                />
              )}
              {hour && revLoading && <LoadingBlock label="Loading vintage publications…" />}
              {hour && !revLoading && revError && <ErrorBlock message={revError} onRetry={retryRevision} />}
              {hour && !revLoading && !revError && revisions && <RevisionChart data={revisions} />}
            </Card>
          </div>
        </section>

        {/* Section 3: Error Analytics Row (Daily error, hour-of-day profile, error distribution) */}
        {metrics && (
          <section className="analytics-section" id="error-analysis">
            <ErrorCharts
              daily={metrics.daily}
              hourOfDay={metrics.hour_of_day}
              bins={metrics.error_distribution.bins}
              binWidth={metrics.error_distribution.bin_width_mw}
              selectedDate={date}
              onSelectDate={(newDate) => setDate(newDate)}
            />
          </section>
        )}

        {/* Section 4: Hourly Records Table */}
        <section className="records-section" id="hourly-records">
          <Card
            title={`Hourly Delivery Records — ${date ? formatLondonDate(date) : ''}`}
            subtitle="Hourly decision-time forecasts, metered actuals, and forecast errors in Europe/London. Click any row to load its revision history."
            badge={
              forecasts ? (
                <span className="pill-badge pill-neutral">
                  24 Delivery Hours ({forecasts.metrics.matched_count} Matched)
                </span>
              ) : undefined
            }
          >
            {dayLoading && <LoadingBlock label="Loading hourly table…" />}
            {!dayLoading && dayError && <ErrorBlock message={dayError} onRetry={retryDay} />}
            {!dayLoading && !dayError && forecasts && (
              <HourlyTable
                rows={forecasts.hourly}
                selectedStart={hour}
                onSelect={setHour}
              />
            )}
          </Card>
        </section>

        {/* Section 5: Data Quality & Ingestion & Methodology */}
        {summary && (
          <section className="quality-section" id="data-quality">
            <QualityPanel summary={summary} />
          </section>
        )}

        {/* Footer */}
        <footer className="footer-bar">
          <div className="footer-left">
            <span>WindSight UK Wind Forecast Intelligence · Gridbricks Hiring Challenge</span>
            <span className="footer-sep">•</span>
            <span>National metered wind only (excluding embedded generation).</span>
          </div>
          <div className="footer-right">
            <span>Delivery Window: 01–31 Jan 2026</span>
            {health && <span>API v{health.version}</span>}
          </div>
        </footer>
      </main>
    </div>
  )
}

function HealthPill({
  health,
  loading,
  error,
  incomplete,
}: {
  health: HealthResponse | null
  loading: boolean
  error: string | null
  incomplete: boolean
}) {
  if (error) {
    return <span className="status-pill-badge bad" role="status">API Offline / Error</span>
  }
  if (loading || !health) {
    return <span className="status-pill-badge neutral" role="status">Checking Service…</span>
  }
  if (incomplete) {
    return <span className="status-pill-badge warn" role="status">Online · Partial Ingest</span>
  }
  if (health.data_loaded) {
    return <span className="status-pill-badge good" role="status">API Online · Data Loaded</span>
  }
  if (health.cache_present) {
    return <span className="status-pill-badge warn" role="status">API Online · Cache Ready</span>
  }
  return <span className="status-pill-badge warn" role="status">API Online · No Cache</span>
}
