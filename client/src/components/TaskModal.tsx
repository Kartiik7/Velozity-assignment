import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'

interface TaskModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  task?: any
  projectId?: string // needed for creating new tasks
}

export function TaskModal({ isOpen, onClose, onSuccess, task, projectId }: TaskModalProps) {
  const { accessToken } = useAuth()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState('TODO')
  const [priority, setPriority] = useState('MEDIUM')
  const [dueDate, setDueDate] = useState('')
  const [assignedDeveloperId, setAssignedDeveloperId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isOpen) {
      setTitle(task?.title || '')
      setDescription(task?.description || '')
      setStatus(task?.status || 'TODO')
      setPriority(task?.priority || 'MEDIUM')
      setDueDate(task?.dueDate ? task.dueDate.split('T')[0] : '')
      setAssignedDeveloperId(task?.assignedDeveloperId || '')
      setError('')
    }
  }, [isOpen, task])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const url = task ? `${API_URL}/tasks/${task.id}` : `${API_URL}/projects/${projectId}/tasks`
      const method = task ? 'PATCH' : 'POST'
      
      const payload: any = {
        title,
        description,
        status,
        priority,
      }
      
      if (dueDate) payload.dueDate = new Date(dueDate).toISOString()
      if (assignedDeveloperId) payload.assignedDeveloperId = assignedDeveloperId

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify(payload)
      })
      
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.message || data.error || 'Failed to save task')
      }
      
      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl bg-surface-1 p-6 shadow-2xl">
        <h2 className="mb-4 text-xl font-bold text-text-primary">
          {task ? 'Edit Task' : 'New Task'}
        </h2>
        
        {error && <div className="mb-4 rounded bg-danger/20 p-2 text-sm text-danger">{error}</div>}
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary">Title</label>
            <input
              type="text"
              required
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="mt-1 w-full rounded-md border border-surface-3 bg-surface-2 p-2 text-text-primary outline-none focus:border-brand-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="mt-1 w-full rounded-md border border-surface-3 bg-surface-2 p-2 text-text-primary outline-none focus:border-brand-500"
              rows={3}
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary">Status</label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value)}
                className="mt-1 w-full rounded-md border border-surface-3 bg-surface-2 p-2 text-text-primary outline-none focus:border-brand-500"
              >
                <option value="TODO">To Do</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="IN_REVIEW">In Review</option>
                <option value="DONE">Done</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary">Priority</label>
              <select
                value={priority}
                onChange={e => setPriority(e.target.value)}
                className="mt-1 w-full rounded-md border border-surface-3 bg-surface-2 p-2 text-text-primary outline-none focus:border-brand-500"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-text-secondary">Due Date</label>
            <input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              className="mt-1 w-full rounded-md border border-surface-3 bg-surface-2 p-2 text-text-primary outline-none focus:border-brand-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-text-secondary">Assigned Developer ID</label>
            <input
              type="text"
              value={assignedDeveloperId}
              onChange={e => setAssignedDeveloperId(e.target.value)}
              placeholder="UUID of a developer (optional)"
              className="mt-1 w-full rounded-md border border-surface-3 bg-surface-2 p-2 text-text-primary outline-none focus:border-brand-500"
            />
            <p className="mt-1 text-xs text-text-muted">For demo: grab a developer UUID from the DB</p>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-2"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
