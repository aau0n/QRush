import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ethers } from 'ethers';
import QRCodePanel from '../components/QRCodePanel.jsx';
import { mintTicket, verifyVp } from '../api/qrushApi.js';
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
  const handledCallback = useRef(false);

  // 예매 QR — MetaMask 모바일 딥링크로 감싼다. 아이폰에서 그냥 http 링크면
  // Safari로 열려 지갑 서명이 안 되므로, link.metamask.io로 감싸 MetaMask 앱 내
  // 브라우저에서 D 웹앱(/vp)이 열리게 한다.
  //   https://link.metamask.io/dapp/<host:port>/vp?...   (/dapp/ 뒤엔 scheme 없음)
  // callback은 같은 WiFi에서 접근 가능한 IP여야 함(window.location.origin = 접속한 IP).
  const deeplink = useMemo(() => {
    const params = new URLSearchParams({
      eventId: event.id,
      seat: selectedSeat,
      callback: `${window.location.origin}/booking`,
    });
    const dappHost = DAPP_BASE_URL.replace(/^https?:\/\//, ''); // 192.168.0.20:5174
    return `https://link.metamask.io/dapp/${dappHost}/vp?${params.toString()}`;
  }, [event.id, selectedSeat]);

  // verify-vp → mint-ticket (수동 제출과 callback 자동 제출이 공유)
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

  // D가 서명 후 callback?vp=..&signature=..&eventId=..&seat=.. 로 돌아옴.
  // vp/signature가 있으면 자동으로 읽어 폼을 채우고 제출까지 실행한다.
  useEffect(() => {
    if (handledCallback.current) return;
    const q = new URLSearchParams(window.location.search);
    const vpParam = q.get('vp');
    const sigParam = q.get('signature');
    if (!vpParam || !sigParam) return;

    handledCallback.current = true;
    let parsed;
    try {
      parsed = JSON.parse(vpParam);
    } catch {
      return;
    }

    // 민감 파라미터(vp/signature)는 URL에서 제거 — 새로고침 재제출 방지.
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

  return (
    <section className="content-stack">
      <div className="page-header">
        <p className="eyebrow">03 Booking</p>
        <h2>좌석 선택과 예매 처리</h2>
        <p>좌석을 선택하고 QR로 예매를 진행하세요.</p>
      </div>

      <div className="two-column wide-left">
        <section className="panel">
          <div className="section-title">
            <h3>{event.title}</h3>
            <span>
              {event.date} {event.time} / {event.venue}
            </span>
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

          <div className="booking-actions">
            <button className="secondary-button" onClick={connectWallet} type="button">
              {walletAddress
                ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
                : '지갑 연결'}
            </button>
          </div>
        </section>

        <section className="panel">
          <QRCodePanel label="D 앱으로 스캔할 VP 생성 QR" value={deeplink} />
          <pre>{deeplink}</pre>
          <p className="hint-text">
            폰의 MetaMask 앱 내 브라우저로 이 링크를 열면 VP 서명 후 자동으로 돌아옵니다.
          </p>
        </section>
      </div>

      <section className="panel form-panel">
        <div className="section-title">
          <h3>VP 검증 + 티켓 발급</h3>
          <span>수동 붙여넣기</span>
        </div>

        <p className="disclosure-note">
          🪪 <strong>예매 단계는 본인확인을 위해 이름·나이를 선택적으로 공개</strong>합니다.
          (입장 단계는 영지식 증명 — 신원을 전혀 공개하지 않습니다.)
        </p>

        {received && (
          <div className="status-row success">
            <span>D 앱에서 VP·서명 수신 — 자동 검증·발급 진행</span>
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
