// frontend/src/main.jsx
import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'

import App from './App.jsx'
import Login from './Login.jsx'
import Dashboard from './Dashboard.jsx'
import Search from './Search.jsx'
import Searches from './Searches.jsx'
import ProtectedRoute from './ProtectedRoute.jsx'
import { supabase } from './supabaseClient.js'
import { clearStalePasswordSetup, isPasswordSetupPending, markPasswordSetup } from './authPasswordSetup.js'

function Root() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    supabase.auth.getSession().then(({ data, error }) => {
      if (!isMounted) return
      if (error) console.error(error)
      clearStalePasswordSetup(data?.session)
      setSession(data?.session ?? null)
      setLoading(false)
    })

    const { data: authListener } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === 'PASSWORD_RECOVERY') {
        markPasswordSetup('recovery')
        setSession(newSession)
        setLoading(false)
        if (window.location.pathname !== '/login') {
          window.location.replace('/login')
        }
        return
      }

      setSession(newSession)
      setLoading(false)
    })

    return () => {
      isMounted = false
      authListener?.subscription?.unsubscribe()
    }
  }, [])

  if (loading) return null

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            session && !isPasswordSetupPending() ? (
              <Navigate to="/search" replace />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        {/* Login gestisce anche inviti/reset password; non fare redirect qui */} 
        <Route path="/login" element={<Login />} />

        {/* TL/Admin only */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute session={session} adminOnly={true}>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        {/* alcuni hosting (es. static) aggiungono trailing slash: /dashboard/ */}
        <Route
          path="/dashboard/"
          element={
            <ProtectedRoute session={session} adminOnly={true}>
              <Dashboard />
            </ProtectedRoute>
          }
        />

        {/* TL/Admin only - dettaglio progetto */}
        <Route
          path="/dashboard/:projectId"
          element={
            <ProtectedRoute session={session} adminOnly={true}>
              <Dashboard />
            </ProtectedRoute>
          }
        />

        {/* Qualsiasi utente loggato */}
        <Route
          path="/search"
          element={
            <ProtectedRoute session={session}>
              <Search />
            </ProtectedRoute>
          }
        />

        <Route
          path="/searches"
          element={
            <ProtectedRoute session={session}>
              <Searches />
            </ProtectedRoute>
          }
        />

        <Route path="/legacy" element={<App />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)
