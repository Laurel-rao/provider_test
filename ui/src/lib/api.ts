import { clearToken, getToken } from '@/lib/auth'

type LoginRequest = {
  username: string
  password: string
}

type LoginResponse = {
  access_token: string
  token_type: string
}

type CurrentUser = {
  id: number
  username: string
}

type ApiEndpoint = {
  id: number
  name: string
  url: string
  method: string
  headers_json: string | null
  request_body_json: string | null
  expected_status_code: number
  expected_response_text: string | null
  description: string | null
  monitor_interval_seconds: number
  api_key_id: number | null
  current_status: string
  last_check_at: string | null
  created_at: string
  updated_at: string
}

type EndpointCreate = {
  name: string
  url: string
  method?: string
  headers_json?: string | null
  request_body_json?: string | null
  expected_status_code?: number
  expected_response_text?: string | null
  description?: string | null
  monitor_interval_seconds?: number
  api_key_id?: number | null
}

type EndpointUpdate = {
  name?: string | null
  url?: string | null
  method?: string | null
  headers_json?: string | null
  request_body_json?: string | null
  expected_status_code?: number | null
  expected_response_text?: string | null
  description?: string | null
  monitor_interval_seconds?: number | null
  api_key_id?: number | null
}

type ErrorLog = {
  id: number
  endpoint_id: number | null
  module_name: string
  error_type: string
  error_message: string
  stack_trace: string | null
  http_status_code: number | null
  created_at: string
}

type PaginatedResponse<TItem> = {
  items: TItem[]
  total: number
  page: number
  page_size: number
}

type AlertRule = {
  id: number
  endpoint_id: number
  rule_type: string
  threshold_value: number
  is_active: boolean
  created_at: string
  updated_at: string
}

type Alert = {
  id: number
  alert_rule_id: number
  endpoint_id: number
  trigger_condition: string
  status: string
  triggered_at: string
  resolved_at: string | null
}

type AlertRuleCreate = {
  endpoint_id: number
  rule_type: string
  threshold_value: number
  is_active?: boolean
}

type AlertStatusUpdate = {
  status: string
}

type AIProvider = {
  id: number
  name: string
  provider_type: string
  base_url: string
  masked_key: string
  model: string
  description: string | null
  stream: boolean
  endpoint_id: number | null
  monitor_interval_seconds: number | null
  current_status: string | null
  last_check_at: string | null
  created_at: string
  updated_at: string
}

type AIProviderCreate = {
  name: string
  provider_type: string
  base_url: string
  api_key: string
  model: string
  description?: string | null
  stream?: boolean
  monitor_interval_seconds?: number
}

type AIProviderUpdate = {
  name?: string | null
  provider_type?: string | null
  base_url?: string | null
  api_key?: string | null
  model?: string | null
  description?: string | null
  stream?: boolean | null
  monitor_interval_seconds?: number | null
}

type ProviderTestResponse = {
  provider_id: number
  endpoint_id: number | null
  is_success: boolean
  status_code: number | null
  response_time_ms: number | null
  error_message: string | null
  checked_at: string
  current_status: string | null
}

type DashboardSummary = {
  total: number
  healthy: number
  unhealthy: number
  unknown: number
  health_rate: number
}

type ProbePoint = {
  value: number | null
  avg_response_time_ms: number | null
  timestamp: string
}

type ProviderProbeCard = {
  provider_id: number
  provider_name: string
  provider_type: string
  model: string
  current_status: string | null
  availability_rate: number | null
  avg_response_time_ms: number | null
  probes: ProbePoint[]
}

type CheckRecord = {
  id: number
  endpoint_id: number
  endpoint_name: string | null
  endpoint_url: string | null
  endpoint_method: string | null
  status_code: number | null
  response_time_ms: number | null
  is_success: boolean
  error_message: string | null
  response_body: string | null
  checked_at: string
}

async function request(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers)
  if (!headers.has('Content-Type') && init?.body) {
    headers.set('Content-Type', 'application/json')
  }

  const token = getToken()
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(`/api${path}`, {
    ...init,
    headers,
  })

  if (response.status === 401) {
    clearToken()
    throw new Error('登录已失效，请重新登录')
  }

  if (!response.ok) {
    let message = `请求失败 (${response.status})`
    const data = await response.json().catch(() => null)
    if (data) {
      message = data?.detail || data?.message || message
    }
    throw new Error(message)
  }

  return response
}

function buildQuery(params?: Record<string, string | number | boolean | null | undefined>) {
  if (!params) return ''
  const searchParams = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') return
    searchParams.set(key, String(value))
  })
  const query = searchParams.toString()
  return query ? `?${query}` : ''
}

async function getJSON<T>(path: string, params?: Record<string, string | number | boolean | null | undefined>) {
  const response = await request(`${path}${buildQuery(params)}`)
  return (await response.json()) as T
}

