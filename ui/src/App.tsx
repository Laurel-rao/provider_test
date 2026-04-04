import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'

import { AppShell } from '@/components/app-shell'
import { RouteGuard } from '@/components/route-guard'
import { AIDashboardPage } from '@/pages/ai-dashboard-page'
import { AlertsPage } from '@/pages/alerts-page'
import { AIProvidersPage } from '@/pages/ai-providers-page'
import { EndpointsPage } from '@/pages/endpoints-page'
import { LoginPage } from '@/pages/login-page'
import { LogsPage } from '@/pages/logs-page'
import { NotFoundPage } from '@/pages/not-found-page'
import { RecordsPage } from '@/pages/records-page'
import { SettingsPage } from '@/pages/settings-page'

const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    element: <RouteGuard />,
    children: [
      {
        element: <AppShell />,
        children: [
          {
            path: '/',
            element: <Navigate replace to="/ai-dashboard" />,
          },
          {
            path: '/ai-dashboard',
            element: <AIDashboardPage />,
          },
          {
            path: '/records',
            element: <RecordsPage />,
          },
          {
            path: '/endpoints',
            element: <EndpointsPage />,
          },
          {
            path: '/logs',
            element: <LogsPage />,
          },
          {
            path: '/ai-providers',
            element: <AIProvidersPage />,
          },
          {
            path: '/alerts',
            element: <AlertsPage />,
          },
          {
            path: '/settings',
            element: <SettingsPage />,
          },
        ],
      },
    ],
  },
  {
    path: '*',
    element: <NotFoundPage />,
  },
  {
    path: '/home',
    element: <Navigate replace to="/ai-dashboard" />,
  },
])

function App() {
  return <RouterProvider router={router} />
}

export default App
