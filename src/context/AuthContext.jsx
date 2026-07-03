import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase, nicknameToEmail } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = useCallback(async (userId) => {
    if (!userId) {
      setProfile(null)
      return
    }
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
    setProfile(data ?? null)
  }, [])

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return
      setSession(data.session)
      await loadProfile(data.session?.user?.id)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession)
      await loadProfile(newSession?.user?.id)
    })
    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [loadProfile])

  const login = useCallback(async (nickname, password) => {
    const email = nicknameToEmail(nickname)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new Error('닉네임 또는 비밀번호가 올바르지 않습니다.')
    // 비활성 계정 차단
    const { data: prof } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .single()
    if (prof?.status === 'disabled') {
      await supabase.auth.signOut()
      throw new Error('비활성화된 계정입니다. 관리자에게 문의하세요.')
    }
    return data
  }, [])

  const logout = useCallback(async () => {
    await supabase.auth.signOut()
    setProfile(null)
  }, [])

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    isAdmin: profile?.role === 'admin',
    loading,
    login,
    logout,
    refreshProfile: () => loadProfile(session?.user?.id),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
