import { useEffect, useState } from 'react'

// 임시 디버그: 셸 높이 보정이 물리 화면 하단까지 실제로 닿는지 실측 확인용. 진단 후 제거.
export default function DebugSafeArea() {
  const [info, setInfo] = useState({})
  useEffect(() => {
    function measure() {
      const probe = document.createElement('div')
      probe.style.cssText = 'position:fixed;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);visibility:hidden;'
      document.body.appendChild(probe)
      const cs = getComputedStyle(probe)
      const saTop = cs.paddingTop, saBottom = cs.paddingBottom
      probe.remove()

      const shell = document.querySelector('.app-shell')
      const r = shell ? shell.getBoundingClientRect() : null
      const nav = document.querySelector('.bottomnav')
      const nr = nav ? nav.getBoundingClientRect() : null

      setInfo({
        dpr: window.devicePixelRatio,
        innerH: window.innerHeight,
        screenH: window.screen.height,
        physCSS: Math.round(window.screen.height),
        saTop, saBottom,
        shellTop: r ? Math.round(r.top) : 'n/a',
        shellBottom: r ? Math.round(r.bottom) : 'n/a',
        shellH: r ? Math.round(r.height) : 'n/a',
        navBottom: nr ? Math.round(nr.bottom) : 'no-nav',
      })
    }
    measure()
    window.addEventListener('resize', measure)
    const t = setTimeout(measure, 400)
    return () => { window.removeEventListener('resize', measure); clearTimeout(t) }
  }, [])

  return (
    <div style={{
      position: 'fixed', top: 'calc(env(safe-area-inset-top) + 4px)', left: 6, zIndex: 99999,
      background: 'rgba(0,0,0,.82)', color: '#0f0', font: '11px/1.35 monospace',
      padding: '6px 8px', borderRadius: 8, maxWidth: '62vw', pointerEvents: 'none', whiteSpace: 'pre-wrap',
    }}>
      {`dpr=${info.dpr} innerH=${info.innerH} screenH=${info.screenH}
SA top=${info.saTop} bottom=${info.saBottom}
shell top=${info.shellTop} bottom=${info.shellBottom} h=${info.shellH}
navBottom=${info.navBottom}`}
    </div>
  )
}
