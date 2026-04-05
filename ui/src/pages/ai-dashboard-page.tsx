import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { api, type CheckRecord, type DashboardSummary, type ProviderProbeCard } from '@/lib/api'

const timeRanges = [
  { label: '1h', hours: 1 },
  { label: '6h', hours: 6 },
  { label: '12h', hours: 12 },
  { label: '24h', hours: 24 },
  { label: '3d', hours: 72 },
  { label: '7d', hours: 168 },
  { label: '30d', hours: 720 },
]

const providerTypes = [
  { label: '全部', value: '' },
  { label: 'OpenAI', value: 'openai' },
  { label: 'Claude', value: 'claude_code' },
  { label: 'Azure', value: 'azure_openai' },
  { label: 'Custom', value: 'custom' },
]

const providerStatusOptions = [
  { label: '全部', value: '' },
  { label: '正常', value: 'normal' },
  { label: '异常', value: 'abnormal' },
  { label: '未知', value: 'unknown' },
]

function statusLabel(status: string | null) {
  if (status === 'normal') return '正常'
  if (status === 'abnormal') return '异常'
  return '未知'
}

function normalizeProviderStatus(status: string | null) {
  if (status === 'normal' || status === 'abnormal') return status
  return 'unknown'
}

function healthRateColor(healthRate: number) {
  return healthRate >= 0.95 ? 'text-emerald-300' : 'text-amber-300'
}

function probeFillBackground(value: number | null) {
  if (value === 1) return 'bg-[var(--color-chart-3)]'
  if (value === 0) return 'bg-[var(--color-destructive)]'
  return 'bg-white/8'
}

function providerStatusBadgeClass(status: string | null) {
  if (status === 'normal') return 'bg-emerald-500/15 text-emerald-400'
  if (status === 'abnormal') return 'bg-red-500/15 text-red-400'
  return 'bg-slate-500/15 text-slate-400'
}

function availabilityValueColor(rate: number | null) {
  if (rate == null) return 'text-white'
  return rate >= 0.95 ? 'text-emerald-400' : 'text-red-400'
}

function formatAvailability(rate: number | null) {
  if (rate == null) return '--'
  return `${(rate * 100).toFixed(1)}%`
}

function formatLatency(latency: number | null) {
  if (latency == null) return '--'
  return `${latency.toFixed(0)}ms`
}

function prettyBody(body: string | null) {
  if (!body) return ''
  try {
    return JSON.stringify(JSON.parse(body), null, 2)
  } catch {
    return body
  }
}

function asArray<T>(value: T[] | null | undefined) {
  return Array.isArray(value) ? value : []
}

function buildSparklinePoints(values: number[]) {
  if (!values.length) return []
  if (values.length === 1) return [{ x: 0, y: 20 }, { x: 100, y: 20 }]

  const max = Math.max(...values)
  const min = Math.min(...values)
  const range = max - min || 1

  return values.map((value, index) => ({
    x: (index / (values.length - 1)) * 100,
    y: 32 - ((value - min) / range) * 20,
  }))
}

function buildSparklinePath(values: number[]) {
  const points = buildSparklinePoints(values)
  if (!points.length) return ''

  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`)
    .join(' ')
}

function buildSparklineAreaPath(values: number[]) {
  const points = buildSparklinePoints(values)
  if (!points.length) return ''

  const linePath = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`)
    .join(' ')

  return `${linePath} L100,36 L0,36 Z`
}

