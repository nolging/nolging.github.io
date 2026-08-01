import { CATEGORY_COLOR_PRESETS, MEDIA_LOOKUP_CATS } from '../lib/constants'
import { lastGrapheme } from '../lib/cgForm'

// 그룹별 위시 유형 편집기 (소유자 전용 화면에서 사용).
// value: [{ name, emoji, bg, fg }], onChange(next) 로 상위 폼 상태를 갱신.
export default function WishCategoryEditor({ value, onChange }) {
  const list = Array.isArray(value) ? value : []
  const patchAt = (i, patch) => onChange(list.map((c, idx) => (idx === i ? { ...c, ...patch } : c)))
  const removeAt = (i) => onChange(list.filter((_, idx) => idx !== i))
  const addOne = () => {
    const p = CATEGORY_COLOR_PRESETS[list.length % CATEGORY_COLOR_PRESETS.length]
    onChange([...list, { name: '', emoji: '✨', bg: p.bg, fg: p.fg }])
  }

  return (
    <div className="wc-editor">
      <div className="wc-list">
        {list.map((c, i) => (
          <div className="wc-item" key={i}>
            <div className="wc-item-top">
              <input className="wc-emoji" style={{ background: c.bg, color: c.fg }} value={c.emoji}
                maxLength={8} placeholder="✨" aria-label="유형 이모지"
                onChange={(e) => patchAt(i, { emoji: lastGrapheme(e.target.value) })} />
              <input className="wc-name" value={c.name} maxLength={6} placeholder="유형 이름"
                aria-label="유형 이름" onChange={(e) => patchAt(i, { name: e.target.value })} />
              <button type="button" className="wc-del" aria-label="유형 삭제"
                onClick={() => {
                  const nm = c.name.trim()
                  // 자동 조회 지원 유형(OTT/영화/독서/게임)은 삭제 전 확인
                  if (MEDIA_LOOKUP_CATS.includes(nm) && !window.confirm(`${nm} 유형은 자동 조회를 지원해요. 정말 삭제할까요?`)) return
                  removeAt(i)
                }}>✕</button>
            </div>
            <div className="wc-swatches">
              {CATEGORY_COLOR_PRESETS.map((p) => {
                const on = c.bg === p.bg && c.fg === p.fg
                return (
                  <button type="button" key={p.bg} className={`wc-swatch ${on ? 'active' : ''}`}
                    style={{ background: p.bg, color: p.fg }} aria-label="배지 색"
                    onClick={() => patchAt(i, { bg: p.bg, fg: p.fg })}>가</button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
      <button type="button" className="wc-add" onClick={addOne}>+ 유형 추가</button>
    </div>
  )
}
