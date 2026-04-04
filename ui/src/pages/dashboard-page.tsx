import { useEffect, useMemo, useState } from 'react'
import { Activity, Bot, CircleAlert, Database, ShieldCheck } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { api, type CurrentUser } from '@/lib/api'
import { asArray } from '@/lib/utils'

const modules = [
  ['监控总览', '集中查看端点、告警、供应商和请求状态'],
  ['统一导航', '侧边栏、页头、搜索框与业务模块统一入口'],
  ['通用组件', 'Button / Card / Input / Badge 等界面组件已可复用'],
  ['业务接口', '已接入登录、端点、日志、告警、AI 供应商等核心 API'],
]

export function DashboardPage() {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [endpointCount, setEndpointCount] = useState<number | null>(null)
  const [providerCount, setProviderCount] = useState<number | null>(null)
  const [openAlertCount, setOpenAlertCount] = useState<number | null>(null)

  useEffect(() => {
    api.getCurrentUser().then(setUser).catch(() => undefined)

    Promise.all([api.listEndpoints(), api.listAIProviders(), api.listAlerts()])
      .then(([endpoints, providers, alerts]) => {
        const endpointList = asArray(endpoints)
        const providerList = asArray(providers)
        const alertList = asArray(alerts)
        setEndpointCount(endpointList.length)
        setProviderCount(providerList.length)
        setOpenAlertCount(alertList.filter((alert) => alert.status !== 'resolved').length)
      })
      .catch(() => undefined)
  }, [])

  const summaryCards = useMemo(
    () => [
      {
        title: '监控端点',
        value: endpointCount == null ? '-' : String(endpointCount),
        hint: '来自 /api/endpoints',
        icon: Activity,
      },
      {
        title: '今日请求',
        value: '-',
        hint: '后续接统计接口',
        icon: Database,
      },
      {
        title: '未处理告警',
        value: openAlertCount == null ? '-' : String(openAlertCount),
        hint: '来自 /api/alerts',
        icon: CircleAlert,
      },
      {
        title: 'AI 供应商',
        value: providerCount == null ? '-' : String(providerCount),
        hint: '来自 /api/ai-providers',
        icon: Bot,
      },
    ],
    [endpointCount, openAlertCount, providerCount],
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">欢迎回来</p>
          <h3 className="text-2xl font-semibold">
            {user ? `${user.username}，查看当前系统概览` : '查看当前系统概览'}
          </h3>
        </div>
        <Badge variant="success">
          <ShieldCheck className="mr-1 size-3.5" />
          系统运行中
        </Badge>
      </div>

      <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
        {summaryCards.map((card) => {
          const Icon = card.icon

          return (
            <Card key={card.title}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardDescription>{card.title}</CardDescription>
                  <div className="rounded-md bg-primary/10 p-2 text-primary">
                    <Icon className="size-4" />
                  </div>
                </div>
                <CardTitle className="text-3xl">{card.value}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{card.hint}</p>
              </CardContent>
            </Card>
          )
        })}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>当前能力</CardTitle>
            <CardDescription>概览当前控制台已具备的核心能力。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {modules.map(([title, desc]) => (
              <div key={title} className="rounded-xl border border-border/60 bg-card/60 p-4">
                <p className="font-medium">{title}</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{desc}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>常用入口</CardTitle>
            <CardDescription>从高频模块快速进入日常运维与排查场景。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div className="rounded-lg border border-border/60 p-4">
              <p className="font-medium text-foreground">1. AI 仪表盘</p>
              <p className="mt-1">查看供应商健康度、探针点分布、可用率与最近请求。</p>
            </div>
            <div className="rounded-lg border border-border/60 p-4">
              <p className="font-medium text-foreground">2. 请求日志</p>
              <p className="mt-1">查看响应时间、状态码、错误信息和响应详情。</p>
            </div>
            <div className="rounded-lg border border-border/60 p-4">
              <p className="font-medium text-foreground">3. 告警中心</p>
              <p className="mt-1">管理规则、跟踪触发记录并处理未解决告警。</p>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
