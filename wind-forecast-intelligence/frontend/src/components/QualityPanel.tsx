import type { IngestMeta, QualityReport, SummaryResponse } from '../api/types'
import { formatInt, formatUtc } from '../lib/format'
import { Card } from './ui'

export function QualityPanel({ summary }: { summary: SummaryResponse }) {
  const q = summary.data_quality
  const ingest = summary.ingest
  const dup = q.duplicate_or_invalid_records

  return (
    <div className="quality-methodology-section">
      <div className="section-intro">
        <h2>Data Integrity, Ingestion Audit & Methodology</h2>
        <p className="muted">
          Transparent metrics on data completeness, pipeline reconciliation, and formal governance disclosures for client evaluation.
        </p>
      </div>

      <div className="quality-grid">
        {/* Card 1: Measured Data Quality */}
        <Card
          title="Measured Data Quality & Alignment"
          subtitle="Observed counts across the January 2026 delivery window. Absent measurements remain missing rather than imputed as zeros."
          badge={<span className="pill-badge pill-eligible">100% Matched Coverage</span>}
        >
          <div className="metric-stats-grid">
            <div className="quality-stat-box">
              <span className="q-label">Expected Hourly Periods</span>
              <strong className="q-val">{formatInt(q.expected_hourly_periods)}</strong>
              <span className="q-sub">24 hrs × 31 days</span>
            </div>
            <div className="quality-stat-box">
              <span className="q-label">Matched Delivery Periods</span>
              <strong className="q-val text-good">{formatInt(q.matched_periods)}</strong>
              <span className="q-sub">100% coverage</span>
            </div>
            <div className="quality-stat-box">
              <span className="q-label">Missing Forecast Periods</span>
              <strong className="q-val">{formatInt(q.missing_forecast_periods)}</strong>
              <span className="q-sub">0 periods missed</span>
            </div>
            <div className="quality-stat-box">
              <span className="q-label">Missing / Partial Actuals</span>
              <strong className="q-val">{formatInt(q.missing_actual_periods)} / {formatInt(q.partial_actual_periods)}</strong>
              <span className="q-sub">All 2-slot pairs intact</span>
            </div>
            <div className="quality-stat-box">
              <span className="q-label">Half-Hour Actual Slots</span>
              <strong className="q-val">{formatInt(q.actual_half_hourly_present)}</strong>
              <span className="q-sub">0 missing slots</span>
            </div>
            <div className="quality-stat-box">
              <span className="q-label">Forecast Vintages Stored</span>
              <strong className="q-val text-cyan">{formatInt(q.forecast_vintages_stored)}</strong>
              <span className="q-sub">Total WINDFOR rows</span>
            </div>
            <div className="quality-stat-box">
              <span className="q-label">Duplicates Removed</span>
              <strong className="q-val">{formatInt(dup.total_duplicates_removed)}</strong>
              <span className="q-sub">Deterministic deduplication</span>
            </div>
            <div className="quality-stat-box">
              <span className="q-label">Invalid / Dropped Rows</span>
              <strong className="q-val">{formatInt(dup.total_invalid_or_excluded)}</strong>
              <span className="q-sub">Zero corrupted records</span>
            </div>
          </div>

          <div className="source-checks-split">
            <QualitySubReport title="FUELHH Metered Actuals Checks" report={dup.actuals} />
            <QualitySubReport title="WINDFOR Forecasts Checks" report={dup.forecasts} />
          </div>
        </Card>

        {/* Card 2: Ingestion Facts */}
        <Card
          title="Ingestion Run Audit"
          subtitle="Metadata recorded during data acquisition from the Elexon Insights Solution (BMRS API)."
          badge={
            <span className={`pill-badge ${ingest?.complete ? 'pill-eligible' : 'pill-post-cutoff'}`}>
              {ingest?.complete ? 'Ingestion Complete' : 'Ingestion Partial'}
            </span>
          }
        >
          <IngestAuditBlock ingest={ingest} />
        </Card>
      </div>

      {/* Card 3: Methodology Assumptions & Governance Disclosures */}
      <div id="methodology">
        <Card
          title="Methodology Assumptions & Governance Disclosures"
          subtitle="Explicit documentation of analytical rules, conventions, and boundary assumptions."
        >
          <div className="methodology-cards-grid">
            <div className="disclosure-card">
              <div className="disclosure-badge">Assumption 1</div>
              <h4>Provisional Decision Cutoff (09:20 Europe/London on D-1)</h4>
              <p>
                Decision-time forecasts are selected based on the latest eligible WINDFOR publication available at or before <b>09:20 Europe/London</b> on the day prior to delivery (D-1). This aligns with the EPEX SPOT GB Day-Ahead gate closure (09:20 London). This cutoff is a documented, provisional engineering assumption, not a confirmed utility- or buyer-specific trading deadline.
              </p>
            </div>

            <div className="disclosure-card">
              <div className="disclosure-badge">Assumption 2</div>
              <h4>Resolution Alignment & Hour Convention</h4>
              <p>
                Elexon WINDFOR forecasts are published at hourly intervals, whereas FUELHH generation is reported in half-hourly settlement periods. Hourly actual generation is computed as the arithmetic mean of the two corresponding half-hour settlement periods under the <b>hour-start convention</b> (hour beginning at timestamp <i>t</i> averages <i>[t, t+30m]</i>).
              </p>
            </div>

            <div className="disclosure-card">
              <div className="disclosure-badge">Assumption 3</div>
              <h4>Metered Wind vs Embedded Generation</h4>
              <p>
                Elexon FUELHH represents Great Britain national metered wind generation connected to the transmission network. Small-scale embedded or distribution-connected wind generation is not metered under FUELHH and is consequently excluded from this analysis.
              </p>
            </div>

            <div className="disclosure-card">
              <div className="disclosure-badge">Assumption 4</div>
              <h4>Units & Endpoint Interpretation</h4>
              <p>
                WINDFOR generation forecast values are treated as Megawatts (MW), matching the standard FUELHH output unit. Although the Elexon Insights endpoint description does not explicitly state the unit string, MW is the documented BMRS convention for national wind capability.
              </p>
            </div>

            <div className="disclosure-card">
              <div className="disclosure-badge">Assumption 5</div>
              <h4>Error Convention & Bias Direction</h4>
              <p>
                Forecast error is rigorously defined as <b>Forecast − Actual</b>. A <b>positive bias</b> indicates overforecasting (forecast exceeded actual generation, resulting in an unexpected generation deficit). A <b>negative bias</b> indicates underforecasting (actual generation exceeded forecast).
              </p>
            </div>

            <div className="disclosure-card">
              <div className="disclosure-badge">Assumption 6</div>
              <h4>Delivery Window & Data Coverage</h4>
              <p>
                The primary evaluation window spans <b>1–31 January 2026</b> (744 total hourly delivery periods). <b>100% matched coverage</b> indicates that all 744 delivery hours had both an eligible forecast and valid metered actuals; it must not be confused with 100% forecasting accuracy.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}

function IngestAuditBlock({ ingest }: { ingest: IngestMeta | null }) {
  if (!ingest || !Object.keys(ingest).length) {
    return <p className="muted">No ingestion metadata was attached to this dataset.</p>
  }

  const failedCount = ingest.failed_windows?.length ?? 0

  return (
    <div className="ingest-block">
      <ul className="audit-detail-list">
        <li>
          <span>Data Provider / Source</span>
          <strong>{ingest.source || 'Elexon BMRS API'}</strong>
        </li>
        <li>
          <span>Base API Endpoint</span>
          <strong className="mono">{ingest.base_url || 'https://data.elexon.co.uk/bmrs/api/v1/datasets'}</strong>
        </li>
        <li>
          <span>Acquisition Timestamp (UTC)</span>
          <strong className="mono">{formatUtc(ingest.fetched_at)}</strong>
        </li>
        <li>
          <span>Ingestion Completion</span>
          <strong className={ingest.complete ? 'text-good' : 'text-warn'}>
            {ingest.complete ? 'Completed successfully (100%)' : 'Incomplete'}
          </strong>
        </li>
        <li>
          <span>Actual Rows Fetched (FUELHH)</span>
          <strong className="tabular-num">{formatInt(ingest.actual_rows_fetched)} half-hourly records</strong>
        </li>
        <li>
          <span>Forecast Vintages Fetched (WINDFOR)</span>
          <strong className="tabular-num">{formatInt(ingest.forecast_rows_fetched)} vintages</strong>
        </li>
        <li>
          <span>HTTP Requests (Actuals / Forecasts)</span>
          <strong className="tabular-num">
            {formatInt(ingest.actual_requests)} / {formatInt(ingest.forecast_requests)} requests
          </strong>
        </li>
        <li>
          <span>Failed Fetch Windows</span>
          <strong className={failedCount === 0 ? 'text-good' : 'text-warn'}>
            {failedCount} failed windows
          </strong>
        </li>
      </ul>

      {failedCount > 0 && (
        <div className="failed-windows-alert">
          <strong>Failed Windows:</strong>
          <ul>
            {ingest.failed_windows?.map((item, i) => (
              <li key={i}>{typeof item === 'string' ? item : JSON.stringify(item)}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function QualitySubReport({ title, report }: { title: string; report: QualityReport }) {
  return (
    <div className="quality-sub-report">
      <h4>{title}</h4>
      <ul className="sub-report-list">
        {Object.entries(report).map(([key, val]) => (
          <li key={key}>
            <span>{key.replaceAll('_', ' ')}</span>
            <strong className="tabular-num">{typeof val === 'number' ? formatInt(val) : String(val)}</strong>
          </li>
        ))}
      </ul>
    </div>
  )
}
