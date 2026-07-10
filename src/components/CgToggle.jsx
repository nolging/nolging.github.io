// 시안 스타일 토글(보라). locked 면 잠금(회색·조작 불가)
export default function CgToggle({ on, locked, onClick }) {
  if (locked) return <span className="cg-toggle locked" aria-hidden="true"><span className="cg-knob" /></span>
  return (
    <span className={`cg-toggle ${on ? 'on' : ''}`} role="switch" aria-checked={on} onClick={onClick}>
      <span className="cg-knob" />
    </span>
  )
}
