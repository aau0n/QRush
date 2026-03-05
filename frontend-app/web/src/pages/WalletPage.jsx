import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import TicketCard from "../components/TicketCard";
import { connectMetaMask, shortenAddress } from "../services/wallet";
import { saveSelectedTicket } from "../services/session";
import { getOwnedTickets } from "../services/ticketApi";

const HARDHAT_CHAIN_IDS = ["0x7a69", "0x539"];

function formatTime(ts) {
  if (!ts) return "-";
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export default function WalletPage() {
  const navigate = useNavigate();

  const [account, setAccount] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [error, setError] = useState("");
  const [selectedTicket, setSelectedTicket] = useState(null);

  const [tickets, setTickets] = useState([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isLoadingTickets, setIsLoadingTickets] = useState(false);
  const [ticketError, setTicketError] = useState("");
  const [actionLogs, setActionLogs] = useState([]);

  const isHardhat = useMemo(() => {
    if (!chainId) return false;
    return HARDHAT_CHAIN_IDS.includes(chainId.toLowerCase());
  }, [chainId]);

  const isBusy = isConnecting || isLoadingTickets;

  const pushActionLog = (message, type = "info") => {
    setActionLogs((prev) => [{ at: Date.now(), message, type }, ...prev].slice(0, 5));
  };

  const loadTickets = async (ownerAddress) => {
    setTicketError("");
    setIsLoadingTickets(true);

    try {
      const data = await getOwnedTickets({ address: ownerAddress });
      const nextTickets = Array.isArray(data) ? data : [];
      setTickets(nextTickets);
      pushActionLog(`티켓 목록 조회 완료 (${nextTickets.length}개)`, "success");
    } catch (err) {
      console.error(err);
      setTicketError(err.message || "티켓 목록 조회 중 오류가 발생했습니다.");
      setTickets([]);
      pushActionLog("티켓 목록 조회 실패", "error");
    } finally {
      setIsLoadingTickets(false);
    }
  };

  useEffect(() => {
    loadTickets(null);
  }, []);

  const handleConnect = async () => {
    if (isConnecting) return;

    setError("");
    setIsConnecting(true);

    try {
      const { address, chainId } = await connectMetaMask();
      setAccount(address);
      setChainId(chainId);

      pushActionLog(`지갑 연결 성공 (${shortenAddress(address)})`, "success");
      await loadTickets(address);
    } catch (err) {
      console.error(err);
      setError(err.message || "지갑 연결 중 오류가 발생했습니다.");
      pushActionLog("지갑 연결 실패", "error");
    } finally {
      setIsConnecting(false);
    }
  };

  const handleReloadTickets = async () => {
    if (isLoadingTickets) return;
    await loadTickets(account);
  };

  const handleEnter = (ticket) => {
    if (isBusy) return;

    setSelectedTicket(ticket);
    saveSelectedTicket(ticket);
    pushActionLog(`입장 대상 티켓 선택: #${ticket.tokenId} (${ticket.eventName})`, "info");

    // 데모 모드 전용: 같은 브라우저에서 Gate 화면으로 이동
    navigate("/gate");
  };

  const handleClearSelection = () => {
    setSelectedTicket(null);
    pushActionLog("선택 상태 표시 초기화", "info");
  };

  const handleClearLogs = () => {
    setActionLogs([]);
  };

  return (
    <section>
      <h1 className="page-title">지갑(Holder) 화면</h1>
      <p className="page-desc">
        보유한 NFT 티켓을 표시하는 프로토타입 화면입니다.
      </p>

      <div className="panel demo-info-panel">
        <div className="demo-info-title">데모 모드 안내 (사용자 화면)</div>
        <ul className="demo-info-list">
          <li>현재는 <strong>한 브라우저 시연용</strong>으로 티켓 선택 후 Gate 페이지로 이동합니다.</li>
          <li>실제 운영 흐름에서는 Gate 이동이 아니라 <strong>게이트 QR 스캔 → 챌린지 응답 생성</strong>으로 연결됩니다.</li>
          <li>이 페이지는 사용자(티켓 소유자)가 사용하는 Holder 화면 역할입니다.</li>
        </ul>
      </div>

      <div className="panel">
        <div className="wallet-info">
          <div>
            <div className="label-title">연결된 주소</div>
            <div className="mono strong">{account ? shortenAddress(account) : "미연결"}</div>
          </div>

          <div>
            <div className="label-title">Chain ID</div>
            <div className="mono strong">{chainId || "-"}</div>
          </div>

          <button className="primary-btn" onClick={handleConnect} disabled={isConnecting}>
            {isConnecting ? "연결 중..." : "MetaMask 연결"}
          </button>
        </div>

        <div className="button-row" style={{ marginTop: "10px" }}>
          <button className="secondary-btn" onClick={handleReloadTickets} disabled={isLoadingTickets}>
            {isLoadingTickets ? "불러오는 중..." : "티켓 목록 새로고침"}
          </button>
        </div>

        {account && !isHardhat && (
          <p className="warning-text">
            현재 Hardhat 로컬 네트워크가 아닙니다. MetaMask 네트워크를 확인해 주세요.
          </p>
        )}

        {error && <p className="error-text">{error}</p>}
        {ticketError && <p className="error-text">{ticketError}</p>}
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
            현재 선택 상태 (데모 표시용)
          </div>
          <button
            className="secondary-btn"
            onClick={handleClearSelection}
            disabled={!selectedTicket || isBusy}
          >
            선택 표시 초기화
          </button>
        </div>

        {selectedTicket ? (
          <div className="selection-box">
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
          </div>
        ) : (
          <p style={{ margin: 0, color: "#6b7280" }}>
            아직 선택된 티켓이 없습니다. 티켓 카드의 "입장하기" 버튼을 눌러 주세요.
          </p>
        )}
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
            최근 액션 로그 (최신순)
          </div>
          <button
            className="secondary-btn"
            onClick={handleClearLogs}
            disabled={actionLogs.length === 0 || isBusy}
          >
            로그 비우기
          </button>
        </div>

        {actionLogs.length === 0 ? (
          <p style={{ margin: 0, color: "#6b7280" }}>아직 액션 로그가 없습니다.</p>
        ) : (
          <div className="log-list">
            {actionLogs.map((log, idx) => (
              <div key={`${log.at}-${idx}`} className="log-item">
                <div className="log-row">
                  <span className="label">시간</span>
                  <span>{formatTime(log.at)}</span>
                </div>
                <div className="log-row">
                  <span className="label">유형</span>
                  <span
                    className={
                      log.type === "success"
                        ? "log-approved"
                        : log.type === "error"
                        ? "log-denied"
                        : ""
                    }
                  >
                    {log.type === "success" ? "성공" : log.type === "error" ? "오류" : "정보"}
                  </span>
                </div>
                <div className="log-row">
                  <span className="label">내용</span>
                  <span>{log.message}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {isLoadingTickets ? (
        <div className="panel">
          <p style={{ margin: 0 }}>티켓 목록을 불러오는 중...</p>
        </div>
      ) : tickets.length === 0 ? (
        <div className="panel">
          <p style={{ margin: 0, color: "#6b7280" }}>보유한 티켓이 없습니다.</p>
        </div>
      ) : (
        <div className="ticket-grid">
          {tickets.map((ticket) => (
            <TicketCard key={ticket.tokenId} ticket={ticket} onEnter={handleEnter} />
          ))}
        </div>
      )}
    </section>
  );
}