import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react'

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type UserRole = 'ADMIN' | 'PM' | 'DEVELOPER'

export interface AuthUser {
  id: string
  email: string
  role: UserRole
}

interface AuthState {
  user: AuthUser | null
  accessToken: string | null
  isLoading: boolean
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>
  signup: (email: string, password: string, role?: UserRole) => Promise<void>
  logout: () => Promise<void>
  refreshToken: () => Promise<string | null>
}

// ─────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null)

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'

// ─────────────────────────────────────────────
// AuthProvider
//
// Access token is stored in-memory (React state) — NOT in localStorage.
// On mount, we silently attempt a refresh to restore session from
// the HttpOnly cookie if one exists.
// ─────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    accessToken: null,
    isLoading: true,
  })

  // Silent refresh on mount
  useEffect(() => {
    refreshToken().finally(() => {
      setState((s) => ({ ...s, isLoading: false }))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const refreshToken = useCallback(async (): Promise<string | null> => {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'include', // send HttpOnly cookie
      })
      if (!res.ok) {
        setState({ user: null, accessToken: null, isLoading: false })
        return null
      }
      const data = await res.json()
      setState({ user: data.user, accessToken: data.accessToken, isLoading: false })
      return data.accessToken as string
    } catch {
      setState({ user: null, accessToken: null, isLoading: false })
      return null
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.message ?? 'Login failed')
    }
    const data = await res.json()
    setState({ user: data.user, accessToken: data.accessToken, isLoading: false })
  }, [])

  const signup = useCallback(
    async (email: string, password: string, role: UserRole = 'DEVELOPER') => {
      const res = await fetch(`${API_BASE}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password, role }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.message ?? 'Signup failed')
      }
      const data = await res.json()
      setState({ user: data.user, accessToken: data.accessToken, isLoading: false })
    },
    []
  )

  const logout = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: state.accessToken
          ? { Authorization: `Bearer ${state.accessToken}` }
          : {},
      })
    } finally {
      setState({ user: null, accessToken: null, isLoading: false })
    }
  }, [state.accessToken])

  return (
    <AuthContext.Provider
      value={{ ...state, login, signup, logout, refreshToken }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// ─────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