function normalizePaginatedResponse<T>(
  payload: PaginatedResponse<T> | T[],
  fallbackPage = 1,
  fallbackPageSize = 20,
): PaginatedResponse<T> {
  if (Array.isArray(payload)) {
    return {
      items: payload,
      total: payload.length,
      page: fallbackPage,
      page_size: payload.length || fallbackPageSize,
    }
  }

  return {
    items: Array.isArray(payload?.items) ? payload.items : [],
    total: typeof payload?.total === 'number' ? payload.total : 0,
    page: typeof payload?.page === 'number' ? payload.page : fallbackPage,
    page_size: typeof payload?.page_size === 'number' ? payload.page_size : fallbackPageSize,
  }
}

async function postJSON<T>(path: string, body: unknown) {
  const response = await request(path, {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return (await response.json()) as T
}

async function putJSON<T>(path: string, body: unknown) {
  const response = await request(path, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
  return (await response.json()) as T
}

export const api = {
  async login(payload: LoginRequest) {
    const response = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    })

    return (await response.json()) as LoginResponse
  },

  async getCurrentUser() {
    const response = await request('/auth/me')
    return (await response.json()) as CurrentUser
  },

  listEndpoints() {
    return getJSON<ApiEndpoint[]>('/endpoints/')
  },

  getEndpoint(endpointId: number) {
    return getJSON<ApiEndpoint>(`/endpoints/${endpointId}`)
  },

  createEndpoint(payload: EndpointCreate) {
    return postJSON<ApiEndpoint>('/endpoints/', payload)
  },

  updateEndpoint(endpointId: number, payload: EndpointUpdate) {
    return putJSON<ApiEndpoint>(`/endpoints/${endpointId}`, payload)
  },

  async deleteEndpoint(endpointId: number) {
    await request(`/endpoints/${endpointId}`, { method: 'DELETE' })
  },

  listLogs(params?: {
    endpoint_id?: number | null
    error_type?: string | null
    start_time?: string | null
    end_time?: string | null
    page?: number
    page_size?: number
  }) {
    return getJSON<PaginatedResponse<ErrorLog> | ErrorLog[]>('/logs/', params).then((payload) =>
      normalizePaginatedResponse(payload, params?.page ?? 1, params?.page_size ?? 20),
    )
  },

  listAlertRules() {
    return getJSON<AlertRule[]>('/alerts/rules')
  },

  createAlertRule(payload: AlertRuleCreate) {
    return postJSON<AlertRule>('/alerts/rules', payload)
  },

  async deleteAlertRule(ruleId: number) {
    await request(`/alerts/rules/${ruleId}`, { method: 'DELETE' })
  },

  listAlerts() {
    return getJSON<Alert[]>('/alerts')
  },

  updateAlertStatus(alertId: number, payload: AlertStatusUpdate) {
    return putJSON<Alert>(`/alerts/${alertId}/status`, payload)
  },

  listAIProviders() {
    return getJSON<AIProvider[]>('/ai-providers/')
  },

  getAIProvider(providerId: number) {
    return getJSON<AIProvider>(`/ai-providers/${providerId}`)
  },

  createAIProvider(payload: AIProviderCreate) {
    return postJSON<AIProvider>('/ai-providers/', payload)
  },

  updateAIProvider(providerId: number, payload: AIProviderUpdate) {
    return putJSON<AIProvider>(`/ai-providers/${providerId}`, payload)
  },

  async copyAIProvider(providerId: number) {
    return postJSON<AIProvider>(`/ai-providers/${providerId}/copy`, {})
  },

  async deleteAIProvider(providerId: number) {
    await request(`/ai-providers/${providerId}`, { method: 'DELETE' })
  },

  testAIProvider(providerId: number) {
    return postJSON<ProviderTestResponse>(`/ai-providers/${providerId}/test`, {})
  },

  getAIProviderDashboardSummary() {
    return getJSON<DashboardSummary>('/ai-providers/dashboard/summary')
  },

  listAIProviderProbeCards(params?: { provider_type?: string | null; hours?: number }) {
    return getJSON<ProviderProbeCard[]>('/ai-providers/dashboard/probe-cards', params)
  },

  listRecords(params?: {
    endpoint_id?: number | null
    status?: '200' | 'non200' | null
    start_time?: string | null
    end_time?: string | null
    page?: number
    page_size?: number
  }) {
    return getJSON<PaginatedResponse<CheckRecord> | CheckRecord[]>('/records/', params).then((payload) =>
      normalizePaginatedResponse(payload, params?.page ?? 1, params?.page_size ?? 20),
    )
  },

  getRecord(recordId: number) {
    return getJSON<CheckRecord>(`/records/${recordId}`)
  },

  async exportRecords(params?: {
    endpoint_id?: number | null
    status?: '200' | 'non200' | null
    start_time?: string | null
    end_time?: string | null
  }) {
    const response = await request(`/records/export${buildQuery(params)}`)
    return await response.blob()
  },
}

export type {
  AIProvider,
  Alert,
  AlertRule,
  ApiEndpoint,
  CheckRecord,
  CurrentUser,
  DashboardSummary,
  ErrorLog,
  LoginResponse,
  PaginatedResponse,
  ProbePoint,
  ProviderProbeCard,
  ProviderTestResponse,
}
