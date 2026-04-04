import { type FormEvent, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Blocks, LockKeyhole, UserRound } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'
import { setToken } from '@/lib/auth'

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError('')

    try {
      const result = await api.login({ username, password })
      setToken(result.access_token)
      const from = (location.state as { from?: string } | null)?.from || '/'
      navigate(from, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <div className="grid w-full max-w-5xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/20 via-background to-background p-8">
          <div className="flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/20 text-primary">
              <Blocks className="size-6" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">管理控制台</p>
              <h1 className="text-2xl font-semibold">API Monitor</h1>
            </div>
          </div>
          <div className="mt-10 space-y-5">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-primary">MONITOR</p>
              <h2 className="mt-3 text-4xl font-semibold leading-tight">统一管理接口监控、告警与 AI 服务状态</h2>
            </div>
            <p className="max-w-xl text-base leading-7 text-muted-foreground">
              登录后可查看监控概览、请求日志、错误日志、告警规则、端点配置与 AI 供应商状态。
            </p>
            <div className="grid gap-4 md:grid-cols-3">
              {[
                ['实时监控', '集中查看接口健康度、延迟与状态变化'],
                ['统一配置', '集中管理端点、密钥与 AI 供应商'],
                ['告警处置', '快速查看规则、记录与处理状态'],
              ].map(([title, desc]) => (
                <div key={title} className="rounded-2xl border border-border/60 bg-card/60 p-4">
                  <p className="font-medium">{title}</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <Card className="self-center">
          <CardHeader>
            <CardTitle>登录控制台</CardTitle>
            <CardDescription>使用现有系统账号登录并进入监控管理后台。</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <label className="block space-y-2">
                <span className="text-sm text-muted-foreground">账号</span>
                <div className="relative">
                  <UserRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="请输入管理员账号"
                  />
                </div>
              </label>

              <label className="block space-y-2">
                <span className="text-sm text-muted-foreground">密码</span>
                <div className="relative">
                  <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="请输入密码"
                  />
                </div>
              </label>

              {error ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-red-300">
                  {error}
                </div>
              ) : null}

              <Button className="w-full" disabled={loading} type="submit">
                {loading ? '登录中...' : '进入控制台'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
