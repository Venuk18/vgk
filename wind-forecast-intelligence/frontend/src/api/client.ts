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
  const raw = import.meta.env.VITE_API_BASE_URL || '/api'
  return raw.replace(/\/$/, '')
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

export async function apiGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const base = apiBaseUrl()
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  let url: URL

  if (base.startsWith('http://') || base.startsWith('https://')) {
    const baseWithoutTrailing = base.replace(/\/+$/, '')
    const finalPath = baseWithoutTrailing.endsWith('/api') && cleanPath.startsWith('/api/')
      ? cleanPath.slice(4)
      : cleanPath
    url = new URL(finalPath, `${baseWithoutTrailing}/`)
  } else {
    const finalPath = base === '/api' && !cleanPath.startsWith('/api')
      ? `/api${cleanPath}`
      : cleanPath
    url = new URL(finalPath, window.location.origin)
  }

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value)
    }
  }

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
