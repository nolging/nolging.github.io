// 상점 아이템 시각 정보(업로드 배경색/이미지) 전역 캐시.
// 여러 화면(상점·인벤토리·선물 모달·쪽지 등)이 아이템 id 만으로 배경색·이미지를 쓰도록 공유한다.
import { useSyncExternalStore } from 'react'
import { imgBgOf } from './storeMeta'

let CATALOG = {}       // id -> { imageBg, imageSvg }
let version = 0
const listeners = new Set()

export function setStoreCatalog(items) {
  const next = {}
  for (const s of items || []) next[s.id] = { imageBg: s.imageBg || '', imageSvg: s.imageSvg || '' }
  CATALOG = next; version += 1
  listeners.forEach((fn) => fn())
}
export const catalogSvg = (id) => CATALOG[id]?.imageSvg || ''
export const catalogBg = (id) => CATALOG[id]?.imageBg || ''
// 배경색: 업로드 지정 우선 → 기존 기본(파스텔/프리미엄)
export const bgOf = (id, premium) => catalogBg(id) || imgBgOf(id, premium)

function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) }
function snapshot() { return version }
// 카탈로그가 갱신되면 리렌더시키는 훅(반환값은 버전 카운터)
export function useStoreCatalog() { return useSyncExternalStore(subscribe, snapshot, snapshot) }
