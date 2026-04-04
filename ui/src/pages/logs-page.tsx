import { useCallback, useEffect, useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { api, type ErrorLog, type PaginatedResponse } from '@/lib/api'

type Filters = {
  endpointId: string
  errorType: string
  startTime: string
  endTime: string
}

function badgeVariant(httpStatus: number | null) {
  if (httpStatus == null) return 'outline'
  if (httpStatus >= 500) return 'warning'
  return 'secondary'
}

export function LogsPage() {
  const [filters, setFilters] = useState<Filters>({
    endpointId: '',
    errorType: '',
    startTime: '',
    endTime: '',
  })
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState<PaginatedResponse<ErrorLog> | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [selectedLog, setSelectedLog] = useState<ErrorLog | null>(null)

  const totalPages = useMemo(() => {
    const total = data?.total ?? 0
    const size = data?.page_size ?? pageSize
    return Math.max(1, Math.ceil(total / size))
  }, [data, pageSize])

  const load = useCallback(async (nextPage: number) => {
    setLoading(true)
    setError('')
    try {
      const start_time = filters.startTime ? new Date(filters.startTime).toISOString() : null
      const end_time = filters.endTime ? new Date(filters.endTime).toISOString() : null
      const endpointId = filters.endpointId ? Number(filters.endpointId) : null
      const errorType = filters.errorType.trim() || null
      const result = await api.listLogs({
        endpoint_id: endpointId,
        error_type: errorType,
        start_time,
        end_time,
        page: nextPage,
        page_size: pageSize,
      })
      setData(result)
      setPage(result.page)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [filters, pageSize])

  useEffect(() => {
    load(1).catch(() => undefined)
  }, [load])

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>错误日志</CardTitle>
          <CardDescription>复用后端 /api/logs，支持筛选与分页。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <Input
              placeholder="端点 ID（可选）"
              type="number"
              value={filters.endpointId}
              onChange={(event) => setFilters((prev) => ({ ...prev, endpointId: event.target.value }))}
            />
            <Input
              placeholder="错误类型（可选）"
              value={filters.errorType}
              onChange={(event) => setFilters((prev) => ({ ...prev, errorType: event.target.value }))}
            />
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
            <Button
              disabled={loading}
              onClick={() => {
                load(1).catch(() => undefined)
              }}
            >
              查询
            </Button>
          </div>

          <div className="overflow-hidden rounded-xl border border-border/60">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">时间</th>
                  <th className="px-4 py-3 font-medium">模块</th>
                  <th className="px-4 py-3 font-medium">类型</th>
                  <th className="px-4 py-3 font-medium">消息</th>
                  <th className="px-4 py-3 font-medium">HTTP</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr className="border-t border-border/60">
                    <td className="px-4 py-6 text-muted-foreground" colSpan={5}>
                      加载中...
                    </td>
                  </tr>
                ) : data?.items?.length ? (
                  data.items.map((log) => (
                    <tr
                      key={log.id}
                      className="cursor-pointer border-t border-border/60 transition-colors hover:bg-muted/20"
                      onClick={() => {
                        setSelectedLog(log)
                        setDetailOpen(true)
                      }}
                    >
                      <td className="px-4 py-3 text-muted-foreground">{new Date(log.created_at).toLocaleString()}</td>
                      <td className="px-4 py-3 text-muted-foreground">{log.module_name}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline">{log.error_type}</Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <span className="block max-w-[520px] truncate">{log.error_message}</span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={badgeVariant(log.http_status_code)}>
                          {log.http_status_code == null ? '-' : String(log.http_status_code)}
                        </Badge>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr className="border-t border-border/60">
                    <td className="px-4 py-6 text-muted-foreground" colSpan={5}>
                      暂无日志
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              第 {page} / {totalPages} 页，共 {data?.total ?? 0} 条
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
                disabled={loading || page >= totalPages}
                onClick={() => load(page + 1).catch(() => undefined)}
              >
                下一页
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {detailOpen && selectedLog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
          <div className="w-full max-w-3xl rounded-2xl border border-border/60 bg-card p-6 shadow-xl">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <h3 className="text-lg font-semibold">日志详情</h3>
                <p className="text-sm text-muted-foreground">ID: {selectedLog.id}</p>
              </div>
              <Button
                variant="ghost"
                onClick={() => {
                  setDetailOpen(false)
                  setSelectedLog(null)
                }}
              >
                关闭
              </Button>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="space-y-1 rounded-xl border border-border/60 bg-muted/10 p-4">
                <p className="text-sm text-muted-foreground">时间</p>
                <p className="text-sm">{new Date(selectedLog.created_at).toLocaleString()}</p>
              </div>

              <div className="space-y-1 rounded-xl border border-border/60 bg-muted/10 p-4">
                <p className="text-sm text-muted-foreground">HTTP 状态码</p>
                <p className="text-sm">{selectedLog.http_status_code == null ? '-' : String(selectedLog.http_status_code)}</p>
              </div>

              <div className="space-y-1 rounded-xl border border-border/60 bg-muted/10 p-4">
                <p className="text-sm text-muted-foreground">模块</p>
                <p className="text-sm">{selectedLog.module_name}</p>
              </div>

              <div className="space-y-1 rounded-xl border border-border/60 bg-muted/10 p-4">
                <p className="text-sm text-muted-foreground">端点 ID</p>
                <p className="text-sm">{selectedLog.endpoint_id == null ? '-' : String(selectedLog.endpoint_id)}</p>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">错误类型</p>
                <Badge variant="outline">{selectedLog.error_type}</Badge>
              </div>

              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">错误消息</p>
                <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-border/60 bg-muted/10 p-4 text-sm text-foreground">
                  {selectedLog.error_message || '-'}
                </pre>
              </div>

              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">堆栈</p>
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-border/60 bg-muted/10 p-4 text-sm text-muted-foreground">
                  {selectedLog.stack_trace || '-'}
                </pre>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
