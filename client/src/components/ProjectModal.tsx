import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'

interface ProjectModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  project?: any // if editing
}

export function ProjectModal({ isOpen, onClose, onSuccess, project }: ProjectModalProps) {
  const { accessToken } = useAuth()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [clientId, setClientId] = useState('')
  const [clients, setClients] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isOpen) {
      setName(project?.name || '')
      setDescription(project?.description || '')
      setClientId(project?.clientId || '')
      setError('')
      
      if (!project) {
        fetch(`${API_URL}/dashboard/clients`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        })
        .then(r => r.json())
        .then(d => {
          setClients(d.data || [])
          if (d.data?.length > 0) setClientId(d.data[0].id)
        })
        .catch(console.error)
      }
    }
  }, [isOpen, project])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const url = project ? `${API_URL}/projects/${project.id}` : `${API_URL}/projects`
      const method = project ? 'PATCH' : 'POST'
      
      const payload = project ? { name, description } : { name, description, clientId }
      
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
        throw new Error(data.message || data.error || 'Failed to save project')
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
      <div className="w-full max-w-md rounded-xl bg-surface-1 p-6 shadow-2xl">
        <h2 className="mb-4 text-xl font-bold text-text-primary">
          {project ? 'Edit Project' : 'New Project'}
        </h2>
        
        {error && <div className="mb-4 rounded bg-danger/20 p-2 text-sm text-danger">{error}</div>}
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary">Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
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
          
          {!project && (
            <div>
              <label className="block text-sm font-medium text-text-secondary">Client</label>
              <select
                required
                value={clientId}
                onChange={e => setClientId(e.target.value)}
                className="mt-1 w-full rounded-md border border-surface-3 bg-surface-2 p-2 text-text-primary outline-none focus:border-brand-500"
              >
                <option value="">Select a Client...</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

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
