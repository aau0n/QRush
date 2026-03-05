import { useEffect, useMemo, useState } from "react";
import QRCode from "react-qr-code";
import { clearSelectedTicket, getSelectedTicket } from "../services/session";
import { getGateChallenge, verifyGateSubmission } from "../services/gateApi";

function labelForStatus(status) {
  switch (status) {
    case "loadingChallenge":
      return "QR 생성중";
    case "verifying":
      return "검증중";
    case "approved":
      return "승인";
    case "denied":
      return "거절";
    default:
      return "대기중";
  }
}

function formatTime(ts) {
  if (!ts) return "-";
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export default function GatePage() {
  const [gateId] = useState("Gate-1");
  const [challenge, setChallenge] = useState(null);
  const [status, setStatus] = useState("idle");
  const [remaining, setRemaining] = useState(0);
  const [selectedTicket, setSelectedTicket] = useState(() => getSelectedTicket());
  const [resultMessage, setResultMessage] = useState("");
  const [gateError, setGateError] = useState("");
  const [verificationLogs, setVerificationLogs] = useState([]);

  const isBusy = status === "loadingChallenge" || status === "verifying";

  const qrPayload = useMemo(
    () => (challenge ? JSON.stringify(challenge) : JSON.stringify({ gateId, state: "loading" })),
    [challenge, gateId]
  );

  const loadChallenge = async () => {
    setGateError("");
    setStatus("loadingChallenge");

    try {
      const nextChallenge = await getGateChallenge(gateId);
      setChallenge(nextChallenge);
      setResultMessage("");
      setStatus("idle");
    } catch (err) {
      console.error(err);
      setGateError(err.message || "챌린지 생성 중 오류가 발생했습니다.");
      setStatus("idle");
    }
  };

  useEffect(() => {
    loadChallenge();
  }, []);

  useEffect(() => {
    if (!challenge) return;

    const timer = setInterval(() => {
      const now = Date.now();
      const seconds = Math.max(0, Math.ceil((challenge.expiresAt - now) / 1000));
      setRemaining(seconds);

      if (seconds <= 0) {
        clearInterval(timer);
        loadChallenge();
      }
    }, 500);

    return () => clearInterval(timer);
  }, [challenge]);

  const pushLog = (item) => {
    setVerificationLogs((prev) => [item, ...prev].slice(0, 5));
  };

  const handleRefresh = async () => {
    if (isBusy) return;
    setResultMessage("");
    await loadChallenge();
  };

  const handleMockVerify = async () => {
    if (isBusy) return;

    if (!challenge) {
      setGateError("현재 챌린지가 없습니다. QR을 다시 생성해 주세요.");
      return;
    }

    setGateError("");
    setResultMessage("");
    setStatus("verifying");

    try {
      const payload = {
        challenge,
        ticket: selectedTicket,
        submittedAt: Date.now(),
      };

      const result = await verifyGateSubmission(payload);

      const approved = !!result.valid;
      setStatus(approved ? "approved" : "denied");
      setResultMessage(result.message || (approved ? "승인" : "거절"));

      pushLog({
        at: result.checkedAt ?? Date.now(),
        status: approved ? "approved" : "denied",
        message: result.message || (approved ? "승인" : "거절"),
        ticketId: result.ticketId ?? selectedTicket?.tokenId ?? null,
        challengeId: challenge.challengeId,
      });

      setTimeout(() => {
        setStatus((current) => (current === "approved" || current === "denied" ? "idle" : current));
      }, 1500);
    } catch (err) {
      console.error(err);
      setStatus("idle");
      setGateError(err.message || "검증 요청 중 오류가 발생했습니다.");
    }
  };

  const handleClearTicket = () => {
    clearSelectedTicket();
    setSelectedTicket(null);
  };

  const handleReloadSelectedTicket = () => {
    setSelectedTicket(getSelectedTicket());
  };

  const handleClearLogs = () => {
    setVerificationLogs([]);
  };

  return (
    <section>
      <h1 className="page-title">게이트 단말기 화면</h1>
      <p className="page-desc">
        동적 QR(Nonce/Challenge) 생성 및 검증 상태 표시 프로토타입입니다.
      </p>

      <div className="panel demo-info-panel">
        <div className="demo-info-title">데모 모드 안내 (운영자 화면)</div>
        <ul className="demo-info-list">
          <li>이 페이지는 공연장 입구의 <strong>운영자/주최측 게이트 단말기</strong> 역할입니다.</li>
          <li>현재는 데모를 위해 Wallet 선택 티켓 정보를 같은 브라우저 저장소에서 읽어옵니다.</li>
          <li>실제 운영 흐름에서는 <strong>사용자 Wallet이 Gate QR을 스캔한 후 서버로 검증 요청</strong>을 보내고, Gate는 서버 결과를 표시합니다.</li>
        </ul>
      </div>

      <div className="panel">
        <div className="label-title">현재 선택된 티켓 (Wallet에서 전달 / 데모 모드)</div>

        {selectedTicket ? (
          <>
            <div className="challenge-row">
              <span className="label">공연명</span>
              <span>{selectedTicket.eventName}</span>
            </div>
            <div className="challenge-row">
              <span className="label">Token ID</span>
              <span>#{selectedTicket.tokenId}</span>
            </div>
            <div className="challenge-row">
              <span className="label">좌석</span>
              <span>{selectedTicket.seat}</span>
            </div>

            <div className="button-row" style={{ marginTop: "10px" }}>
              <button className="secondary-btn" onClick={handleReloadSelectedTicket} disabled={isBusy}>
                선택 티켓 다시 불러오기
              </button>
              <button className="secondary-btn" onClick={handleClearTicket} disabled={isBusy}>
                선택 티켓 초기화
              </button>
            </div>
          </>
        ) : (
          <>
            <p style={{ margin: 0, color: "#6b7280" }}>
              Wallet 화면에서 티켓의 "입장하기" 버튼을 눌러 선택해 주세요. (현재는 데모 모드)
            </p>
            <div className="button-row" style={{ marginTop: "10px" }}>
              <button className="secondary-btn" onClick={handleReloadSelectedTicket} disabled={isBusy}>
                선택 티켓 다시 불러오기
              </button>
            </div>
          </>
        )}
      </div>

      <div className="panel gate-panel">
        <div className="gate-top">
          <div>
            <div className="label-title">게이트 ID</div>
            <div className="strong">{gateId}</div>
          </div>

          <div>
            <div className="label-title">만료까지</div>
            <div className={remaining <= 5 ? "countdown danger" : "countdown"}>
              {remaining}s
            </div>
          </div>

          <div>
            <div className="label-title">상태</div>
            <div className={`status-badge ${status}`}>{labelForStatus(status)}</div>
          </div>
        </div>

        <div className="qr-box">
          <QRCode value={qrPayload} size={220} />
        </div>

        <div className="challenge-box">
          <div className="challenge-row">
            <span className="label">challengeId</span>
            <span className="mono">{challenge?.challengeId ?? "-"}</span>
          </div>
          <div className="challenge-row">
            <span className="label">nonce</span>
            <span className="mono">{challenge?.nonce ?? "-"}</span>
          </div>
        </div>

        {resultMessage && (
          <div className="result-box">
            <div className="label-title">검증 결과 메시지</div>
            <div>{resultMessage}</div>
          </div>
        )}

        {gateError && (
          <p className="error-text" style={{ margin: 0 }}>
            {gateError}
          </p>
        )}

        <div className="button-row">
          <button className="secondary-btn" onClick={handleRefresh} disabled={isBusy}>
            {status === "loadingChallenge" ? "QR 생성중..." : "QR 즉시 갱신"}
          </button>
          <button className="primary-btn" onClick={handleMockVerify} disabled={isBusy || !challenge}>
            {status === "verifying" ? "검증중..." : "(프로토타입) 검증 요청 수신"}
          </button>
        </div>
      </div>

      <div className="panel">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "10px",
            marginBottom: "10px",
          }}
        >
          <div className="label-title" style={{ marginBottom: 0 }}>
            최근 검증 로그 (최신순)
          </div>
          <button className="secondary-btn" onClick={handleClearLogs} disabled={isBusy || verificationLogs.length === 0}>
            로그 비우기
          </button>
        </div>

        {verificationLogs.length === 0 ? (
          <p style={{ margin: 0, color: "#6b7280" }}>아직 검증 로그가 없습니다.</p>
        ) : (
          <div className="log-list">
            {verificationLogs.map((log, idx) => (
              <div key={`${log.at}-${idx}`} className="log-item">
                <div className="log-row">
                  <span className="label">시간</span>
                  <span>{formatTime(log.at)}</span>
                </div>
                <div className="log-row">
                  <span className="label">결과</span>
                  <span className={log.status === "approved" ? "log-approved" : "log-denied"}>
                    {log.status === "approved" ? "승인" : "거절"}
                  </span>
                </div>
                <div className="log-row">
                  <span className="label">Token ID</span>
                  <span>{log.ticketId ? `#${log.ticketId}` : "-"}</span>
                </div>
                <div className="log-row">
                  <span className="label">Challenge</span>
                  <span className="mono">{log.challengeId}</span>
                </div>
                <div className="log-row">
                  <span className="label">메시지</span>
                  <span>{log.message}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}