// 워드마크: "놀깅" 을 "놀기 + ㅇ" 으로 분해해 표기 (마지막 ㅇ 를 강조)
export default function Brand({ className = '' }) {
  return (
    <span className={`brand-word ${className}`}>
      놀기<span className="brand-o">ㅇ</span>
    </span>
  )
}
