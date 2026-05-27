import { useCallback, useEffect, useMemo, useState } from 'react';
import QRCodePanel from '../components/QRCodePanel.jsx';
import { generateNonce } from '../api/qrushApi.js';

export default function GatePage() {
  const [nonce, setNonce] = useState('');
  const [countdown, setCountdown] = useState(30);
  const [status, setStatus] = useState('waiting');
  const [loading, setLoading] = useState(false);

  const refreshNonce = useCallback(async () => {
    setLoading(true);
    const result = await generateNonce();
    setNonce(result.nonce);
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
          return 30;
        }

        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [nonce, refreshNonce, status]);

  const qrPayload = useMemo(
    () =>
      JSON.stringify({
        type: 'QRushGateChallenge',
        nonce,
        endpoint: '/verify-proof',
        expiresIn: countdown,
      }),
    [countdown, nonce],
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
      </aside>
    </section>
  );
}
