import { useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { useAuth } from '../contexts/AuthContext'

const WS_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'

interface FeedEvent {
  id: string
  message: string      // pre-formatted by server: "{actor} moved Task #N from X → Y · Xm ago"
  changedAt: string
}

export function ActivityFeed() {
  const { accessToken, user } = useAuth()
  const [events, setEvents] = useState<FeedEvent[]>([])
  const [connected, setConnected] = useState(false)
  const [onlineCount, setOnlineCount] = useState<number | null>(null)
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    if (!accessToken || !user) return

    const socket = io(WS_URL, { auth: { token: accessToken } })
    socketRef.current = socket

    socket.on('connect', () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))

    // On (re)connect the server sends the last 20 DB-fetched events scoped to
    // this user's role. Replace the list so history is always from the DB, not
    // accumulated in memory across reconnects.
    socket.on('activity:history', (history: FeedEvent[]) => {
      setEvents(history) // arrives newest-first
    })

    // Live events: prepend so newest stays at top
    socket.on('activity:event', (ev: FeedEvent) => {
      setEvents(prev => [ev, ...prev].slice(0, 100))
    })

    // Admin-only: track how many distinct users are connected right now
    if (user.role === 'ADMIN') {
      socket.on('presence:update', ({ connectedUsers }: { connectedUsers: number }) => {
        setOnlineCount(connectedUsers)
      })
    }

    return () => { socket.disconnect() }
  }, [accessToken, user])

  return (
    <div style={{ border: '1px solid #333', padding: '12px', marginTop: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
        <strong>Activity Feed</strong>
        <span style={{ fontSize: '12px', color: connected ? 'limegreen' : 'gray' }}>
          {connected ? '● live' : '○ connecting'}
        </span>
        {user?.role === 'ADMIN' && onlineCount !== null && (
          <span style={{ fontSize: '12px' }}>{onlineCount} online</span>
        )}
      </div>

      {events.length === 0 ? (
        <p style={{ fontSize: '13px', color: '#666' }}>No activity yet.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {events.map(ev => (
            <li key={ev.id} style={{ fontSize: '13px', padding: '4px 0', borderBottom: '1px solid #222' }}>
              {ev.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
