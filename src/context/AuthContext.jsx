import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase, nicknameToEmail } from '../lib/supabase'
import { syncPushToCurrentUser, detachPushFromServer } from '../lib/push'

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
    // 그룹 접근에 꼭 필요한 컬럼만(항상 존재). 계정 아이디 컬럼명(login_id/nickname)에
    // 의존하지 않아야 마이그레이션 상태와 무관하게 프로필이 로드됨(그룹 권한 보존).
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, role, status, created_at')
        .eq('id', userId)
        .single()
      if (error || !data) { setProfile(null); return }
      // 계정 아이디는 컬럼명이 login_id/nickname 중 무엇이든 관대하게 조회(둘 다 실패해도 진행)
      let login_id = ''
      const r1 = await supabase.from('profiles').select('login_id').eq('id', userId).maybeSingle()
      if (!r1.error && r1.data?.login_id != null) login_id = r1.data.login_id
      else {
        const r2 = await supabase.from('profiles').select('nickname').eq('id', userId).maybeSingle()
        if (!r2.error && r2.data?.nickname != null) login_id = r2.data.nickname
      }
      setProfile({ ...data, login_id })
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
        // 이 기기의 기존 푸시 구독을 현재 로그인 사용자 소유로 재바인딩(계정 전환 대응)
        if (data.session?.user?.id) syncPushToCurrentUser()
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
      if (newSession?.user?.id) syncPushToCurrentUser() // 로그인/전환 시 기기 재바인딩
      settle() // 인증 이벤트가 먼저 도착하면 그 시점에 로딩 해제
    })
    return () => {
      mounted = false
      clearTimeout(timer)
      sub.subscription.unsubscribe()
    }
  }, [loadProfile])

  // 재개 워치독(하트비트): 이벤트에 의존하지 않고 '시간 점프'로 절전/백그라운드 재개를 감지한다.
  // 기기가 자면 타이머도 멈추므로, 다시 깨어났을 때 마지막 기록과의 간격이 크면
  // (연결/토큰 락이 굳어 무한 로딩이 되는 상태) 페이지를 새로고침해 새 로드로 회복한다.
  // iOS PWA 처럼 visibilitychange 가 안 터지는 환경도 커버된다.
  useEffect(() => {
    const GAP = 120000 // 2분 이상 비활성 후 재개면 새로고침
    let last = Date.now()
    let done = false
    const check = () => {
      if (done) return
      const now = Date.now()
      const gap = now - last
      last = now
      if (gap > GAP) { done = true; window.location.reload() }
    }
    const iv = setInterval(check, 5000)
    const onVis = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', check)
    window.addEventListener('pageshow', check)
    return () => {
      clearInterval(iv)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('focus', check)
      window.removeEventListener('pageshow', check)
    }
  }, [])

  const login = useCallback(async (loginId, password) => {
    const email = nicknameToEmail(loginId)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new Error('아이디 또는 비밀번호가 올바르지 않습니다.')
    // 비활성/승인대기 계정 차단
    const { data: prof } = await supabase
      .from('profiles')
      .select('id, role, status')
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
    // 로그아웃 전에 이 기기의 서버 푸시 구독을 제거 — 로그아웃 상태에서 이전 사용자 푸시가 오지 않도록
    await detachPushFromServer()
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
