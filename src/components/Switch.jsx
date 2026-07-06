// iOS 스타일 토글 스위치
export default function Switch({ checked, onChange, disabled = false }) {
  return (
    <label className={`switch ${disabled ? 'disabled' : ''}`} onClick={(e) => e.stopPropagation()}>
      <input type="checkbox" checked={checked} disabled={disabled}
        onChange={(e) => onChange(e.target.checked)} />
      <span className="slider" />
    </label>
  )
}
