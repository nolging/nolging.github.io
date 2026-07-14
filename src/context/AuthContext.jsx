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
    // 본인 프로필은 my_profile() RPC 로(본인 행만, role/login_id 포함) 로드.
    // → profiles 테이블에 남의 아이디/role 을 grant 로 열지 않아도 됨(열거 방지).
    try {
      const { data: mine, error } = await supabase.rpc('my_profile')
      const row = Array.isArray(mine) ? mine[0] : mine
      if (!error && row) {
        setProfile({ ...row, login_id: row.login_id ?? row.nickname ?? '' })
        return
      }
      // 폴백(구 DB/RPC 미적용): 최소 컬럼만 직접 조회(민감 컬럼 미포함)
      const { data } = await supabase
        .from('profiles').select('id, status, created_at').eq('id', userId).single()
      setProfile(data ? { ...data, login_id: '' } : null)
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

  // 재개 복구(Resume Recovery): 탭을 오래 백그라운드에 뒀거나 기기가 절전에서
  // 깨어난 뒤 재접속하면 (1) 액세스 토큰 만료로 첫 요청이 실패하거나 (2) 인증 락/
  // 연결이 굳어 무한 로딩처럼 보일 수 있다.
  //
  // 핵심: setInterval 은 백그라운드에서 스로틀(크롬은 ~60s/회)되거나 정지되므로,
  // '타이머 간격'만 보면 몇 시간을 백그라운드에 둔 탭은 매 틱 간격이 임계값보다 작아
  // 재개를 놓친다. 그래서 visibilitychange 로 측정한 '실제 숨김 지속시간'을 기준으로
  // 감지하고(스로틀 무관), 자리비움 길이에 따라 세션 재검증(소프트) 또는
  // 새로고침(하드)으로 회복한다. 시간점프 감지는 visibility 이벤트가 안 오는
  // 환경(일부 iOS PWA/절전)을 위한 보조 수단으로 유지한다.
  useEffect(() => {
    const SOFT_MS = 60000   // 1분 이상 비활성 후 재개 → 세션 재검증
    const HARD_MS = 300000  // 5분 이상 비활성/절전 후 재개 → 새로고침으로 클린 회복
    // lastSeen = '앱이 실제로 살아 돌아가고 있던' 마지막 시각.
    // 프리즈/절전 중엔 아래 tick 이 돌지 않고, 백그라운드(숨김)에선 lastSeen 을 갱신하지
    // 않으므로, 다시 보일 때의 gap 이 곧 '자리 비운 시간' 이 된다. 이렇게 하면
    // visibilitychange(hidden) 이벤트가 안 오는 iOS PWA 등에서도 재개를 놓치지 않는다.
    let lastSeen = Date.now()
    let recovering = false

    const reload = () => { try { window.location.reload() } catch { /* noop */ } }

    const softRecover = async () => {
      // 8초 내 세션 확인 실패(락/연결 고착)면 새로고침으로 회복
      const hard = setTimeout(reload, 8000)
      try {
        const { data, error } = await supabase.auth.getSession()
        clearTimeout(hard)
        if (error) { reload(); return }
        setSession(data.session)                  // 재개 후 세션/유저 상태 최신화(누락 시 stale)
        await loadProfile(data.session?.user?.id) // 프로필/권한 최신화
        recovering = false
      } catch {
        clearTimeout(hard)
        reload()
      }
    }

    const check = () => {
      if (document.visibilityState !== 'visible') return // 숨김 중엔 lastSeen 유지
      const now = Date.now()
      const gap = now - lastSeen
      lastSeen = now
      if (gap < SOFT_MS || recovering) return
      recovering = true
      if (gap >= HARD_MS) reload()   // 오래 비움 → 새로고침으로 클린 회복
      else softRecover()             // 중간 → 세션 재검증(실패 시 새로고침)
    }

    const iv = setInterval(check, 5000)
    document.addEventListener('visibilitychange', check)
    window.addEventListener('focus', check)
    window.addEventListener('pageshow', check)
    return () => {
      clearInterval(iv)
      document.removeEventListener('visibilitychange', check)
      window.removeEventListener('focus', check)
      window.removeEventListener('pageshow', check)
    }
  }, [loadProfile])

  const login = useCallback(async (loginId, password) => {
    const email = nicknameToEmail(loginId)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new Error('아이디 또는 비밀번호가 올바르지 않습니다.')
    // 비활성/승인대기 계정 차단
    const { data: prof } = await supabase
      .from('profiles')
      .select('status')
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
