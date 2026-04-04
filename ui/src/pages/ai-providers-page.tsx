import { useEffect, useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { api, type AIProvider, type ProviderTestResponse } from '@/lib/api'
import { asArray } from '@/lib/utils'

const intervalOptions: Array<[number, string]> = [
  [30, '30s'],
  [60, '1m'],
  [300, '5m'],
  [600, '10m'],
  [1800, '30m'],
  [3600, '1h'],
]

type ProviderForm = {
  name: string
  provider_type: string
  base_url: string
  api_key: string
  model: string
  description: string
  stream: boolean
  monitor_interval_seconds: number
}

function statusVariant(status: string | null) {
  if (status === 'normal') return 'success'
  if (status === 'abnormal') return 'warning'
  return 'outline'
}

function formatInterval(seconds: number | null) {
  if (!seconds) return '-'
  const found = intervalOptions.find(([value]) => value === seconds)
  return found ? found[1] : `${seconds}s`
}

function toFormState(provider?: AIProvider | null): ProviderForm {
  return {
    name: provider?.name ?? '',
    provider_type: provider?.provider_type ?? 'openai',
    base_url: provider?.base_url ?? '',
    api_key: '',
    model: provider?.model ?? '',
    description: provider?.description ?? '',
    stream: provider?.stream ?? true,
    monitor_interval_seconds: provider?.monitor_interval_seconds ?? 300,
  }
}

export function AIProvidersPage() {
  const [providers, setProviders] = useState<AIProvider[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<ProviderForm>(() => toFormState(null))

  const modalTitle = useMemo(() => (editingId ? '编辑供应商' : '添加供应商'), [editingId])

  async function refresh() {
    setLoading(true)
    setError('')
    try {
      const data = await api.listAIProviders()
      setProviders(asArray(data))
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载供应商失败')
      setProviders([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh().catch(() => undefined)
  }, [])

  function openCreate() {
    setEditingId(null)
    setForm(toFormState(null))
    setMessage('')
    setModalOpen(true)
  }

  async function openEdit(providerId: number) {
    setEditingId(providerId)
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const provider = await api.getAIProvider(providerId)
      setForm(toFormState(provider))
      setModalOpen(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载供应商失败')
    } finally {
      setSaving(false)
    }
  }

  async function handleSave() {
    if (!form.name.trim()) {
      setError('请填写供应商名称')
      return
    }
    if (!form.provider_type.trim()) {
      setError('请选择供应商类型')
      return
    }
    if (!form.base_url.trim()) {
      setError('请填写 Base URL')
      return
    }
    if (!form.model.trim()) {
      setError('请填写模型')
      return
    }
    if (!editingId && !form.api_key.trim()) {
      setError('请填写 API Key')
      return
    }

    setSaving(true)
    setError('')
    try {
      if (editingId) {
        await api.updateAIProvider(editingId, {
          name: form.name.trim(),
          provider_type: form.provider_type.trim(),
          base_url: form.base_url.trim(),
          api_key: form.api_key.trim() || null,
          model: form.model.trim(),
          description: form.description.trim() || null,
          stream: form.stream,
          monitor_interval_seconds: form.monitor_interval_seconds,
        })
      } else {
        await api.createAIProvider({
          name: form.name.trim(),
          provider_type: form.provider_type.trim(),
          base_url: form.base_url.trim(),
          api_key: form.api_key.trim(),
          model: form.model.trim(),
          description: form.description.trim() || null,
          stream: form.stream,
          monitor_interval_seconds: form.monitor_interval_seconds,
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

  async function handleDelete(providerId: number) {
    if (!window.confirm('确认删除此供应商？关联的监控端点也将被删除。')) return
    setError('')
    setMessage('')
    try {
      await api.deleteAIProvider(providerId)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败')
    }
  }

  async function handleCopy(providerId: number) {
    if (!window.confirm('确认复制此供应商配置？')) return
    setError('')
    setMessage('')
    try {
      await api.copyAIProvider(providerId)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '复制失败')
    }
  }

  function formatTestResult(result: ProviderTestResponse) {
    const status = result.is_success ? '成功' : '失败'
    const parts = [
      `测试${status}`,
      `状态码：${result.status_code ?? '-'}`,
      `耗时：${result.response_time_ms != null ? `${result.response_time_ms.toFixed(0)}ms` : '-'}`,
    ]
    if (result.error_message) parts.push(`错误：${result.error_message}`)
    return parts.join(' · ')
  }

  async function handleTest(providerId: number) {
    setError('')
    setMessage('测试中...')
    try {
      const result = await api.testAIProvider(providerId)
      setMessage(formatTestResult(result))
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '测试失败')
      setMessage('')
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle>AI 供应商</CardTitle>
            <CardDescription>复用后端 /api/ai-providers，实现管理、复制与测试。</CardDescription>
          </div>
          <Button onClick={openCreate}>添加供应商</Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          ) : null}
          {message ? (
            <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
              {message}
            </div>
          ) : null}

          <div className="overflow-hidden rounded-xl border border-border/60">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">名称</th>
                  <th className="px-4 py-3 font-medium">类型</th>
                  <th className="px-4 py-3 font-medium">模型</th>
                  <th className="px-4 py-3 font-medium">Base URL</th>
                  <th className="px-4 py-3 font-medium">频率</th>
                  <th className="px-4 py-3 font-medium">Key</th>
                  <th className="px-4 py-3 font-medium">状态</th>
                  <th className="px-4 py-3 font-medium">最近检查</th>
                  <th className="px-4 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr className="border-t border-border/60">
                    <td className="px-4 py-6 text-muted-foreground" colSpan={9}>
                      加载中...
                    </td>
                  </tr>
                ) : providers.length ? (
                  providers.map((provider) => (
                    <tr key={provider.id} className="border-t border-border/60">
                      <td className="px-4 py-3 font-medium">{provider.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{provider.provider_type}</td>
                      <td className="px-4 py-3 text-muted-foreground">{provider.model}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <span className="block max-w-[260px] truncate">{provider.base_url}</span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{formatInterval(provider.monitor_interval_seconds)}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <code className="rounded bg-muted/30 px-2 py-1">{provider.masked_key}</code>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={statusVariant(provider.current_status)}>
                          {provider.current_status ?? 'unknown'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {provider.last_check_at ? new Date(provider.last_check_at).toLocaleString() : '-'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => openEdit(provider.id)}>
                            编辑
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleCopy(provider.id)}>
                            复制
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleTest(provider.id)}>
                            测试
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleDelete(provider.id)}>
                            删除
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr className="border-t border-border/60">
                    <td className="px-4 py-6 text-muted-foreground" colSpan={9}>
                      暂无供应商
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
                <Input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} />
              </label>

              <label className="space-y-2">
                <span className="text-sm text-muted-foreground">供应商类型</span>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  value={form.provider_type}
                  onChange={(event) => setForm((prev) => ({ ...prev, provider_type: event.target.value }))}
                >
                  <option value="openai">openai</option>
                  <option value="claude_code">claude_code</option>
                  <option value="azure_openai">azure_openai</option>
                  <option value="custom">custom</option>
                </select>
              </label>

              <label className="space-y-2 md:col-span-2">
                <span className="text-sm text-muted-foreground">Base URL</span>
                <Input
                  value={form.base_url}
                  onChange={(event) => setForm((prev) => ({ ...prev, base_url: event.target.value }))}
                  placeholder="https://api.openai.com"
                />
              </label>

              <label className="space-y-2 md:col-span-2">
                <span className="text-sm text-muted-foreground">API Key</span>
                <Input
                  type="password"
                  value={form.api_key}
                  onChange={(event) => setForm((prev) => ({ ...prev, api_key: event.target.value }))}
                  placeholder={editingId ? '留空则保留原密钥' : '输入 API Key'}
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm text-muted-foreground">模型</span>
                <Input value={form.model} onChange={(event) => setForm((prev) => ({ ...prev, model: event.target.value }))} />
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

              <label className="flex items-center gap-2 text-sm text-muted-foreground md:col-span-2">
                <input
                  className="size-4"
                  type="checkbox"
                  checked={form.stream}
                  onChange={(event) => setForm((prev) => ({ ...prev, stream: event.target.checked }))}
                />
                启用 Stream (流式请求)
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
