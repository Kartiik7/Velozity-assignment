import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { TaskModal } from './TaskModal'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'

interface Task {
  id: string
  title: string
  status: string
  priority: string
  dueDate: string | null
  assignedDeveloper: { email: string } | null
}

export function TaskList() {
  const { accessToken, user } = useAuth()
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false)

  // Parse filters from URL
  const getFiltersFromUrl = () => {
    const params = new URLSearchParams(window.location.search)
    return {
      status: params.get('status') || '',
      priority: params.get('priority') || '',
      dueDateFrom: params.get('dueDateFrom') || '',
      dueDateTo: params.get('dueDateTo') || '',
    }
  }

  const [filters, setFilters] = useState(getFiltersFromUrl())

  const fetchTasks = async (currentFilters: typeof filters) => {
    if (!accessToken) return
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (currentFilters.status) params.set('status', currentFilters.status)
      if (currentFilters.priority) params.set('priority', currentFilters.priority)
      if (currentFilters.dueDateFrom) params.set('dueDateFrom', currentFilters.dueDateFrom)
      if (currentFilters.dueDateTo) params.set('dueDateTo', currentFilters.dueDateTo)
      
      const res = await fetch(`${API_URL}/tasks?${params.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      })
      const data = await res.json()
      setTasks(data.data || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // Fetch when filters change or back button pressed
  useEffect(() => {
    fetchTasks(filters)

    const handlePopState = () => {
      setFilters(getFiltersFromUrl())
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [filters, accessToken])

  // Update filters and URL
  const handleFilterChange = (key: keyof typeof filters, value: string) => {
    const newFilters = { ...filters, [key]: value }
    setFilters(newFilters)
    
    const params = new URLSearchParams(window.location.search)
    if (value) params.set(key, value)
    else params.delete(key)
    
    const newUrl = `${window.location.pathname}?${params.toString()}`
    window.history.pushState({}, '', newUrl)
  }

  const handleStatusChange = async (taskId: string, newStatus: string) => {
    try {
      const res = await fetch(`${API_URL}/tasks/${taskId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ status: newStatus })
      })
      if (!res.ok) {
        const data = await res.json()
        alert(data.message || 'Failed to update status')
        return
      }
      fetchTasks(filters) // refresh list
    } catch (err) {
      console.error(err)
    }
  }

  const handleDeleteTask = async (taskId: string, title: string) => {
    if (!window.confirm(`Are you sure you want to delete task "${title}"?`)) return
    
    try {
      const res = await fetch(`${API_URL}/tasks/${taskId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` }
      })
      if (res.ok) fetchTasks(filters)
      else alert('Failed to delete task')
    } catch (err) {
      console.error(err)
    }
  }

  const canChangeStatus = (task: Task) => {
    if (!user) return false
    if (user.role === 'ADMIN' || user.role === 'PM') return true
    return user.email === task.assignedDeveloper?.email
  }

  const canEditOrDelete = () => {
    if (!user) return false
    return user.role === 'ADMIN' || user.role === 'PM'
  }

  return (
    <div className="rounded-xl border border-surface-2 bg-surface-1 shadow-[0_4px_24px_rgba(0,0,0,.35)] overflow-hidden">
      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-4 border-b border-surface-2 bg-surface-0 px-4 py-3">
        <select
          value={filters.status}
          onChange={(e) => handleFilterChange('status', e.target.value)}
          className="rounded-md border border-surface-3 bg-surface-2 px-3 py-1.5 text-sm text-text-primary outline-none focus:border-brand-500"
        >
          <option value="">All Statuses</option>
          <option value="TODO">To Do</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="IN_REVIEW">In Review</option>
          <option value="DONE">Done</option>
        </select>
        
        <select
          value={filters.priority}
          onChange={(e) => handleFilterChange('priority', e.target.value)}
          className="rounded-md border border-surface-3 bg-surface-2 px-3 py-1.5 text-sm text-text-primary outline-none focus:border-brand-500"
        >
          <option value="">All Priorities</option>
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
          <option value="CRITICAL">Critical</option>
        </select>

        <div className="flex items-center gap-2">
          <span className="text-sm text-text-secondary">Due:</span>
          <input
            type="date"
            value={filters.dueDateFrom ? filters.dueDateFrom.split('T')[0] : ''}
            onChange={(e) => handleFilterChange('dueDateFrom', e.target.value ? new Date(e.target.value).toISOString() : '')}
            className="rounded-md border border-surface-3 bg-surface-2 px-3 py-1.5 text-sm text-text-primary outline-none focus:border-brand-500"
          />
          <span className="text-sm text-text-secondary">to</span>
          <input
            type="date"
            value={filters.dueDateTo ? filters.dueDateTo.split('T')[0] : ''}
            onChange={(e) => handleFilterChange('dueDateTo', e.target.value ? new Date(e.target.value).toISOString() : '')}
            className="rounded-md border border-surface-3 bg-surface-2 px-3 py-1.5 text-sm text-text-primary outline-none focus:border-brand-500"
          />
        </div>
      </div>

      {/* Task Table */}
      <div className="overflow-x-auto">
        {loading ? (
          <div className="p-8 text-center text-text-secondary">Loading tasks...</div>
        ) : tasks.length === 0 ? (
          <div className="p-8 text-center text-text-secondary">No tasks match your filters.</div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-2 text-text-secondary">
              <tr>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Priority</th>
                <th className="px-4 py-3 font-medium">Due Date</th>
                <th className="px-4 py-3 font-medium">Assignee</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-2">
              {tasks.map(task => (
                <tr key={task.id} className="hover:bg-surface-2/30">
                  <td className="px-4 py-3 font-medium text-text-primary">{task.title}</td>
                  <td className="px-4 py-3">
                    {canChangeStatus(task) ? (
                      <select 
                        value={task.status}
                        onChange={(e) => handleStatusChange(task.id, e.target.value)}
                        className="rounded border border-surface-3 bg-surface-2 px-2 py-0.5 text-xs font-semibold outline-none focus:border-brand-500"
                      >
                        <option value="TODO">To Do</option>
                        <option value="IN_PROGRESS">In Progress</option>
                        <option value="IN_REVIEW">In Review</option>
                        <option value="DONE">Done</option>
                      </select>
                    ) : (
                      <span className="rounded px-2 py-0.5 text-xs font-semibold bg-surface-3">{task.status}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded px-2 py-0.5 text-xs font-semibold bg-surface-3">{task.priority}</span>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {task.assignedDeveloper?.email || 'Unassigned'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canEditOrDelete() && (
                      <div className="flex justify-end gap-2">
                        <button onClick={() => { setEditingTask(task); setIsTaskModalOpen(true) }} className="text-xs text-brand-400 hover:underline">Edit</button>
                        <button onClick={() => handleDeleteTask(task.id, task.title)} className="text-xs text-danger hover:underline">Delete</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      
      <TaskModal
        isOpen={isTaskModalOpen}
        onClose={() => setIsTaskModalOpen(false)}
        onSuccess={() => fetchTasks(filters)}
        task={editingTask}
      />
    </div>
  )
}
