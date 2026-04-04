import { useEffect, useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { api, type Alert, type AlertRule } from '@/lib/api'
import { asArray } from '@/lib/utils'

type RuleForm = {
  endpointId: string
  ruleType: string
  thresholdValue: string
  isActive: boolean
}

function ruleTypeLabel(ruleType: string) {
  if (ruleType === 'consecutive_failures') return '连续失败次数'
  if (ruleType === 'response_time') return '响应时间阈值(ms)'
  return ruleType
}

function statusLabel(status: string) {
  if (status === 'open') return '未处理'
  if (status === 'acknowledged') return '已确认'
  if (status === 'resolved') return '已解决'
  return status
}

function statusVariant(status: string) {
  if (status === 'resolved') return 'success'
  if (status === 'open') return 'warning'
  return 'secondary'
}

export function AlertsPage() {
  const [rules, setRules] = useState<AlertRule[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [ruleForm, setRuleForm] = useState<RuleForm>({
    endpointId: '',
    ruleType: 'consecutive_failures',
    thresholdValue: '',
    isActive: true,
  })

  const openAlerts = useMemo(() => alerts.filter((item) => item.status !== 'resolved').length, [alerts])

  async function refresh() {
    setLoading(true)
    setError('')
    try {
      const [ruleList, alertList] = await Promise.all([api.listAlertRules(), api.listAlerts()])
      setRules(asArray(ruleList))
      setAlerts(asArray(alertList))
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载告警失败')
      setRules([])
      setAlerts([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh().catch(() => undefined)
  }, [])

  async function handleCreateRule() {
    const endpointId = Number(ruleForm.endpointId)
    const thresholdValue = Number(ruleForm.thresholdValue)

    if (!endpointId) {
      setError('请填写端点 ID')
      return
    }
    if (!ruleForm.ruleType.trim()) {
      setError('请选择规则类型')
      return
    }
    if (!thresholdValue) {
      setError('请填写阈值')
      return
    }

    setSaving(true)
    setError('')
    try {
      await api.createAlertRule({
        endpoint_id: endpointId,
        rule_type: ruleForm.ruleType,
        threshold_value: thresholdValue,
        is_active: ruleForm.isActive,
      })
      setModalOpen(false)
      setRuleForm({ endpointId: '', ruleType: 'consecutive_failures', thresholdValue: '', isActive: true })
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建规则失败')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteRule(ruleId: number) {
    if (!window.confirm('确认删除此告警规则？')) return
    setError('')
    try {
      await api.deleteAlertRule(ruleId)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除规则失败')
    }
  }

  async function handleUpdateAlertStatus(alert: Alert) {
    const nextStatus = alert.status === 'open' ? 'acknowledged' : 'resolved'
    setError('')
    try {
      await api.updateAlertStatus(alert.id, { status: nextStatus })
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新状态失败')
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle>告警中心</CardTitle>
            <CardDescription>规则与告警记录复用后端 /api/alerts。</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={openAlerts ? 'warning' : 'success'}>{openAlerts ? `未处理 ${openAlerts}` : '全部已处理'}</Badge>
            <Button onClick={() => setModalOpen(true)}>添加规则</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          ) : null}

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">告警规则</h3>
              <span className="text-sm text-muted-foreground">{rules.length} 条</span>
            </div>
            <div className="overflow-hidden rounded-xl border border-border/60">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">端点 ID</th>
                    <th className="px-4 py-3 font-medium">类型</th>
                    <th className="px-4 py-3 font-medium">阈值</th>
                    <th className="px-4 py-3 font-medium">启用</th>
                    <th className="px-4 py-3 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr className="border-t border-border/60">
                      <td className="px-4 py-6 text-muted-foreground" colSpan={5}>
                        加载中...
                      </td>
                    </tr>
                  ) : rules.length ? (
                    rules.map((rule) => (
                      <tr key={rule.id} className="border-t border-border/60">
                        <td className="px-4 py-3 text-muted-foreground">{rule.endpoint_id}</td>
                        <td className="px-4 py-3 text-muted-foreground">{ruleTypeLabel(rule.rule_type)}</td>
                        <td className="px-4 py-3 text-muted-foreground">{rule.threshold_value}</td>
                        <td className="px-4 py-3">
                          <Badge variant={rule.is_active ? 'success' : 'outline'}>{rule.is_active ? '是' : '否'}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Button size="sm" variant="ghost" onClick={() => handleDeleteRule(rule.id)}>
                            删除
                          </Button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr className="border-t border-border/60">
                      <td className="px-4 py-6 text-muted-foreground" colSpan={5}>
                        暂无规则
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">告警记录</h3>
              <span className="text-sm text-muted-foreground">{alerts.length} 条</span>
            </div>
            <div className="overflow-hidden rounded-xl border border-border/60">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">时间</th>
                    <th className="px-4 py-3 font-medium">端点 ID</th>
                    <th className="px-4 py-3 font-medium">触发条件</th>
                    <th className="px-4 py-3 font-medium">状态</th>
                    <th className="px-4 py-3 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr className="border-t border-border/60">
                      <td className="px-4 py-6 text-muted-foreground" colSpan={5}>
                        加载中...
                      </td>
                    </tr>
                  ) : alerts.length ? (
                    alerts.map((alert) => (
                      <tr key={alert.id} className="border-t border-border/60">
                        <td className="px-4 py-3 text-muted-foreground">{new Date(alert.triggered_at).toLocaleString()}</td>
                        <td className="px-4 py-3 text-muted-foreground">{alert.endpoint_id}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          <span className="block max-w-[520px] truncate">{alert.trigger_condition}</span>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={statusVariant(alert.status)}>{statusLabel(alert.status)}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          {alert.status !== 'resolved' ? (
                            <Button size="sm" variant="outline" onClick={() => handleUpdateAlertStatus(alert)}>
                              {alert.status === 'open' ? '确认' : '解决'}
                            </Button>
                          ) : (
                            <span className="text-sm text-muted-foreground">-</span>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr className="border-t border-border/60">
                      <td className="px-4 py-6 text-muted-foreground" colSpan={5}>
                        暂无告警
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </CardContent>
      </Card>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
          <div className="w-full max-w-xl rounded-2xl border border-border/60 bg-card p-6 shadow-xl">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-lg font-semibold">添加告警规则</h3>
              <Button variant="ghost" onClick={() => setModalOpen(false)}>
                关闭
              </Button>
            </div>

            <div className="mt-6 space-y-4">
              <label className="block space-y-2">
                <span className="text-sm text-muted-foreground">端点 ID</span>
                <Input
                  type="number"
                  value={ruleForm.endpointId}
                  onChange={(event) => setRuleForm((prev) => ({ ...prev, endpointId: event.target.value }))}
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm text-muted-foreground">规则类型</span>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  value={ruleForm.ruleType}
                  onChange={(event) => setRuleForm((prev) => ({ ...prev, ruleType: event.target.value }))}
                >
                  <option value="consecutive_failures">连续失败次数</option>
                  <option value="response_time">响应时间阈值(ms)</option>
                </select>
              </label>

              <label className="block space-y-2">
                <span className="text-sm text-muted-foreground">阈值</span>
                <Input
                  type="number"
                  value={ruleForm.thresholdValue}
                  onChange={(event) => setRuleForm((prev) => ({ ...prev, thresholdValue: event.target.value }))}
                />
              </label>

              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  className="size-4"
                  type="checkbox"
                  checked={ruleForm.isActive}
                  onChange={(event) => setRuleForm((prev) => ({ ...prev, isActive: event.target.checked }))}
                />
                启用规则
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setModalOpen(false)}>
                取消
              </Button>
              <Button disabled={saving} onClick={handleCreateRule}>
                {saving ? '保存中...' : '保存'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
