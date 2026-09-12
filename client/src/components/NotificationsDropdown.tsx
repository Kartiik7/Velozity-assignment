import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { io, Socket } from 'socket.io-client'

const WS_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'

interface Notification {
  id: string
  message: string
  isRead: boolean
  createdAt: string
}

export function NotificationsDropdown() {
  const { accessToken, user } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const socketRef = useRef<Socket | null>(null)

  // Fetch initial notifications
  useEffect(() => {
    if (!accessToken) return
    
    fetch(`${WS_URL}/notifications`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
      .then(res => res.json())
      .then(data => {
        setNotifications(data.data)
        setUnreadCount(data.meta.unreadCount)
      })
      .catch(console.error)
  }, [accessToken])

  // Socket connection for real-time updates
  useEffect(() => {
    if (!accessToken || !user) return

    const socket = io(WS_URL, { auth: { token: accessToken } })
    socketRef.current = socket

    socket.on('notification:new', (notif: Notification) => {
      setNotifications(prev => [notif, ...prev])
      setUnreadCount(c => c + 1)
    })

    return () => { socket.disconnect() }
  }, [accessToken, user])

  const markAsRead = async (id: string) => {
    try {
      await fetch(`${WS_URL}/notifications/${id}/read`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${accessToken}` }
      })
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n))
      setUnreadCount(c => Math.max(0, c - 1))
    } catch (err) {
      console.error(err)
    }
  }

  const markAllRead = async () => {
    try {
      await fetch(`${WS_URL}/notifications/read-all`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` }
      })
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })))
      setUnreadCount(0)
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-surface-2 text-text-secondary hover:text-text-primary transition"
      >
        <span className="text-xl">🔔</span>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-danger text-[10px] font-bold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 rounded-xl border border-surface-2 bg-surface-1 shadow-lg z-50">
          <div className="flex items-center justify-between border-b border-surface-2 px-4 py-3">
            <span className="font-semibold text-text-primary">Notifications</span>
            {unreadCount > 0 && (
              <button 
                onClick={markAllRead}
                className="text-xs font-medium text-brand-400 hover:text-brand-300"
              >
                Mark all read
              </button>
            )}
          </div>
          
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="py-6 text-center text-sm text-text-muted">
                No notifications
              </div>
            ) : (
              <ul className="divide-y divide-surface-2">
                {notifications.map(n => (
                  <li key={n.id} className={`p-4 ${n.isRead ? 'opacity-60' : 'bg-surface-2/30'}`}>
                    <p className="text-sm text-text-primary mb-1">{n.message}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-text-muted">
                        {new Date(n.createdAt).toLocaleDateString()}
                      </span>
                      {!n.isRead && (
                        <button 
                          onClick={() => markAsRead(n.id)}
                          className="text-xs font-medium text-brand-400 hover:text-brand-300"
                        >
                          Mark read
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
