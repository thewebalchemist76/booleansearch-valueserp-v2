import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from './supabaseClient'

export default function ProtectedRoute({ session, children, adminOnly = false }) {
  // null = non ancora verificato, true/false = verificato
  const [isAdmin, setIsAdmin] = useState(adminOnly ? null : false)

  useEffect(() => {
    let mounted = true

    const check = async () => {
      if (!adminOnly) {
        if (!mounted) return
        setIsAdmin(false)
        return
      }

      // importantissimo: prima render "in verifica"
      if (!mounted) return
      setIsAdmin(null)

      const userId = session?.user?.id
      if (!userId) {
        if (!mounted) return
        setIsAdmin(false)
        return
      }

      const { data, error } = await supabase
        .from('admin_users')
        .select('user_id')
        .eq('user_id', userId)
        .maybeSingle()

      if (!mounted) return
      setIsAdmin(!error && !!data)
    }

    check()

    return () => {
      mounted = false
    }
  }, [adminOnly, session?.user?.id])

  if (!session) return <Navigate to="/login" replace />

  if (adminOnly) {
    if (isAdmin === null) {
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
