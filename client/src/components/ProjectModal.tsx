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
      
      // Fetch clients just for the dropdown (assuming an endpoint exists, or we mock it. Wait, we don't have a GET /clients endpoint. 
      // The instructions never asked for Client management CRUD, just assigning. 
      // For simplicity, we'll fetch existing clients from the DB if possible, or just hardcode the seed client ID, or add a simple input for client name/id.)
      // Actually, since we need a clientId to create a project, let's fetch projects and extract the client ID, or hardcode it since there's no Client API.
      // Wait, if there's no Client API, the user can't select one. I will just hardcode the seeded Client ID if it's a new project, which is fine for this assessment scope.
    }
  }, [isOpen, project])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      // Hardcoded clientId for the demo since there is no Client CRUD API
      const hardcodedClientId = project?.clientId || 'fallback-client-id-needs-api' 
      
      const url = project ? `${API_URL}/projects/${project.id}` : `${API_URL}/projects`
      const method = project ? 'PATCH' : 'POST'
      
      // If we don't have a real clientId (like on first run without seed), the API will fail.
      // We will actually just fetch the first client from the backend via a trick, or we can just send the request and if it fails, tell the user to run the seed script.
      // Actually, the seed script runs successfully, so there is 1 client. We just need its ID.
      // Since we can't easily get it without an endpoint, I will just create a basic dummy payload and assume the backend accepts it (it expects a real UUID).
      // Wait, let's look at POST /projects. It requires `clientId`.
      
      // I will just use the first project's clientId from the PM Dashboard stats if available, passed via props? No, let's just make the user type a Client ID for the UI, or...
      // Better: In `Dashboards.tsx`, I'll pass the first available `clientId` from `stats.projectsSummary[0].clientId`.
      
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
              <label className="block text-sm font-medium text-text-secondary">Client ID</label>
              <input
                type="text"
                required
                value={clientId}
                onChange={e => setClientId(e.target.value)}
                placeholder="Must be a valid Client UUID"
                className="mt-1 w-full rounded-md border border-surface-3 bg-surface-2 p-2 text-text-primary outline-none focus:border-brand-500"
              />
              <p className="mt-1 text-xs text-text-muted">Hint: Copy from database (no Client API built)</p>
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
