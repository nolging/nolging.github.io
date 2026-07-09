import { GROUP_EMOJI_BGS } from '../lib/constants'
import GroupBadge from './GroupBadge'

// 입력에서 마지막 이모지(그래핌) 하나만 취함 → 새로 입력하면 자연스럽게 교체됨
function lastGrapheme(str) {
  const s = (str || '').trim()
  if (!s) return ''
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    let out = ''
    for (const { segment } of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)) out = segment
    return out
  }
  const arr = Array.from(s)
  return arr[arr.length - 1] || ''
}

// 그룹 대표 이모지 + 배경색 선택 폼. value={emoji,bg}, onChange({emoji,bg})
// 이모지는 비워둘 수 있고(선택), 배경은 '없음(투명)'도 고를 수 있음.
export default function GroupEmojiField({ emoji, bg, name, onChange }) {
  const has = !!(emoji && emoji.trim())
  return (
    <div className="field">
      <span>그룹 이모지 <span className="field-optional">(선택)</span></span>
      <div className="emoji-field">
        {has
          ? <GroupBadge emoji={emoji} bg={bg} name={name} size={56} />
          : <span className="group-badge emoji-empty" style={{ width: 56, height: 56, borderRadius: 20 }} aria-hidden="true" />}
        <input
          className="emoji-input"
          value={emoji || ''}
          onChange={(e) => onChange({ emoji: lastGrapheme(e.target.value), bg })}
          placeholder="이모지 (선택)"
          aria-label="그룹 이모지 (하나)"
        />
      </div>
      <div className="emoji-swatches">
        <button
          type="button"
          className={`emoji-swatch emoji-swatch-none ${bg === 'transparent' ? 'active' : ''}`}
          onClick={() => onChange({ emoji, bg: 'transparent' })}
          aria-label="배경 없음"
          title="배경 없음"
        />
        {GROUP_EMOJI_BGS.map((c) => (
          <button
            type="button"
            key={c}
            className={`emoji-swatch ${bg === c ? 'active' : ''}`}
            style={{ background: c }}
            onClick={() => onChange({ emoji, bg: c })}
            aria-label={`배경색 ${c}`}
          />
        ))}
      </div>
    </div>
  )
}
