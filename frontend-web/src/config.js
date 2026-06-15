// 환경 설정 — 데모 당일 .env로 주입한다.
//
// VITE_API_BASE_URL : A 서버 주소. 같은 와이파이에서 http://<A의 IP>:3000
//                     비어 있으면 mock 모드(서버 없이 화면 흐름만 동작).
// VITE_ISSUER_ADDRESS: 신뢰 발급기관 지갑 주소(IssuerRegistry에 등록된 값).
//                     register-vc의 issuer 필드로 전송된다.

const env = import.meta.env;

export const API_BASE_URL = (env.VITE_API_BASE_URL || '').replace(/\/$/, '');
export const IS_MOCK = !API_BASE_URL;

export const ISSUER_ADDRESS =
  env.VITE_ISSUER_ADDRESS || '0x0000000000000000000000000000000000000000';

export const CHAIN_RPC_URL = env.VITE_CHAIN_RPC_URL || 'http://127.0.0.1:8545';
export const TICKET_NFT_ADDRESS =
  env.VITE_TICKET_NFT_ADDRESS || '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9';

// D 앱(frontend-app) 주소 — 예매/입장 QR이 가리키는 HTTP fallback 대상.
// 비우면 현재 접속한 호스트의 5174 포트로 자동 추정(같은 서버에 D 앱이 뜬 경우).
// localhost로 열면 폰에서 안 닿으니, C 웹을 반드시 서버 IP로 열 것.
export const DAPP_BASE_URL =
  (env.VITE_DAPP_BASE_URL || '').replace(/\/$/, '') ||
  (typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.hostname}:5174`
    : 'http://localhost:5174');

// D 앱이 게이트 QR을 파싱해 proof를 POST할 절대 주소.
export const VERIFY_PROOF_PATH = '/api/gate/verify-proof';
export const verifyProofUrl = () => `${API_BASE_URL}${VERIFY_PROOF_PATH}`;
