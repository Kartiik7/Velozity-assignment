import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { TaskList } from './TaskList'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'

export function AdminDashboard() {
  const { accessToken } = useAuth()
  const [stats, setStats] = useState<any>(null)

  useEffect(() => {
    if (!accessToken) return
    fetch(`${API_URL}/dashboard/stats`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    }).then(r => r.json()).then(d => setStats(d.data)).catch(console.error)
  }, [accessToken])

  if (!stats) return <div className="p-4 text-text-secondary">Loading admin stats...</div>

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Projects" value={stats.totalProjects} icon="📁" />
        <StatCard label="Overdue Tasks" value={stats.overdueCount} icon="⚠️" />
        <StatCard label="Active Users Online" value={stats.activeUsersOnline} icon="🟢" />
      </div>
      
      <div className="rounded-xl border border-surface-2 bg-surface-1 p-6">
        <h3 className="mb-4 text-lg font-bold text-text-primary">Tasks by Status</h3>
        <ul className="space-y-2 text-sm text-text-secondary">
          {Object.entries(stats.tasksByStatus || {}).map(([status, count]) => (
            <li key={status} className="flex justify-between border-b border-surface-2 pb-2">
              <span>{status}</span>
              <span className="font-semibold text-text-primary">{count as number}</span>
            </li>
          ))}
        </ul>
      </div>

      <h3 className="mt-8 text-lg font-bold text-text-primary">All Tasks</h3>
      <TaskList />
    </div>
  )
}

export function PMDashboard() {
  const { accessToken } = useAuth()
  const [stats, setStats] = useState<any>(null)

  useEffect(() => {
    if (!accessToken) return
    fetch(`${API_URL}/dashboard/stats`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    }).then(r => r.json()).then(d => setStats(d.data)).catch(console.error)
  }, [accessToken])

  if (!stats) return <div className="p-4 text-text-secondary">Loading PM stats...</div>

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Tasks Due Next 7 Days" value={stats.upcomingDueDates} icon="📅" />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-surface-2 bg-surface-1 p-6">
          <h3 className="mb-4 text-lg font-bold text-text-primary">Your Projects</h3>
          {stats.projectsSummary?.length === 0 ? (
            <p className="text-sm text-text-muted">No projects created yet.</p>
          ) : (
            <ul className="space-y-3">
              {stats.projectsSummary?.map((p: any) => (
                <li key={p.id} className="flex justify-between items-center text-sm border-b border-surface-2 pb-2">
                  <span className="text-text-primary font-medium">{p.name}</span>
                  <span className="text-text-secondary">{p._count.tasks} tasks</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-surface-2 bg-surface-1 p-6">
          <h3 className="mb-4 text-lg font-bold text-text-primary">Tasks by Priority</h3>
          <ul className="space-y-2 text-sm text-text-secondary">
            {Object.entries(stats.tasksByPriority || {}).map(([priority, count]) => (
              <li key={priority} className="flex justify-between border-b border-surface-2 pb-2">
                <span>{priority}</span>
                <span className="font-semibold text-text-primary">{count as number}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <h3 className="mt-8 text-lg font-bold text-text-primary">Project Tasks</h3>
      <TaskList />
    </div>
  )
}

export function DeveloperDashboard() {
  return (
    <div className="space-y-6">
      <h3 className="text-lg font-bold text-text-primary">My Assigned Tasks</h3>
      <TaskList />
    </div>
  )
}

function StatCard({ label, value, icon }: { label: string, value: string | number, icon: string }) {
  return (
    <div className="rounded-xl border border-surface-2 bg-surface-1 p-5 shadow-sm">
      <div className="mb-2 text-2xl">{icon}</div>
      <div className="text-2xl font-bold text-text-primary">{value}</div>
      <div className="mt-1 text-sm text-text-secondary">{label}</div>
    </div>
  )
}
