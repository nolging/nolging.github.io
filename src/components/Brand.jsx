// 워드마크: "놀깅" + 점 하나(로그인 화면의 .login-logo 와 동일한 스타일)
export default function Brand({ className = '' }) {
  return <span className={`brand-word ${className}`}>놀깅<span className="brand-dot">.</span></span>
}