function AnimatedMetricValue({
  value,
  decimals = 0,
  suffix = '',
  className = '',
}: {
  value: number | null
  decimals?: number
  suffix?: string
  className?: string
}) {
  const [displayValue, setDisplayValue] = useState<number | null>(value)
  const previousValueRef = useRef<number | null>(value)

  useEffect(() => {
    if (value == null) {
      previousValueRef.current = null
      return
    }

    const startValue = previousValueRef.current ?? 0
    const diff = value - startValue
    const startedAt = performance.now()
    const duration = 550
    let frame = 0

    const update = (now: number) => {
      const progress = Math.min((now - startedAt) / duration, 1)
      const eased = 1 - (1 - progress) * (1 - progress)
      const nextValue = startValue + diff * eased
      setDisplayValue(nextValue)

      if (progress < 1) {
        frame = window.requestAnimationFrame(update)
      } else {
        previousValueRef.current = value
      }
    }

    frame = window.requestAnimationFrame(update)
    return () => window.cancelAnimationFrame(frame)
  }, [value])

  if (displayValue == null) {
    return <span className={className}>-</span>
  }

  return (
    <span className={className}>
      {displayValue.toFixed(decimals)}
      {suffix}
    </span>
  )
}

export function AIDashboardPage() {
  const navigate = useNavigate()
  const [providerType, setProviderType] = useState('')
  const [providerStatus, setProviderStatus] = useState<'' | 'normal' | 'abnormal' | 'unknown'>('')
  const [providerNameQuery, setProviderNameQuery] = useState('')
  const [hours, setHours] = useState(24)
  const [selectedEndpointId, setSelectedEndpointId] = useState<number | null>(null)
  const [recordStatus, setRecordStatus] = useState<'' | '200' | 'non200'>('')
  const [recordPage, setRecordPage] = useState(1)
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [cards, setCards] = useState<ProviderProbeCard[]>([])
  const [records, setRecords] = useState<CheckRecord[]>([])
  const [recordTotal, setRecordTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detail, setDetail] = useState<CheckRecord | null>(null)
  const recordPageSize = 8

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [summaryData, cardData, recordData] = await Promise.all([
        api.getAIProviderDashboardSummary(),
        api.listAIProviderProbeCards({
          provider_type: providerType || null,
          hours,
        }),
        api.listRecords({ page: recordPage, page_size: recordPageSize, endpoint_id: selectedEndpointId, status: recordStatus || null }),
      ])
      setSummary(summaryData ?? null)
      setCards(
        asArray(cardData).map((card) => ({
          ...card,
          probes: asArray(card.probes),
        })),
      )
      setRecords(asArray(recordData?.items))
      setRecordTotal(typeof recordData?.total === 'number' ? recordData.total : 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载 AI 仪表盘失败')
      setCards([])
      setRecords([])
      setRecordTotal(0)
    } finally {
      setLoading(false)
    }
  }, [hours, providerType, recordPage, selectedEndpointId, recordStatus])

  useEffect(() => {
    load().catch(() => undefined)
    const timer = window.setInterval(() => {
      load().catch(() => undefined)
    }, 15000)
    return () => window.clearInterval(timer)
  }, [load])

  const filteredCards = useMemo(() => {
    const keyword = providerNameQuery.trim().toLowerCase()
    return cards.filter((card) => {
      if (providerStatus && normalizeProviderStatus(card.current_status) !== providerStatus) return false
      if (!keyword) return true
      return card.provider_name.toLowerCase().includes(keyword)
    })
  }, [cards, providerNameQuery, providerStatus])

  const filteredSummary = useMemo(() => {
    if (!cards.length) return summary
    const total = filteredCards.length
    const healthy = filteredCards.filter((card) => normalizeProviderStatus(card.current_status) === 'normal').length
    const unhealthy = filteredCards.filter((card) => normalizeProviderStatus(card.current_status) === 'abnormal').length
    const unknown = Math.max(0, total - healthy - unhealthy)
    const health_rate = total ? healthy / total : 0
    return { total, healthy, unhealthy, unknown, health_rate }
  }, [cards.length, filteredCards, summary])

  const summaryCards = useMemo(
    () => [
      { title: '总数', value: filteredSummary?.total ?? null, decimals: 0, suffix: '' },
      { title: '正常', value: filteredSummary?.healthy ?? null, decimals: 0, suffix: '' },
      { title: '异常', value: filteredSummary?.unhealthy ?? null, decimals: 0, suffix: '' },
      { title: '未知', value: filteredSummary?.unknown ?? null, decimals: 0, suffix: '' },
      {
        title: '健康率',
        value: filteredSummary ? filteredSummary.health_rate * 100 : null,
        decimals: 1,
        suffix: '%',
      },
    ],
    [filteredSummary],
  )

  const totalRecordPages = useMemo(() => Math.max(1, Math.ceil(recordTotal / recordPageSize)), [recordPageSize, recordTotal])

  const openRecordDetail = useCallback(async (recordId: number) => {
    setDetailOpen(true)
    setDetailLoading(true)
    setDetail(null)
    try {
      const data = await api.getRecord(recordId)
      setDetail(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载日志详情失败')
      setDetailOpen(false)
    } finally {
      setDetailLoading(false)
    }
  }, [])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2 rounded-full border border-red-500/20 bg-red-500/8 px-3 py-1 text-xs text-red-300">
          <span className="status-breath-dot" />
          <span>{loading ? '刷新中' : '实时监测'}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            className="flex h-8 min-w-32 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            value={providerStatus}
            onChange={(event) => setProviderStatus(event.target.value as typeof providerStatus)}
          >
            {providerStatusOptions.map((item) => (
              <option key={item.value || 'all'} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>

          <Input
            value={providerNameQuery}
            onChange={(event) => setProviderNameQuery(event.target.value)}
            placeholder="名称搜索"
            className="h-8 w-56"
          />

          <select
            className="flex h-8 min-w-32 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            value={providerType}
            onChange={(event) => setProviderType(event.target.value)}
          >
            {providerTypes.map((item) => (
              <option key={item.value || 'all'} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>

          <div className="flex flex-wrap gap-2">
            {timeRanges.map((item) => (
              <Button
                key={item.hours}
                size="sm"
                variant={item.hours === hours ? 'default' : 'outline'}
                onClick={() => setHours(item.hours)}
              >
                {item.label}
              </Button>
            ))}
          </div>

          <Button size="sm" variant="outline" onClick={() => navigate('/ai-providers')}>
            管理供应商
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      <Card className="border-border/60 bg-card/70">
        <CardContent className="px-4 py-2.5">
          <div className="flex items-center gap-3 overflow-x-auto whitespace-nowrap">
            {summaryCards.map((item) => {
              const isHealthRate = item.title === '健康率'

              return (
                <div
                  key={item.title}
                  className="flex min-w-[120px] items-center gap-3 rounded-lg border border-border/50 bg-background/40 px-3 py-2"
                >
                  <CardDescription className="shrink-0 text-xs">{item.title}</CardDescription>
                  <CardTitle className="text-lg">
                    <AnimatedMetricValue
                      value={item.value}
                      decimals={item.decimals}
                      suffix={item.suffix}
                      className={isHealthRate && filteredSummary ? healthRateColor(filteredSummary.health_rate) : ''}
                    />
                  </CardTitle>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {loading && !cards.length ? (
        <div className="rounded-xl border border-border/60 px-4 py-10 text-center text-sm text-muted-foreground">
          加载中...
        </div>
      ) : cards.length ? (
        filteredCards.length ? (
          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
            {filteredCards.map((card) => {
              const probes = Array.isArray(card.probes) ? card.probes : []
              const lineValues = probes
                .map((probe) => probe.avg_response_time_ms)
                .filter((value): value is number => value != null)
              const sparklinePath = buildSparklinePath(lineValues)
              const sparklineAreaPath = buildSparklineAreaPath(lineValues)
              const sparklineStroke = card.current_status === 'abnormal' ? 'rgb(239 68 68)' : 'rgb(0 180 216)'
              const sparklineFill = card.current_status === 'abnormal' ? 'rgba(239,68,68,0.15)' : 'rgba(0,180,216,0.15)'
              const isSelected = selectedEndpointId != null && card.endpoint_id === selectedEndpointId
              const canSelect = card.endpoint_id != null

              return (
                <div
                  key={card.provider_id}
                  role="button"
                  tabIndex={0}
                  className={`overflow-hidden rounded-lg border bg-card px-3 py-3 transition-all ${
                    isSelected ? 'border-primary ring-1 ring-primary' : 'border-border/60'
                  } ${canSelect ? 'cursor-pointer hover:border-primary/50' : 'opacity-80'}`}
                  onClick={() => {
                    if (!canSelect) return
                    setSelectedEndpointId(isSelected ? null : card.endpoint_id)
                    setRecordPage(1)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      if (!canSelect) return
                      setSelectedEndpointId(isSelected ? null : card.endpoint_id)
                      setRecordPage(1)
                    }
                  }}
                >
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-foreground">{card.provider_name}</p>
                    </div>
                    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${providerStatusBadgeClass(card.current_status)}`}>
                      <span className="size-1.5 rounded-full bg-current" />
                      {statusLabel(card.current_status)}
                    </span>
                  </div>
                  <div className="mb-2 truncate text-[11px] text-muted-foreground">
                    {card.provider_type} · {card.model}
                  </div>

                  <div className="mb-1.5 flex gap-0.5">
                    {probes.map((probe, index) => (
                      <div
                        key={`${card.provider_id}-${index}-${probe.timestamp}`}
                        className={`h-3.5 min-w-0 flex-1 rounded-[2px] ${probeFillBackground(probe.value)}`}
                        title={`${probe.timestamp} · ${probe.value === 1 ? '正常' : probe.value === 0 ? '异常' : '无数据'}${probe.avg_response_time_ms != null ? ` · ${probe.avg_response_time_ms.toFixed(0)}ms` : ''}`}
                      />
                    ))}
                  </div>

                  <div className="mb-2 h-12">
                    {sparklinePath ? (
                      <svg className="h-full w-full" viewBox="0 0 100 36" preserveAspectRatio="none">
                        <path d={sparklineAreaPath} fill={sparklineFill} />
                        <path
                          d={sparklinePath}
                          fill="none"
                          stroke={sparklineStroke}
                          strokeWidth="1.5"
                          vectorEffect="non-scaling-stroke"
                        />
                      </svg>
                    ) : (
                      <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground">暂无延迟曲线</div>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-[11px]">
                    <p className="text-muted-foreground">
                      可用{' '}
                      <span className={`text-[13px] font-semibold ${availabilityValueColor(card.availability_rate)}`}>
                        {formatAvailability(card.availability_rate)}
                      </span>
                    </p>
                    <p className="text-muted-foreground">
                      延迟 <span className="text-[13px] font-semibold text-foreground">{formatLatency(card.avg_response_time_ms)}</span>
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-border/60 px-4 py-10 text-center text-sm text-muted-foreground">
            暂无匹配的供应商
          </div>
        )
      ) : (
        <div className="rounded-xl border border-border/60 px-4 py-10 text-center text-sm text-muted-foreground">
          暂无供应商数据
        </div>
      )}

      <Card className="border-border/60">
        <CardHeader className="flex flex-row items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <CardTitle className="text-sm">日志</CardTitle>
            {selectedEndpointId != null && (
              <Badge
                variant="secondary"
                className="cursor-pointer hover:bg-secondary/80"
                onClick={() => {
                  setSelectedEndpointId(null)
                  setRecordPage(1)
                }}
              >
                已筛选供应商端点 <span className="ml-1 text-muted-foreground">✕</span>
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <select
              className="flex h-8 min-w-28 rounded-md border border-input bg-transparent px-3 py-1 text-xs shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              value={recordStatus}
              onChange={(event) => {
                setRecordStatus(event.target.value as typeof recordStatus)
                setRecordPage(1)
              }}
            >
              <option value="">全部状态</option>
              <option value="200">成功 (200)</option>
              <option value="non200">失败 (非200)</option>
            </select>
            <span className="text-xs text-muted-foreground">
              第 {recordPage} / {totalRecordPages} 页，共 {recordTotal} 条
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={loading || recordPage <= 1}
              onClick={() => setRecordPage((prev) => prev - 1)}
            >
              上一页
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={loading || recordPage >= totalRecordPages}
              onClick={() => setRecordPage((prev) => prev + 1)}
            >
              下一页
            </Button>
            <Button size="sm" variant="outline" onClick={() => navigate(selectedEndpointId ? `/records?endpointId=${selectedEndpointId}` : '/records')}>
              全部日志
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          <div className="rounded-xl border border-border/60">
            {records.length ? (
              records.map((record, index) => (
                <div
                  key={record.id}
                  className={`grid grid-cols-[minmax(0,2fr)_72px_88px_160px_72px] items-center gap-3 px-3 py-2 text-xs transition hover:bg-muted/20 ${
                    index ? 'border-t border-border/60' : ''
                  }`}
                  role="button"
                  tabIndex={0}
                  title={record.endpoint_url || ''}
                  onClick={() => openRecordDetail(record.id).catch(() => undefined)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      openRecordDetail(record.id).catch(() => undefined)
                    }
                  }}
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">
                      {record.endpoint_name || `Endpoint #${record.endpoint_id}`}
                    </p>
                  </div>
                  <p className="truncate text-muted-foreground">{record.status_code ?? '-'}</p>
                  <p className="truncate text-muted-foreground">
                    {record.response_time_ms != null ? `${record.response_time_ms.toFixed(0)}ms` : '-'}
                  </p>
                  <p className="truncate text-muted-foreground">{new Date(record.checked_at).toLocaleString()}</p>
                  <div className="flex justify-end">
                    <Badge variant={record.is_success ? 'success' : 'warning'}>
                      {record.is_success ? '成功' : '失败'}
                    </Badge>
                  </div>
                </div>
              ))
            ) : (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">暂无请求记录</div>
            )}
          </div>
        </CardContent>
      </Card>

      {detailOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
          <div className="w-full max-w-4xl rounded-2xl border border-border/60 bg-card p-6 shadow-xl">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold">日志详情</h3>
                <p className="mt-1 text-sm text-muted-foreground">{detail ? `#${detail.id}` : ''}</p>
              </div>
              <Button
                variant="ghost"
                onClick={() => {
                  setDetailOpen(false)
                  setDetail(null)
                }}
              >
                关闭
              </Button>
            </div>

            {detailLoading ? (
              <div className="mt-6 text-sm text-muted-foreground">加载中...</div>
            ) : detail ? (
              <div className="mt-6 space-y-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                    <p className="text-xs text-muted-foreground">端点</p>
                    <p className="mt-2 font-medium">{detail.endpoint_name || `Endpoint #${detail.endpoint_id}`}</p>
                    <p className="mt-1 break-all text-xs text-muted-foreground">{detail.endpoint_url || ''}</p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                    <p className="text-xs text-muted-foreground">检测时间</p>
                    <p className="mt-2 text-sm">{new Date(detail.checked_at).toLocaleString()}</p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                    <p className="text-xs text-muted-foreground">结果</p>
                    <div className="mt-2">
                      <Badge variant={detail.is_success ? 'success' : 'warning'}>
                        {detail.is_success ? '成功' : '失败'}
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {detail.status_code ?? '-'} · {detail.response_time_ms != null ? `${detail.response_time_ms.toFixed(0)}ms` : '-'}
                    </p>
                  </div>
                </div>

                {detail.error_message ? (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200 whitespace-pre-wrap break-words">
                    {detail.error_message}
                  </div>
                ) : null}

                {detail.response_body ? (
                  <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                    <p className="text-xs text-muted-foreground">响应内容</p>
                    <pre className="mt-3 max-h-[420px] overflow-auto whitespace-pre-wrap break-words text-sm text-foreground">
                      {prettyBody(detail.response_body)}
                    </pre>
                  </div>
                ) : (
                  <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                    <p className="text-xs text-muted-foreground">响应内容</p>
                    <p className="mt-3 text-sm text-muted-foreground">无响应内容</p>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
