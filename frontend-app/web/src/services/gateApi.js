function randomNonce(length = 20) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i += 1) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

// 나중에 B팀 API 붙일 때 true로 바꾸거나 환경변수로 교체
const USE_MOCK = true;

// ===== Mock 구현 =====
function createMockChallenge(gateId, ttlSeconds = 30) {
  const now = Date.now();
  const expiresAt = now + ttlSeconds * 1000;

  return {
    challengeId: `ch_${Math.floor(now / 1000)}`,
    nonce: randomNonce(20),
    gateId,
    issuedAt: now,
    expiresAt,
    ttlSeconds,
  };
}

async function mockGetGateChallenge(gateId) {
  // 네트워크 지연 흉내
  await delay(250);
  return createMockChallenge(gateId, 30);
}

async function mockVerifyGateSubmission(payload) {
  await delay(800);

  // 프로토타입용 규칙(랜덤 + 약간의 조건)
  const now = Date.now();
  const isExpired = payload?.challenge?.expiresAt && now > payload.challenge.expiresAt;

  if (isExpired) {
    return {
      valid: false,
      reason: "CHALLENGE_EXPIRED",
      message: "챌린지가 만료되었습니다.",
      checkedAt: now,
    };
  }

  const ok = Math.random() > 0.3;

  return {
    valid: ok,
    reason: ok ? "OK" : "OWNER_MISMATCH",
    message: ok
      ? "검증에 성공했습니다. 입장 승인"
      : "소유권 검증 실패(프로토타입 랜덤 결과)",
    checkedAt: now,
    ticketId: payload?.ticket?.tokenId ?? null,
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ===== 실제 API 붙일 때 교체할 공개 함수 =====

export async function getGateChallenge(gateId) {
  if (USE_MOCK) {
    return mockGetGateChallenge(gateId);
  }

  // B팀 API 연동 예시 (추후 교체)
  // const res = await fetch(`/api/gate/challenge?gateId=${encodeURIComponent(gateId)}`);
  // if (!res.ok) throw new Error("챌린지 요청 실패");
  // return res.json();

  throw new Error("실제 API 모드가 아직 구현되지 않았습니다.");
}

export async function verifyGateSubmission(payload) {
  if (USE_MOCK) {
    return mockVerifyGateSubmission(payload);
  }

  // B팀 API 연동 예시 (추후 교체)
  // const res = await fetch("/api/gate/verify", {
  //   method: "POST",
  //   headers: { "Content-Type": "application/json" },
  //   body: JSON.stringify(payload),
  // });
  // if (!res.ok) throw new Error("검증 요청 실패");
  // return res.json();

  throw new Error("실제 API 모드가 아직 구현되지 않았습니다.");
}