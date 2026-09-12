import { useState } from 'react'
import { useAuth } from './contexts/AuthContext'
import { ActivityFeed } from './components/ActivityFeed'
import { NotificationsDropdown } from './components/NotificationsDropdown'
import { AdminDashboard, PMDashboard, DeveloperDashboard } from './components/Dashboards'

// ─────────────────────────────────────────────
// Pages (stub routing — expand with react-router-dom)
// ─────────────────────────────────────────────

function LoginPage() {
  const { login, signup, isLoading } = useAuth()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      if (mode === 'login') {
        await login(email, password)
      } else {
        await signup(email, password, 'DEVELOPER')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      {/* Gradient background blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-32 h-96 w-96 rounded-full bg-brand-600/20 blur-3xl" />
        <div className="absolute -bottom-40 -right-32 h-96 w-96 rounded-full bg-brand-500/15 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 shadow-[0_0_32px_rgba(99,102,241,0.4)]">
            <svg className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-text-primary">Client Project Dashboard</h1>
          <p className="mt-1 text-sm text-text-secondary">Manage projects, tasks, and teams</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-surface-3 bg-surface-1 p-8 shadow-[0_4px_24px_rgba(0,0,0,.35)]">
          {/* Tabs */}
          <div className="mb-6 flex rounded-xl bg-surface-0 p-1">
            {(['login', 'signup'] as const).map((m) => (
              <button
                key={m}
                id={`tab-${m}`}
                onClick={() => { setMode(m); setError('') }}
                className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all duration-200 ${
                  mode === m
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {m === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          <form id="auth-form" onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-text-secondary">
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-surface-3 bg-surface-2 px-4 py-2.5 text-sm text-text-primary placeholder-text-muted transition focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                placeholder="you@company.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-text-secondary">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-surface-3 bg-surface-2 px-4 py-2.5 text-sm text-text-primary placeholder-text-muted transition focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                placeholder={mode === 'signup' ? 'Min. 8 characters' : '••••••••'}
              />
            </div>

            {error && (
              <div id="auth-error" className="rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">
                {error}
              </div>
            )}

            <button
              id="auth-submit"
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <Spinner size="sm" /> {mode === 'login' ? 'Signing in…' : 'Creating account…'}
                </span>
              ) : (
                mode === 'login' ? 'Sign In' : 'Create Account'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

function DashboardPage() {
  const { user, logout } = useAuth()

  const roleBadgeClass = {
    ADMIN: 'bg-danger/20 text-danger',
    PM: 'bg-warning/20 text-warning',
    DEVELOPER: 'bg-success/20 text-success',
  }[user!.role]

  return (
    <div className="min-h-screen bg-surface-0">
      {/* Topbar */}
      <header className="flex items-center justify-between border-b border-surface-2 bg-surface-1 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600">
            <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <span className="font-semibold text-text-primary">CPDashboard</span>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-text-secondary">{user?.email}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${roleBadgeClass}`}>
              {user?.role}
            </span>
          </div>
          <NotificationsDropdown />
          <button
            id="logout-btn"
            onClick={logout}
            className="rounded-lg bg-surface-2 px-3 py-1.5 text-sm text-text-secondary transition hover:bg-surface-3 hover:text-text-primary"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-7xl p-6 space-y-8">
        <div>
          <h2 className="mb-6 text-xl font-bold text-text-primary">Dashboard</h2>
          {user!.role === 'ADMIN' && <AdminDashboard />}
          {user!.role === 'PM' && <PMDashboard />}
          {user!.role === 'DEVELOPER' && <DeveloperDashboard />}
        </div>
        
        {/* Activity Feed */}
        <ActivityFeed />
      </main>
    </div>
  )
}

// ─────────────────────────────────────────────
// Shared components
// ─────────────────────────────────────────────

function Spinner({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const cls = size === 'sm' ? 'h-4 w-4' : 'h-8 w-8'
  return (
    <svg className={`${cls} animate-spin text-brand-400`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

// ─────────────────────────────────────────────
// App — simple auth gate (replace with react-router)
// ─────────────────────────────────────────────

export default function App() {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-0">
        <Spinner />
      </div>
    )
  }

  return user ? <DashboardPage /> : <LoginPage />
}
