import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { api, type ApiEndpoint, type CheckRecord } from '@/lib/api'
import { asArray } from '@/lib/utils'

type Filters = {
  endpointId: string
  status: '' | '200' | 'non200'
  startTime: string
  endTime: string
}

function resultVariant(isSuccess: boolean) {
  return isSuccess ? 'success' : 'warning'
}

function prettyBody(body: string | null) {
  if (!body) return ''
  try {
    return JSON.stringify(JSON.parse(body), null, 2)
  } catch {
    return body
  }
}

export function RecordsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialEndpointId = searchParams.get('endpointId') || ''
  
  const [endpoints, setEndpoints] = useState<ApiEndpoint[]>([])
  const [filters, setFilters] = useState<Filters>({ endpointId: initialEndpointId, status: '', startTime: '', endTime: '' })
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)

  const [records, setRecords] = useState<CheckRecord[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detail, setDetail] = useState<CheckRecord | null>(null)

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [pageSize, total])
  const hasNextPage = page < totalPages

  const loadEndpoints = useCallback(async () => {
    try {
      const data = await api.listEndpoints()
      setEndpoints(asArray(data))
    } catch {
      setEndpoints([])
    }
  }, [])

  const load = useCallback(async (nextPage: number) => {
    setLoading(true)
    setError('')
    try {
      const start_time = filters.startTime ? new Date(filters.startTime).toISOString() : null
      const end_time = filters.endTime ? new Date(filters.endTime).toISOString() : null
      const endpointId = filters.endpointId ? Number(filters.endpointId) : null
      const status = filters.status || null
      const data = await api.listRecords({
        endpoint_id: endpointId,
        status,
        start_time,
        end_time,
        page: nextPage,
        page_size: pageSize,
      })
      setRecords(asArray(data?.items))
      setTotal(typeof data?.total === 'number' ? data.total : 0)
      setPage(typeof data?.page === 'number' ? data.page : nextPage)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
      setRecords([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [filters, pageSize])

  async function openDetail(recordId: number) {
    setDetailOpen(true)
    setDetailLoading(true)
    setDetail(null)
    try {
      const data = await api.getRecord(recordId)
      setDetail(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载详情失败')
      setDetailOpen(false)
    } finally {
      setDetailLoading(false)
    }
  }

  async function exportCsv() {
    setError('')
    try {
      const start_time = filters.startTime ? new Date(filters.startTime).toISOString() : null
      const end_time = filters.endTime ? new Date(filters.endTime).toISOString() : null
      const endpointId = filters.endpointId ? Number(filters.endpointId) : null
      const status = filters.status || null
      const blob = await api.exportRecords({
        endpoint_id: endpointId,
        status,
        start_time,
        end_time,
      })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'check_records.csv'
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : '导出失败')
    }
  }

  useEffect(() => {
    loadEndpoints().catch(() => undefined)
    load(1).catch(() => undefined)
  }, [load, loadEndpoints])

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle>请求日志</CardTitle>
            <CardDescription>复用后端 /api/records，支持筛选、分页、详情与导出 CSV。</CardDescription>
          </div>
          <Button variant="outline" onClick={() => exportCsv().catch(() => undefined)}>
            导出 CSV
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <select
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              value={filters.endpointId}
              onChange={(event) => {
                const val = event.target.value
                setFilters((prev) => ({ ...prev, endpointId: val }))
                if (val) searchParams.set('endpointId', val)
                else searchParams.delete('endpointId')
                setSearchParams(searchParams, { replace: true })
              }}
            >
              <option value="">全部端点</option>
              {endpoints.map((endpoint) => (
                <option key={endpoint.id} value={String(endpoint.id)}>
                  {endpoint.name}
                </option>
              ))}
            </select>
            <Input
              placeholder="开始时间"
              type="datetime-local"
              value={filters.startTime}
              onChange={(event) => setFilters((prev) => ({ ...prev, startTime: event.target.value }))}
            />
            <Input
              placeholder="结束时间"
              type="datetime-local"
              value={filters.endTime}
              onChange={(event) => setFilters((prev) => ({ ...prev, endTime: event.target.value }))}
            />
            <select
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              value={filters.status}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, status: event.target.value as Filters['status'] }))
              }
            >
              <option value="">全部状态</option>
              <option value="200">200</option>
              <option value="non200">非200</option>
            </select>
            <Button disabled={loading} onClick={() => load(1).catch(() => undefined)}>
              查询
            </Button>
          </div>

          <div className="overflow-hidden rounded-xl border border-border/60">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">结果</th>
                  <th className="px-4 py-3 font-medium">端点</th>
                  <th className="px-4 py-3 font-medium">方法</th>
                  <th className="px-4 py-3 font-medium">状态码</th>
                  <th className="px-4 py-3 font-medium">耗时</th>
                  <th className="px-4 py-3 font-medium">检测时间</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr className="border-t border-border/60">
                    <td className="px-4 py-6 text-muted-foreground" colSpan={6}>
                      加载中...
                    </td>
                  </tr>
                ) : records.length ? (
                  records.map((record) => (
                    <tr
                      key={record.id}
                      className="border-t border-border/60 transition hover:bg-muted/20"
                      role="button"
                      tabIndex={0}
                      onClick={() => openDetail(record.id).catch(() => undefined)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          openDetail(record.id).catch(() => undefined)
                        }
                      }}
                    >
                      <td className="px-4 py-3">
                        <Badge variant={resultVariant(record.is_success)}>{record.is_success ? '成功' : '失败'}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="max-w-[420px]">
                          <p className="font-medium">{record.endpoint_name || `Endpoint #${record.endpoint_id}`}</p>
                          <p className="mt-1 truncate text-xs text-muted-foreground">{record.endpoint_url || ''}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{record.endpoint_method || '-'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{record.status_code ?? '-'}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {record.response_time_ms != null ? `${record.response_time_ms.toFixed(0)}ms` : '-'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(record.checked_at).toLocaleString()}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr className="border-t border-border/60">
                    <td className="px-4 py-6 text-muted-foreground" colSpan={6}>
                      暂无记录
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              第 {page} / {totalPages} 页，共 {total} 条
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={loading || page <= 1}
                onClick={() => load(page - 1).catch(() => undefined)}
              >
                上一页
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={loading || !hasNextPage}
                onClick={() => load(page + 1).catch(() => undefined)}
              >
                下一页
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {detailOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
          <div className="w-full max-w-4xl rounded-2xl border border-border/60 bg-card p-6 shadow-xl">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold">记录详情</h3>
                <p className="mt-1 text-sm text-muted-foreground">{detail ? `#${detail.id}` : ''}</p>
              </div>
              <Button variant="ghost" onClick={() => setDetailOpen(false)}>
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
                      <Badge variant={resultVariant(detail.is_success)}>{detail.is_success ? '成功' : '失败'}</Badge>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {detail.status_code ?? '-'} ·{' '}
                      {detail.response_time_ms != null ? `${detail.response_time_ms.toFixed(0)}ms` : '-'}
                    </p>
                  </div>
                </div>

                {detail.error_message ? (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
                    {detail.error_message}
                  </div>
                ) : null}

                <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                  <p className="text-xs text-muted-foreground">响应内容</p>
                  <pre className="mt-3 max-h-[420px] overflow-auto whitespace-pre-wrap break-words text-sm text-foreground">
                    {prettyBody(detail.response_body) || '无响应内容'}
                  </pre>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
