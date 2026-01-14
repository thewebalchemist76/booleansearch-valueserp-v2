// frontend/src/ProtectedRoute.jsx
import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from './supabaseClient'

export default function ProtectedRoute({ session, children, adminOnly = false }) {
  const [checking, setChecking] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    let mounted = true

    const check = async () => {
      if (!adminOnly) return

      const userId = session?.user?.id
      if (!userId) {
        if (!mounted) return
        setIsAdmin(false)
        setChecking(false)
        return
      }

      setChecking(true)

      const { data, error } = await supabase
        .from('admin_users')
        .select('user_id')
        .eq('user_id', userId)
        .maybeSingle()

      if (!mounted) return
      setIsAdmin(!error && !!data)
      setChecking(false)
    }

    check()

    return () => {
      mounted = false
    }
  }, [adminOnly, session?.user?.id])

  if (!session) return <Navigate to="/login" replace />

  if (adminOnly) {
    if (checking) {
      return (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <p>Caricamento dashboard…</p>
        </div>
      )
    }
    if (!isAdmin) return <Navigate to="/search" replace />
  }

  return children
}
