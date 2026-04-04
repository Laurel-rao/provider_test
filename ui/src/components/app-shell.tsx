import {
  Activity,
  Bell,
  Bot,
  FileCode2,
  LogOut,
  Settings,
  Shield,
  type LucideIcon,
} from 'lucide-react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { clearToken } from '@/lib/auth'
import { cn } from '@/lib/utils'

const navItems: Array<{ to: string; label: string; icon: LucideIcon; end?: boolean }> = [
  { to: '/ai-dashboard', label: 'AI 仪表盘', icon: Activity },
  { to: '/ai-providers', label: 'AI 供应商', icon: Bot },
  { to: '/records', label: '请求日志', icon: Shield },
  { to: '/logs', label: '错误日志', icon: FileCode2 },
  { to: '/alerts', label: '告警中心', icon: Bell },
  { to: '/settings', label: '系统设置', icon: Settings },
]

export function AppShell() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen w-full">
        <aside className="hidden w-56 flex-col border-r border-border/60 bg-sidebar/95 px-4 py-5 xl:flex">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Activity className="size-4" />
            </div>
            <div>
              <h1 className="text-base font-semibold">Monitor</h1>
            </div>
          </div>

          <div className="mt-6 flex-1 space-y-1.5">
            {navItems.map((item) => {
              const Icon = item.icon

              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(
                      'flex w-full items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-left text-sm transition',
                      isActive
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                    )
                  }
                >
                  <Icon className="size-4" />
                  <span>{item.label}</span>
                </NavLink>
              )
            })}
          </div>

          <Button
            size="sm"
            variant="ghost"
            className="mt-4 justify-start px-3.5"
            onClick={() => {
              clearToken()
              navigate('/login')
            }}
          >
            <LogOut className="size-4" />
            退出
          </Button>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex-1 px-5 py-4">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
