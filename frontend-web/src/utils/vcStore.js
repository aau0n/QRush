// 발급한 VC를 브라우저 localStorage에 보관 — 새로고침·페이지 이동에도 유지된다.
// (발급기관 어드민 기기의 로컬 기록용. 데모 편의를 위한 저장소.)

const KEY = 'qrush:issued-vcs';

export function loadIssuedVcs() {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveIssuedVcs(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // localStorage 사용 불가(사생활 모드 등) — 저장 생략, 세션 내에서만 유지.
  }
}
