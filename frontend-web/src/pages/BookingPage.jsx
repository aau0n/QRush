import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ethers } from 'ethers';
import QRCodePanel from '../components/QRCodePanel.jsx';
import { createBookingSession, getBookingSessionResult, mintTicket, verifyVp } from '../api/qrushApi.js';
import { mockEvents, seatRows } from '../data/mockData.js';
import { DAPP_BASE_URL } from '../config.js';

// "2003-04-15" → 만 나이(정수)
function calcAge(birthdateStr) {
  if (!birthdateStr) return 0;
  const b = new Date(birthdateStr);
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age -= 1;
  return age;
}

function matchTeams(title) {
  if (!title || !title.includes('vs')) return null;
  const [a, b] = title.split(/\s*vs\s*/);
  return { a: a?.trim(), b: b?.trim() };
}

function gradIndex(id) {
  const n = parseInt(String(id).replace(/\D/g, ''), 10) || 0;
  return n % 6;
}

function encodePayload64(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodePayload64(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export default function BookingPage() {
  const query = new URLSearchParams(window.location.search);
  const eventId = query.get('eventId') || mockEvents[0].id;
  const event = mockEvents.find((item) => item.id === eventId) || mockEvents[0];
  const [walletAddress, setWalletAddress] = useState('');
  const [selectedSeat, setSelectedSeat] = useState(query.get('seat') || 'A1');
  const [credentialText, setCredentialText] = useState('');
  const [vpText, setVpText] = useState('');
  const [signature, setSignature] = useState('');
  const [bookingResult, setBookingResult] = useState(null);
  const [status, setStatus] = useState('idle');
  const [received, setReceived] = useState(false);
  const [bookingSession, setBookingSession] = useState(null);
  const [sessionError, setSessionError] = useState('');
  const handledCallback = useRef(false);

  useEffect(() => {
    let active = true;

    const timer = window.setTimeout(async () => {
      setBookingSession(null);
      setSessionError('');
      setReceived(false);
      setBookingResult(null);
      setStatus('idle');

      try {
        const session = await createBookingSession({ eventId: event.id, seatId: selectedSeat });
        if (!active) return;
        setBookingSession(session);
      } catch (error) {
        if (!active) return;
        setSessionError(error.message || '예매 세션 생성에 실패했습니다.');
      }
    }, 0);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [event.id, selectedSeat]);

  useEffect(() => {
    if (!bookingSession?.sessionId) return undefined;

    const poll = window.setInterval(async () => {
      try {
        const result = await getBookingSessionResult(bookingSession.sessionId);
        if (!result.decided) return;

        setReceived(true);
        setStatus('done');
        setBookingResult(
          result.success
            ? {
                ok: true,
                tokenId: result.tokenId,
                txHash: result.txHash,
                message: '예매가 완료되었습니다.',
                checks: result.checks,
              }
            : {
                ok: false,
                message: result.reason || result.error || '예매 처리 실패',
                checks: result.checks,
              },
        );
        window.clearInterval(poll);
      } catch (error) {
        setSessionError(error.message || '예매 결과 확인에 실패했습니다.');
      }
    }, 1500);

    return () => window.clearInterval(poll);
  }, [bookingSession?.sessionId]);

  // 예매 QR — PC가 만든 booking session payload를 D 앱(/vp) URL 안에 담는다.
  // 폰 앱은 VP+서명을 submitEndpoint로 POST하고, PC 예매 페이지는 resultEndpoint를 폴링한다.
  const deeplink = useMemo(() => {
    if (!bookingSession) return '';

    const sessionPayload = {
      type: 'QRushBookingSession',
      sessionId: bookingSession.sessionId,
      submitEndpoint: bookingSession.submitEndpoint,
      resultEndpoint: bookingSession.resultEndpoint,
      eventId: bookingSession.eventId || event.id,
      seatId: bookingSession.seatId || selectedSeat,
      expiresIn: bookingSession.expiresIn,
    };

    const params = new URLSearchParams({
      session64: encodePayload64(JSON.stringify(sessionPayload)),
    });
    return `${DAPP_BASE_URL}/vp?${params.toString()}`;
  }, [bookingSession, event.id, selectedSeat]);

  // verify-vp → mint-ticket (셀프 테스트/이전 URL fallback용)
  const runBooking = useCallback(
    async (parsedVp, sig) => {
      setStatus('loading');
      setBookingResult(null);
      try {
        const verifyResult = await verifyVp(parsedVp, sig);
        if (!verifyResult.verified) {
          setBookingResult({ ok: false, message: verifyResult.reason || 'VP 검증 실패' });
          setStatus('done');
          return;
        }

        const mintResult = await mintTicket({
          eventId: event.id,
          seatId: selectedSeat,
          buyerWallet: verifyResult.holder || parsedVp.holder,
        });

        setBookingResult({
          ok: true,
          tokenId: mintResult.tokenId,
          txHash: mintResult.txHash,
          message: '예매가 완료되었습니다.',
        });
        setStatus('done');
      } catch (error) {
        setBookingResult({ ok: false, message: error.message || '예매 처리 실패' });
        setStatus('done');
      }
    },
    [event.id, selectedSeat],
  );

  // 이전 방식 URL fallback: vp/signature가 있으면 폼을 채우고 제출까지 실행한다.
  useEffect(() => {
    if (handledCallback.current) return;
    const q = new URLSearchParams(window.location.search);
    const encodedVpParam = q.get('vp64');
    const rawVpParam = q.get('vp');
    const sigParam = q.get('signature');
    if ((!encodedVpParam && !rawVpParam) || !sigParam) return;

    handledCallback.current = true;
    let parsed;
    try {
      const vpParam = encodedVpParam ? decodePayload64(encodedVpParam) : rawVpParam;
      parsed = JSON.parse(vpParam);
    } catch {
      const t = window.setTimeout(() => {
        setBookingResult({ ok: false, message: 'D 앱에서 받은 VP JSON을 읽지 못했습니다.' });
        setStatus('done');
      }, 0);
      return () => window.clearTimeout(t);
    }

    // 민감 파라미터(vp64/signature)는 URL에서 제거 — 새로고침 재제출 방지.
    const clean = new URLSearchParams({ eventId, seat: q.get('seat') || selectedSeat });
    window.history.replaceState({}, '', `/booking?${clean.toString()}`);

    // 상태 변경/제출은 커밋 이후로 미룬다(set-state-in-effect 회피).
    const t = window.setTimeout(() => {
      setVpText(JSON.stringify(parsed, null, 2));
      setSignature(sigParam);
      setReceived(true);
      runBooking(parsed, sigParam);
    }, 0);
    return () => window.clearTimeout(t);
  }, [runBooking, eventId, selectedSeat]);

  const connectWallet = async () => {
    if (!window.ethereum) {
      alert('MetaMask를 설치하거나 지갑 브라우저에서 열어주세요.');
      return;
    }

    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    setWalletAddress(accounts[0]);
  };

  // 발급 페이지에서 만든 credential JSON을 붙여넣고 → A 명세 형태의 VP를
  // MetaMask로 서명. 서명 대상은 compact JSON.stringify(vp) (D 앱과 동일).
  const signVpFromCredential = async () => {
    if (!window.ethereum) {
      alert('MetaMask가 필요합니다.');
      return;
    }

    let credential;
    try {
      credential = JSON.parse(credentialText);
    } catch {
      alert('발급 페이지의 VC JSON을 그대로 붙여넣어 주세요.');
      return;
    }

    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const holder = walletAddress || (await signer.getAddress());
    const subject = credential.vc?.credentialSubject || {};

    // ⚠️ 키 순서 고정: holder, did, issuer, vcHash, claims{ name, age }
    const vp = {
      holder,
      did: subject.id || holder,
      issuer: credential.issuer,
      vcHash: credential.vcHash,
      claims: {
        name: subject.name,
        age: calcAge(subject.birthdate),
      },
    };

    const sig = await signer.signMessage(JSON.stringify(vp));

    setWalletAddress(holder);
    setVpText(JSON.stringify(vp, null, 2));
    setSignature(sig);
  };

  const submitBooking = () => {
    let parsedVp;
    try {
      parsedVp = JSON.parse(vpText);
    } catch {
      setBookingResult({ ok: false, message: 'VP JSON 형식이 올바르지 않습니다.' });
      setStatus('done');
      return;
    }
    runBooking(parsedVp, signature);
  };

  const teams = matchTeams(event.title);
  const gradIdx = gradIndex(event.id);

  return (
    <section className="content-stack booking-page">
      <div className="booking-hero">
        <div className={`booking-hero-poster grad-${gradIdx}`}>
          {teams ? (
            <>
              <b>{teams.a}</b>
              <em>VS</em>
              <b>{teams.b}</b>
            </>
          ) : (
            <b className="poster-round">R16</b>
          )}
        </div>
        <div className="booking-hero-info">
          <span className="badge-sport">스포츠 · 축구</span>
          <h2>{event.title}</h2>
          <p>
            {event.date} {event.time} · {event.venue}
          </p>
          <strong className="hero-price">{event.price}</strong>
        </div>
      </div>

      <div className="booking-grid">
        <section className="panel seat-panel">
          <div className="section-title">
            <h3>좌석 선택</h3>
            <span>원하는 좌석을 선택하세요</span>
          </div>

          <div className="screen-marker">STAGE</div>
          <div className="seat-map" aria-label="좌석 선택">
            {seatRows.map((row) =>
              Array.from({ length: 6 }, (_, index) => {
                const seat = `${row}${index + 1}`;
                return (
                  <button
                    className={selectedSeat === seat ? 'seat selected' : 'seat'}
                    key={seat}
                    onClick={() => setSelectedSeat(seat)}
                    type="button"
                  >
                    {seat}
                  </button>
                );
              }),
            )}
          </div>

          <div className="seat-legend">
            <span><i className="seat-dot avail" />선택 가능</span>
            <span><i className="seat-dot sel" />선택한 좌석</span>
          </div>
        </section>

        <aside className="panel booking-summary">
          <h3>예매 정보</h3>
          <dl className="summary-list">
            <div>
              <dt>경기</dt>
              <dd>{event.title}</dd>
            </div>
            <div>
              <dt>일시</dt>
              <dd>
                {event.date} {event.time}
              </dd>
            </div>
            <div>
              <dt>장소</dt>
              <dd>{event.venue}</dd>
            </div>
            <div>
              <dt>선택 좌석</dt>
              <dd className="summary-seat">{selectedSeat}</dd>
            </div>
          </dl>
          <div className="summary-total">
            <span>결제 금액</span>
            <strong>{event.price}</strong>
          </div>
          <button className="secondary-button full" onClick={connectWallet} type="button">
            {walletAddress
              ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
              : '지갑 연결'}
          </button>
          <div className="summary-qr">
            <QRCodePanel label="D 앱으로 스캔할 VP 생성 QR" value={deeplink} />
            <p className="hint-text">
              {bookingSession
                ? `세션 ${bookingSession.sessionId} 대기 중 · 폰에서 제출하면 PC 화면이 자동 갱신됩니다.`
                : '예매 세션을 준비하고 있습니다.'}
            </p>
            {sessionError && <p className="error-text">{sessionError}</p>}
          </div>
        </aside>
      </div>

      <section className="panel form-panel">
        <div className="section-title">
          <h3>VP 검증 + 티켓 발급</h3>
          <span>PC는 세션 결과를 자동으로 기다립니다</span>
        </div>

        <p className="disclosure-note">
          🪪 <strong>예매 단계는 본인확인을 위해 이름·나이를 선택적으로 공개</strong>합니다.
          (입장 단계는 영지식 증명 — 신원을 전혀 공개하지 않습니다.)
        </p>

        {received && (
          <div className="status-row success">
            <span>D 앱 제출 결과 수신 — 예매 상태 갱신 완료</span>
          </div>
        )}

        {!received && bookingSession && (
          <div className="status-row">
            <span>폰 D 앱에서 VP를 제출할 때까지 대기 중입니다.</span>
          </div>
        )}

        <label>
          (셀프 테스트) 발급 페이지 VC JSON 붙여넣기
          <textarea
            onChange={(event) => setCredentialText(event.target.value)}
            placeholder='{"vc":{...},"issuer":"0x...","vcHash":"...","vcSecret":"..."}'
            rows={4}
            value={credentialText}
          />
        </label>
        <div className="booking-actions">
          <button className="secondary-button" onClick={signVpFromCredential} type="button">
            MetaMask로 VP 서명 생성
          </button>
        </div>

        <label>
          VP JSON
          <textarea
            onChange={(event) => setVpText(event.target.value)}
            placeholder='{"holder":"0x...","did":"did:qrush:...","issuer":"0x...","vcHash":"...","claims":{"name":"홍길동","age":23}}'
            rows={8}
            value={vpText}
          />
        </label>

        <label>
          Signature
          <input
            onChange={(event) => setSignature(event.target.value)}
            placeholder="0x..."
            type="text"
            value={signature}
          />
        </label>

        <button
          className="primary-button"
          disabled={status === 'loading' || !vpText || !signature}
          onClick={submitBooking}
          type="button"
        >
          {status === 'loading' ? '처리 중' : '검증하고 티켓 발급'}
        </button>

        {bookingResult && (
          <div className={bookingResult.ok ? 'status-box allowed' : 'status-box denied'}>
            <h3>{bookingResult.message}</h3>
            {bookingResult.ok && (
              <ul className="vp-checklist">
                <li>✓ 발급기관이 신뢰할 수 있는 기관인가 <small>(IssuerRegistry)</small></li>
                <li>✓ VC가 위·변조되지 않았는가 <small>(VCRegistry)</small></li>
                <li>✓ VP 제출자가 본인이 맞는가 <small>(서명 ecrecover)</small></li>
              </ul>
            )}
            {bookingResult.tokenId && <p>tokenId: {bookingResult.tokenId}</p>}
            {bookingResult.txHash && <code>{bookingResult.txHash}</code>}
          </div>
        )}
      </section>
    </section>
  );
}
