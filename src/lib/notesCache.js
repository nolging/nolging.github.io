// 쪽지 목록 모듈 캐시 — 페이지 재진입(언마운트→마운트)마다 받은/보낸 목록·아이템·deco 를
// 다시 불러오며 egress 가 급증하던 것을 막는다. 같은 유저·TTL 이내면 재조회 없이 즉시 표시.
// 쪽지를 새로 보내거나 상태가 바뀌면 invalidateNotesCache() 로 무효화해 다음 진입에서 최신화.
export const NOTES_TTL = 60000 // 60초

export const notesCache = { uid: null, received: [], sent: [], noteItems: {}, decos: {}, at: 0 }

export function invalidateNotesCache() { notesCache.at = 0 }
