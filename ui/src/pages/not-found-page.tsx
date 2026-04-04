import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>页面不存在</CardTitle>
          <CardDescription>当前路由还未实现，或者你访问了一个不存在的地址。</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-3">
          <Button asChild>
            <Link to="/">返回仪表盘</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/login">返回登录页</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
