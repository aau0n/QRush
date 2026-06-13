import { useCallback, useEffect, useMemo, useState } from 'react';
import QRCodePanel from '../components/QRCodePanel.jsx';
import { generateNonce } from '../api/qrushApi.js';
import { verifyProofUrl, IS_MOCK } from '../config.js';

export default function GatePage() {
  const [nonce, setNonce] = useState('');
  const [expiresIn, setExpiresIn] = useState(30); // nonce 1개의 유효시간(고정)
  const [countdown, setCountdown] = useState(30); // 화면 표시용
  const [status, setStatus] = useState('waiting');
  const [loading, setLoading] = useState(false);

  const refreshNonce = useCallback(async () => {
    setLoading(true);
    const result = await generateNonce();
    setNonce(result.nonce);
    setExpiresIn(result.expiresIn || 30);
    setCountdown(result.expiresIn || 30);
    setStatus('waiting');
    setLoading(false);
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(refreshNonce, 0);
    return () => window.clearTimeout(timeoutId);
  }, [refreshNonce]);

  useEffect(() => {
    if (!nonce || status !== 'waiting') return undefined;

    const timer = window.setInterval(() => {
      setCountdown((current) => {
        if (current <= 1) {
          refreshNonce();
          return expiresIn;
        }

        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [nonce, refreshNonce, status, expiresIn]);

  // QR 페이로드는 nonce당 고정 — countdown은 넣지 않아 매초 재생성되지 않는다.
  // D 앱이 그대로 파싱: nonce(hex) + proof를 POST할 절대 endpoint.
  const qrPayload = useMemo(
    () =>
      JSON.stringify({
        type: 'QRushGateChallenge',
        nonce,
        endpoint: verifyProofUrl(),
        expiresIn,
      }),
    [expiresIn, nonce],
  );

  return (
    <section className="gate-layout">
      <div className="gate-main">
        <p className="eyebrow">04 Gate Terminal</p>
        <h2>게이트 단말기</h2>
        <p>개인정보를 표시하지 않고 nonce QR과 검증 결과만 보여줍니다.</p>

        <div className="gate-qr">
          <QRCodePanel label="D 앱에서 스캔할 입장 nonce QR" value={qrPayload} />
          <div className="countdown">
            <span>{loading ? '--' : countdown}</span>
            <small>초 후 새 nonce</small>
          </div>
        </div>

        <div className="nonce-box">
          <span>nonce</span>
          <code>{nonce || '생성 중'}</code>
        </div>
        <p className="hint-text">
          proof 수신 endpoint: <code>{verifyProofUrl() || '(서버 미설정 — mock)'}</code>
        </p>
      </div>

      <aside className={`gate-status ${status}`}>
        {status === 'waiting' && (
          <>
            <span>WAITING</span>
            <strong>증명 대기 중</strong>
          </>
        )}
        {status === 'allowed' && (
          <>
            <span>ALLOWED</span>
            <strong>입장 가능</strong>
          </>
        )}
        {status === 'denied' && (
          <>
            <span>DENIED</span>
            <strong>입장 불가</strong>
          </>
        )}

        <div className="gate-controls">
          <button className="secondary-button" onClick={() => setStatus('allowed')} type="button">
            mock 성공 수신
          </button>
          <button className="secondary-button" onClick={() => setStatus('denied')} type="button">
            mock 실패 수신
          </button>
          <button className="secondary-button" onClick={refreshNonce} type="button">
            nonce 재발급
          </button>
        </div>
        {!IS_MOCK && (
          <p className="hint-text">
            ※ 실서버 모드에선 D가 proof를 위 endpoint로 직접 전송합니다. 게이트 결과 실시간
            표시는 A의 결과조회/푸시 API가 정해지면 연결하세요(아래 설명).
          </p>
        )}
      </aside>
    </section>
  );
}
