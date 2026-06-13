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

// D 앱이 게이트 QR을 파싱해 proof를 POST할 절대 주소.
export const VERIFY_PROOF_PATH = '/api/gate/verify-proof';
export const verifyProofUrl = () => `${API_BASE_URL}${VERIFY_PROOF_PATH}`;
