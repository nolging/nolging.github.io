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
    // contact/birthdate 는 프라이버시로 일반 조회에서 제외됨 → 필요한 컬럼만
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id, nickname, role, status, created_at')
        .eq('id', userId)
        .single()
      setProfile(data ?? null)
    } catch {
      // 네트워크 오류 등으로 프로필 조회 실패해도 앱이 멈추지 않게
      setProfile(null)
    }
  }, [])

  useEffect(() => {
    let mounted = true
    let settled = false
    let timer
    // 로딩은 항상 해제되도록 보장 (한 번만)
    const settle = () => {
      if (!mounted || settled) return
      settled = true
      clearTimeout(timer)
      setLoading(false)
    }
    // 장시간 백그라운드 후 재개 시 getSession(토큰 갱신 락)이 멈추면 무한 로딩이 됨 →
    // 최대 6초 뒤 강제로 로딩 해제하여 스피너에 갇히지 않게 한다.
    timer = setTimeout(settle, 6000)

    ;(async () => {
      try {
        const { data } = await supabase.auth.getSession()
        if (!mounted) return
        setSession(data.session)
        await loadProfile(data.session?.user?.id)
      } catch {
        if (mounted) { setSession(null); setProfile(null) }
      } finally {
        settle()
      }
    })()

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (!mounted) return
      setSession(newSession)
      await loadProfile(newSession?.user?.id)
      settle() // 인증 이벤트가 먼저 도착하면 그 시점에 로딩 해제
    })
    return () => {
      mounted = false
      clearTimeout(timer)
      sub.subscription.unsubscribe()
    }
  }, [loadProfile])

  const login = useCallback(async (nickname, password) => {
    const email = nicknameToEmail(nickname)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new Error('닉네임 또는 비밀번호가 올바르지 않습니다.')
    // 비활성/승인대기 계정 차단
    const { data: prof } = await supabase
      .from('profiles')
      .select('id, nickname, role, status')
      .eq('id', data.user.id)
      .single()
    if (prof?.status === 'pending') {
      await supabase.auth.signOut()
      throw new Error('아직 관리자 승인 대기 중인 계정입니다.')
    }
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
