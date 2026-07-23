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
              {MEDIA_LOOKUP_CATS.includes(c.name.trim()) && (
                <span className="wc-tag" title="이 이름일 때만 작품 자동조회가 동작해요">자동조회</span>
              )}
              <button type="button" className="wc-del" aria-label="유형 삭제" onClick={() => removeAt(i)}>✕</button>
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
      <p className="wc-hint">OTT·영화·독서·게임은 그 이름일 때만 작품 정보가 자동으로 채워져요.<br />이름을 바꾸거나 삭제하면 자동조회 없이 메모형 유형이 됩니다.</p>
    </div>
  )
}
