import { useEffect, useState } from 'react'

// 임시 디버그: iOS 홈화면 앱에서 실제 안전영역/뷰포트/셸 치수를 화면에 찍어 원인 확정용.
// 진단 끝나면 제거.
export default function DebugSafeArea() {
  const [info, setInfo] = useState({})
  useEffect(() => {
    function measure() {
      // env(safe-area-inset-*) 실측: padding 으로 넣고 계산값 읽기
      const probe = document.createElement('div')
      probe.style.cssText = 'position:fixed;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);visibility:hidden;'
      document.body.appendChild(probe)
      const cs = getComputedStyle(probe)
      const saTop = cs.paddingTop, saBottom = cs.paddingBottom, saLeft = cs.paddingLeft, saRight = cs.paddingRight
      probe.remove()

      const shell = document.querySelector('.app-shell')
      const r = shell ? shell.getBoundingClientRect() : null
      const nav = document.querySelector('.bottomnav')
      const nr = nav ? nav.getBoundingClientRect() : null
      const vv = window.visualViewport

      setInfo({
        dpr: window.devicePixelRatio,
        standalone: String(window.navigator.standalone),
        innerH: window.innerHeight,
        docH: document.documentElement.clientHeight,
        vvH: vv ? Math.round(vv.height) : 'n/a',
        vvOffTop: vv ? Math.round(vv.offsetTop) : 'n/a',
        saTop, saBottom, saLeft, saRight,
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
      {`dpr=${info.dpr} standalone=${info.standalone}
innerH=${info.innerH} docH=${info.docH} vvH=${info.vvH} vvTop=${info.vvOffTop}
SA top=${info.saTop} bottom=${info.saBottom}
SA left=${info.saLeft} right=${info.saRight}
shell top=${info.shellTop} bottom=${info.shellBottom} h=${info.shellH}
navBottom=${info.navBottom}`}
    </div>
  )
}
