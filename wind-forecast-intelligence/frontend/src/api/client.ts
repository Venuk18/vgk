import type { ApiErrorBody } from './types'

export class ApiError extends Error {
  readonly status: number
  readonly code: string | undefined

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

export function apiBaseUrl(): string {
  const raw =
    import.meta.env.VITE_API_BASE_URL ||
    import.meta.env.VITE_API_URL ||
    import.meta.env.NEXT_PUBLIC_API_URL ||
    import.meta.env.REACT_APP_API_URL ||
    '/api'
  return raw.trim().replace(/\/+$/, '')
}

function detailMessage(body: ApiErrorBody | undefined, fallback: string): { message: string; code?: string } {
  const detail = body?.detail
  if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
    return {
      message: detail.message || fallback,
      code: detail.code,
    }
  }
  if (Array.isArray(detail) && detail[0]?.msg) {
    return { message: detail.map((d) => d.msg).filter(Boolean).join('; ') || fallback }
  }
  if (typeof detail === 'string') return { message: detail }
  return { message: fallback }
}

export function buildApiUrl(path: string, params?: Record<string, string>): URL {
  const base = apiBaseUrl()

  // Ensure path starts with /api (avoid duplicate /api/api)
  let cleanPath = path.startsWith('/') ? path : `/${path}`
  if (!cleanPath.startsWith('/api/') && cleanPath !== '/api') {
    cleanPath = `/api${cleanPath}`
  }

  let url: URL
  if (base.startsWith('http://') || base.startsWith('https://')) {
    // If base ends with /api, remove it so cleanPath provides /api without doubling
    const rootBase = base.endsWith('/api') ? base.slice(0, -4) : base
    url = new URL(`${rootBase}${cleanPath}`)
  } else {
    // Relative path on current origin (e.g. /api/health for Vite proxy or Vercel rewrites)
    url = new URL(cleanPath, window.location.origin)
  }

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value)
    }
  }

  return url
}

export async function apiGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = buildApiUrl(path, params)

  let response: Response
  try {
    response = await fetch(url.toString(), { headers: { Accept: 'application/json' } })
  } catch {
    throw new ApiError(
      `Cannot reach the API at ${url.origin}. Verify that the FastAPI backend is running.`,
      0,
      'network',
    )
  }

  if (!response.ok) {
    let body: ApiErrorBody | undefined
    try {
      body = (await response.json()) as ApiErrorBody
    } catch {
      body = undefined
    }
    const parsed = detailMessage(body, `API request failed (${response.status})`)
    throw new ApiError(parsed.message, response.status, parsed.code)
  }

  return (await response.json()) as T
}
