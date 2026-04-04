import { useEffect, useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { api, type ApiEndpoint } from '@/lib/api'
import { asArray } from '@/lib/utils'

const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD'] as const
const intervalOptions: Array<[number, string]> = [
  [30, '30s'],
  [60, '1m'],
  [300, '5m'],
  [600, '10m'],
  [1800, '30m'],
  [3600, '1h'],
]

type EndpointFormState = {
  name: string
  url: string
  method: string
  expected_status_code: number
  monitor_interval_seconds: number
  headers_json: string
  request_body_json: string
  expected_response_text: string
  description: string
}

function formatInterval(seconds: number) {
  const found = intervalOptions.find(([value]) => value === seconds)
  return found ? found[1] : `${seconds}s`
}

function badgeVariant(status: string) {
  if (status === 'normal') return 'success'
  if (status === 'abnormal') return 'warning'
  return 'outline'
}

function toFormState(endpoint?: ApiEndpoint | null): EndpointFormState {
  return {
    name: endpoint?.name ?? '',
    url: endpoint?.url ?? '',
    method: endpoint?.method ?? 'GET',
    expected_status_code: endpoint?.expected_status_code ?? 200,
    monitor_interval_seconds: endpoint?.monitor_interval_seconds ?? 300,
    headers_json: endpoint?.headers_json ?? '',
    request_body_json: endpoint?.request_body_json ?? '',
    expected_response_text: endpoint?.expected_response_text ?? '',
    description: endpoint?.description ?? '',
  }
}

export function EndpointsPage() {
  const [endpoints, setEndpoints] = useState<ApiEndpoint[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<EndpointFormState>(() => toFormState(null))
  const [saving, setSaving] = useState(false)

  const modalTitle = useMemo(() => (editingId ? '编辑端点' : '添加端点'), [editingId])

  async function refresh() {
    setLoading(true)
    setError('')
    try {
      const data = await api.listEndpoints()
      setEndpoints(asArray(data))
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载端点失败')
      setEndpoints([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh().catch(() => undefined)
  }, [])

  async function openCreate() {
    setEditingId(null)
    setForm(toFormState(null))
    setModalOpen(true)
  }

  async function openEdit(endpointId: number) {
    setEditingId(endpointId)
    setSaving(true)
    setError('')
    try {
      const endpoint = await api.getEndpoint(endpointId)
      setForm(toFormState(endpoint))
      setModalOpen(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载端点失败')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(endpointId: number) {
    if (!window.confirm('确认删除此端点？')) return
    setError('')
    try {
      await api.deleteEndpoint(endpointId)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败')
    }
  }

  async function handleSave() {
    if (!form.name.trim()) {
      setError('请填写端点名称')
      return
    }
    if (!form.url.trim()) {
      setError('请填写 URL')
      return
    }

    setSaving(true)
    setError('')
    try {
      if (editingId) {
        await api.updateEndpoint(editingId, {
          name: form.name.trim(),
          url: form.url.trim(),
          method: form.method,
          expected_status_code: form.expected_status_code,
          monitor_interval_seconds: form.monitor_interval_seconds,
          headers_json: form.headers_json.trim() || null,
          request_body_json: form.request_body_json.trim() || null,
          expected_response_text: form.expected_response_text.trim() || null,
          description: form.description.trim() || null,
        })
      } else {
        await api.createEndpoint({
          name: form.name.trim(),
          url: form.url.trim(),
          method: form.method,
          expected_status_code: form.expected_status_code,
          monitor_interval_seconds: form.monitor_interval_seconds,
          headers_json: form.headers_json.trim() || null,
          request_body_json: form.request_body_json.trim() || null,
          expected_response_text: form.expected_response_text.trim() || null,
          description: form.description.trim() || null,
        })
      }
      setModalOpen(false)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle>端点管理</CardTitle>
            <CardDescription>复用后端 /api/endpoints，实现列表、添加、编辑与删除。</CardDescription>
          </div>
          <Button onClick={openCreate}>添加端点</Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          ) : null}

          <div className="overflow-hidden rounded-xl border border-border/60">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">名称</th>
                  <th className="px-4 py-3 font-medium">URL</th>
                  <th className="px-4 py-3 font-medium">方法</th>
                  <th className="px-4 py-3 font-medium">频率</th>
                  <th className="px-4 py-3 font-medium">状态</th>
                  <th className="px-4 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr className="border-t border-border/60">
                    <td className="px-4 py-6 text-muted-foreground" colSpan={6}>
                      加载中...
                    </td>
                  </tr>
                ) : endpoints.length ? (
                  endpoints.map((endpoint) => (
                    <tr key={endpoint.id} className="border-t border-border/60">
                      <td className="px-4 py-3 font-medium">{endpoint.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <span className="block max-w-[360px] truncate">{endpoint.url}</span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{endpoint.method}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatInterval(endpoint.monitor_interval_seconds)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={badgeVariant(endpoint.current_status)}>{endpoint.current_status}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => openEdit(endpoint.id)}>
                            编辑
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleDelete(endpoint.id)}>
                            删除
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr className="border-t border-border/60">
                    <td className="px-4 py-6 text-muted-foreground" colSpan={6}>
                      暂无端点
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
          <div className="w-full max-w-2xl rounded-2xl border border-border/60 bg-card p-6 shadow-xl">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-lg font-semibold">{modalTitle}</h3>
              <Button variant="ghost" onClick={() => setModalOpen(false)}>
                关闭
              </Button>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm text-muted-foreground">名称</span>
                <Input
                  value={form.name}
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm text-muted-foreground">URL</span>
                <Input
                  value={form.url}
                  onChange={(event) => setForm((prev) => ({ ...prev, url: event.target.value }))}
                  placeholder="https://example.com/health"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm text-muted-foreground">方法</span>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  value={form.method}
                  onChange={(event) => setForm((prev) => ({ ...prev, method: event.target.value }))}
                >
                  {methods.map((method) => (
                    <option key={method} value={method}>
                      {method}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-sm text-muted-foreground">期望状态码</span>
                <Input
                  type="number"
                  value={String(form.expected_status_code)}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      expected_status_code: Number(event.target.value || 0),
                    }))
                  }
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm text-muted-foreground">监控频率</span>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  value={String(form.monitor_interval_seconds)}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, monitor_interval_seconds: Number(event.target.value || 300) }))
                  }
                >
                  {intervalOptions.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2 md:col-span-2">
                <span className="text-sm text-muted-foreground">请求头 (JSON)</span>
                <textarea
                  className="flex min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  value={form.headers_json}
                  onChange={(event) => setForm((prev) => ({ ...prev, headers_json: event.target.value }))}
                  placeholder='{"Authorization":"Bearer xxx"}'
                />
              </label>

              <label className="space-y-2 md:col-span-2">
                <span className="text-sm text-muted-foreground">请求体 (JSON)</span>
                <textarea
                  className="flex min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  value={form.request_body_json}
                  onChange={(event) => setForm((prev) => ({ ...prev, request_body_json: event.target.value }))}
                />
              </label>

              <label className="space-y-2 md:col-span-2">
                <span className="text-sm text-muted-foreground">期望响应文本</span>
                <Input
                  value={form.expected_response_text}
                  onChange={(event) => setForm((prev) => ({ ...prev, expected_response_text: event.target.value }))}
                />
              </label>

              <label className="space-y-2 md:col-span-2">
                <span className="text-sm text-muted-foreground">备注</span>
                <Input
                  value={form.description}
                  onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                />
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setModalOpen(false)}>
                取消
              </Button>
              <Button disabled={saving} onClick={handleSave}>
                {saving ? '保存中...' : '保存'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
