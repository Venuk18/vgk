/** Types matching the WindSight FastAPI JSON responses. Fields are not invented. */

export type HealthResponse = {
  status: string
  version: string
  data_loaded: boolean
  cache_present: boolean
}

export type AccuracyMetrics = {
  units: string
  expected_periods: number
  forecast_available: number
  actual_available: number
  matched_count: number
  missing_forecast: number
  missing_actual: number
  partial_actual_periods: number
  mae_mw: number | null
  rmse_mw: number | null
  bias_mw: number | null
  overforecast_periods: number
  underforecast_periods: number
  exact_periods: number
  forecast_coverage_pct: number | null
  matched_coverage_pct: number | null
  coverage_denominator: string
  bias_interpretation: string
}

export type QualityReport = {
  rows_received?: number
  invalid_timestamp_rows?: number
  null_or_non_numeric_generation_rows?: number
  negative_generation_rows?: number
  outside_delivery_window_rows?: number
  off_hourly_grid_rows?: number
  off_half_hour_grid_rows?: number
  non_wind_rows_dropped?: number
  duplicate_rows_removed?: number
  conflicting_duplicate_keys?: number
  rows_kept?: number
  distinct_publications?: number
}

export type DataQuality = {
  expected_hourly_periods: number
  expected_half_hourly_actual_periods: number
  actual_half_hourly_present: number
  actual_half_hourly_missing: number
  matched_periods: number
  missing_forecast_periods: number
  missing_actual_periods: number
  partial_actual_periods: number
  unmatched_periods: number
  periods_with_vintages_but_none_eligible: number
  forecast_vintages_stored: number
  duplicate_or_invalid_records: {
    actuals: QualityReport
    forecasts: QualityReport
    total_duplicates_removed: number
    total_invalid_or_excluded: number
  }
}

export type IngestMeta = {
  fetched_at?: string
  source?: string
  base_url?: string
  actual_rows_fetched?: number
  forecast_rows_fetched?: number
  actual_requests?: number
  forecast_requests?: number
  forecast_publish_window?: { from: string; to_exclusive: string }
  failed_windows?: unknown[]
  complete?: boolean
}

export type SummaryResponse = {
  delivery_window: { start: string; end: string; timezone: string }
  assumptions: {
    cutoff_local_time: string
    cutoff_days_before_delivery: number
    hour_convention: string
    units: string
    resolution: string
  }
  metrics: AccuracyMetrics
  data_quality: DataQuality
  ingest: IngestMeta | null
  limitations: string[]
}

export type HourlyRecord = {
  start_time: string
  cutoff_time: string | null
  forecast_publish_time: string | null
  forecast_mw: number | null
  actual_mw: number | null
  error_mw: number | null
  abs_error_mw: number | null
  status: string
  eligible_vintages: number
  actual_slots: number
}

export type ForecastsResponse = {
  date: string
  units: string
  bias_definition: string
  hourly: HourlyRecord[]
  actuals_half_hourly: { start_time: string; generation_mw: number }[]
  metrics: AccuracyMetrics
}

export type DailyBreakdown = {
  date: string
  expected_periods: number
  matched_count: number
  mae_mw: number | null
  rmse_mw: number | null
  bias_mw: number | null
  forecast_coverage_pct: number | null
}

export type HourOfDayBreakdown = {
  hour: number
  matched_count: number
  mae_mw: number | null
  rmse_mw: number | null
  bias_mw: number | null
  sufficient_sample: boolean
}

export type ErrorBin = { from_mw: number; to_mw: number; count: number }

export type MetricsResponse = {
  start_date: string
  end_date: string
  metrics: AccuracyMetrics
  daily: DailyBreakdown[]
  hour_of_day: HourOfDayBreakdown[]
  error_distribution: { bin_width_mw: number; bins: ErrorBin[] }
}

export type Vintage = {
  publish_time: string
  forecast_mw: number
  before_cutoff: boolean
  selected: boolean
  revision_mw: number | null
}

export type RevisionsResponse = {
  delivery_start: string
  decision_cutoff: string
  selected_publish_time: string | null
  actual_mw: number | null
  vintages: Vintage[]
  summary: {
    vintages_total: number
    vintages_before_cutoff: number
    vintages_after_cutoff: number
    net_revision_before_cutoff_mw: number | null
    revision_after_cutoff_mw: number | null
  }
  availability_note: string | null
  units: string
}

export type ApiErrorBody = {
  detail?: { code?: string; message?: string } | Array<{ msg?: string }> | string
}

