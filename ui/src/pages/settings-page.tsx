import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

export function SettingsPage() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>系统设置</CardTitle>
          <CardDescription>集中管理系统名称、监控参数和默认行为配置。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 xl:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Input placeholder="系统名称" />
              <Input placeholder="默认监控频率" />
              <Input placeholder="告警阈值" />
              <Input placeholder="默认分页大小" />
            </div>
            <div className="flex gap-2">
              <Button>保存设置</Button>
              <Button variant="outline">恢复默认</Button>
            </div>
          </div>

          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="text-base">状态</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                <span className="text-sm">Tailwind 主题变量</span>
                <Badge variant="success">已接入</Badge>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                <span className="text-sm">路由壳层</span>
                <Badge variant="success">已完成</Badge>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                <span className="text-sm">真实设置接口</span>
                <Badge variant="outline">待接入</Badge>
              </div>
            </CardContent>
          </Card>
        </CardContent>
      </Card>
    </div>
  )
}
