import { supabase } from './supabaseClient'

export default function Dashboard() {
  const logout = async () => {
    await supabase.auth.signOut()
  }

  return (
    <div className="results-section">
      <div className="results-header">
        <h2>Dashboard</h2>
        <button className="download-button" onClick={logout}>Logout</button>
      </div>
      <p>Qui metteremo: progetti + domini per progetto.</p>
    </div>
  )
}
