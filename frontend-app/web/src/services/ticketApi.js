import { mockTickets } from "../mock/mockTickets";

// 나중에 팀원 A/B 연동 시 false로 바꾸거나 환경변수로 분리
const USE_MOCK = true;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function mockGetOwnedTickets({ address }) {
  // 프로토타입용 지연
  await delay(300);

  // 현재는 address 무관하게 mock 반환
  // 나중에 address 기준 필터 또는 API/컨트랙트 조회로 교체
  return mockTickets;
}

export async function getOwnedTickets(params) {
  if (USE_MOCK) {
    return mockGetOwnedTickets(params);
  }

  // ===== 나중에 교체할 자리 (예시) =====
  // 방법 A: 팀원 B 인덱싱 API 사용
  // const res = await fetch(`/api/tickets?owner=${encodeURIComponent(params.address)}`);
  // if (!res.ok) throw new Error("티켓 목록 조회 실패");
  // return res.json();

  // 방법 B: 팀원 A 컨트랙트 직접 조회 (ethers.js)
  // return getOwnedTicketsFromContract(params.address);

  throw new Error("실제 티켓 API 모드가 아직 구현되지 않았습니다.");
}