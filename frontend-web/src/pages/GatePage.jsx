import { useCallback, useEffect, useMemo, useState } from 'react';
import QRCodePanel from '../components/QRCodePanel.jsx';
import { generateNonce, getGateResult } from '../api/qrushApi.js';
import { verifyProofUrl, DAPP_BASE_URL, IS_MOCK } from '../config.js';

// 긴 field 값을 화면용으로 축약
const short = (v) => (v && String(v).length > 16 ? `${String(v).slice(0, 10)}…${String(v).slice(-4)}` : v);
const todayYmd = () => new Date().toISOString().slice(0, 10).replaceAll('-', '');

export default function GatePage() {
  const [nonce, setNonce] = useState(''); // 십진 field (canonical) — D가 proof/verify-proof에 사용
  const [nonceHex, setNonceHex] = useState(''); // hex (표시/참조용)
  const [expiresIn, setExpiresIn] = useState(30); // nonce 1개의 유효시간(고정)
  const [countdown, setCountdown] = useState(30); // 화면 표시용
  const [status, setStatus] = useState('waiting');
  const [result, setResult] = useState(null); // { entry, reason, publicSignals }
  const [loading, setLoading] = useState(false);

  const refreshNonce = useCallback(async () => {
    setLoading(true);
    setResult(null);
    const r = await generateNonce();
    setNonce(r.nonce);
    setNonceHex(r.nonceHex || '');
    setExpiresIn(r.expiresIn || 30);
    setCountdown(r.expiresIn || 30);
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

  // 실서버 모드: A의 결과 저장소를 nonce로 폴링해 초록/빨강 + publicSignals 표시.
  // 엔드포인트 미구현 시엔 decided:false라 조용히 대기 유지(아래 데모 버튼으로 폴백).
  useEffect(() => {
    if (IS_MOCK || !nonce || status !== 'waiting') return undefined;

    const poll = window.setInterval(async () => {
      const r = await getGateResult(nonce);
      if (r.decided) {
        setResult({ entry: r.entry, reason: r.reason, publicSignals: r.publicSignals });
        setStatus(r.entry ? 'allowed' : 'denied');
      }
    }, 1500);

    return () => window.clearInterval(poll);
  }, [nonce, status]);

  // 결과 표시 후 잠시 뒤 새 nonce로 자동 리셋 — 다음 입장자를 받는다.
  useEffect(() => {
    if (status !== 'allowed' && status !== 'denied') return undefined;
    const resetId = window.setTimeout(() => refreshNonce(), 6000);
    return () => window.clearTimeout(resetId);
  }, [status, refreshNonce]);

  // 입장 QR — D 웹앱 /entry로 들어가는 HTTP 링크.
  // http://<D_APP_HOST>:5174/entry?nonce=<십진>&endpoint=<encoded verify-proof>&expiresIn=30
  // D는 nonce(십진 field)를 proof input + verify-proof body에 그대로 사용(nonceHex 미사용).
  const qrPayload = useMemo(() => {
    const params = new URLSearchParams({
      nonce,
      endpoint: verifyProofUrl(),
      expiresIn: String(expiresIn),
    });
    return `${DAPP_BASE_URL}/entry?${params.toString()}`;
  }, [expiresIn, nonce]);

  // 데모용 합성 publicSignals — 실서버에서 값이 안 와도 패널을 채워 보여준다.
  const demoSignals = () => ['1', '14872035981143377240118…', nonce || '0', '1', todayYmd()];

  const demoAllow = () => {
    setResult({ entry: true, reason: '', publicSignals: demoSignals() });
    setStatus('allowed');
  };
  const demoReplay = () => {
    setResult({ entry: false, reason: '이미 사용된 nonce — 재사용(리플레이) 공격 차단', publicSignals: demoSignals() });
    setStatus('denied');
  };
  const demoExpired = () => {
    setResult({ entry: false, reason: '만료된 nonce — 30초 유효시간 초과', publicSignals: null });
    setStatus('denied');
  };

  // 검증자가 '본 것' = publicSignals만. 그 외 신원정보는 전송되지 않음.
  const ps = result?.publicSignals;
  const seen = ps
    ? [
        { label: '만 19세 이상', val: ps[0] === '1' || ps[0] === 1 ? '✓ 충족' : '✗ 미충족' },
        { label: '신원 커밋먼트(vcHash)', val: short(ps[1]), note: '해시 — 원본 복원 불가' },
        { label: '1회용 nonce', val: short(ps[2]), note: '재사용 불가' },
        { label: '티켓 번호(tokenId)', val: ps[3] },
        { label: '검증 일자', val: ps[4] },
      ]
    : [];
  const notSeen = ['이름', '생년월일', '지갑 주소', '누구인지(신원)', 'vcSecret', '개인키'];

  return (
    <section className="gate-layout">
      <div className="gate-main">
        <p className="eyebrow">04 Gate Terminal</p>
        <h2>게이트 단말기</h2>
        <p>개인정보를 표시·전송하지 않고, 영지식 증명으로 입장 자격만 검증합니다.</p>

        <div className="privacy-badge">🔒 이 단말기는 입장자의 신원을 저장·표시하지 않습니다</div>

        <div className="gate-qr">
          <QRCodePanel label="D 앱에서 스캔할 입장 nonce QR" value={qrPayload} />
          <div className="countdown">
            <span>{loading ? '--' : countdown}</span>
            <small>초 후 새 nonce</small>
          </div>
        </div>

        <div className="nonce-box">
          <span>nonce (hex 표시 · QR엔 십진 field)</span>
          <code>{nonceHex || nonce || '생성 중'}</code>
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
            {result?.reason && <p className="deny-reason">{result.reason}</p>}
          </>
        )}

        {/* 검증자가 본 것 vs 못 본 것 — 영지식 핵심 */}
        {(status === 'allowed' || status === 'denied') && (
          <div className="reveal-grid">
            <div className="reveal-col seen">
              <h4>서버가 본 것</h4>
              {seen.length > 0 ? (
                seen.map((s) => (
                  <div className="reveal-item" key={s.label}>
                    <span className="reveal-label">{s.label}</span>
                    <code>{s.val}</code>
                    {s.note && <small>{s.note}</small>}
                  </div>
                ))
              ) : (
                <p className="hint-text">publicSignals [isAdult, vcHash, nonce, tokenId, currentDate]</p>
              )}
            </div>
            <div className="reveal-col hidden">
              <h4>서버가 못 본 것</h4>
              {notSeen.map((n) => (
                <div className="reveal-item" key={n}>
                  <span className="reveal-label">{n}</span>
                  <code>비공개</code>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="gate-controls">
          <button className="secondary-button" onClick={demoAllow} type="button">
            정상 입장(데모)
          </button>
          <button className="secondary-button" onClick={demoReplay} type="button">
            재사용 공격(데모)
          </button>
          <button className="secondary-button" onClick={demoExpired} type="button">
            nonce 만료(데모)
          </button>
          <button className="secondary-button" onClick={refreshNonce} type="button">
            nonce 재발급
          </button>
        </div>
        {!IS_MOCK && (
          <p className="hint-text">
            ※ D가 proof를 endpoint로 보내면 게이트는 <code>GET /api/gate/result/:nonce</code>를
            1.5초 간격 폴링해 결과+publicSignals를 표시합니다. (미구현 시 위 데모 버튼으로 폴백)
          </p>
        )}
      </aside>
    </section>
  );
}
