import type { ReactNode } from 'react'

export function Card({
  title,
  subtitle,
  badge,
  action,
  children,
  className = '',
  id,
}: {
  title?: string
  subtitle?: string
  badge?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  id?: string
}) {
  return (
    <section className={`card ${className}`.trim()} id={id}>
      {(title || action || badge) && (
        <header className="card-head">
          <div className="card-title-group">
            <div className="card-heading-row">
              {title && <h2>{title}</h2>}
              {badge}
            </div>
            {subtitle && <p className="card-subtitle muted">{subtitle}</p>}
          </div>
          {action && <div className="card-actions">{action}</div>}
        </header>
      )}
      {children}
    </section>
  )
}

export function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="state loading-state" role="status">
      <span className="spinner" aria-hidden />
      <span className="loading-label">{label}</span>
    </div>
  )
}

export function EmptyBlock({ title, body }: { title: string; body: string }) {
  return (
    <div className="state empty-state">
      <div className="empty-icon" aria-hidden>∅</div>
      <strong>{title}</strong>
      <p className="muted">{body}</p>
    </div>
  )
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state error-state" role="alert">
      <div className="error-icon" aria-hidden>⚠</div>
      <strong>API Error</strong>
      <p>{message}</p>
      {onRetry && (
        <button type="button" className="btn btn-primary" onClick={onRetry}>
          Retry Request
        </button>
      )}
    </div>
  )
}

export function SkeletonKpis() {
  return (
    <div className="kpi-grid">
      {['mae', 'rmse', 'bias', 'coverage'].map((id) => (
        <div key={id} className="kpi skeleton-card">
          <div className="skel skel-sm" />
          <div className="skel skel-lg" />
          <div className="skel skel-md" />
        </div>
      ))}
    </div>
  )
}
