import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from './supabaseClient'

export default function ProtectedRoute({ session, children, adminOnly = false }) {
  const [checking, setChecking] = useState(adminOnly)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    let mounted = true

    const check = async () => {
      if (!adminOnly) return
      setChecking(true)

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        if (!mounted) return
        setIsAdmin(false)
        setChecking(false)
        return
      }

      const { data, error } = await supabase
        .from('admin_users')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle()

      if (!mounted) return
      setIsAdmin(!error && !!data)
      setChecking(false)
    }

    check()

    return () => {
      mounted = false
    }
  }, [adminOnly])

  if (!session) return <Navigate to="/login" replace />
  if (adminOnly) {
    if (checking) return null
    if (!isAdmin) return <Navigate to="/search" replace />
  }

  return children
}
