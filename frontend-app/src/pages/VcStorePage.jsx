import { useEffect, useState } from 'react';
import JsonPreview from '../components/JsonPreview.jsx';
import { clearVc, loadVc, saveVc } from '../services/storage.js';

function getSubjectName(payload) {
  return payload?.vc?.credentialSubject?.name || '-';
}

function getBirthdate(payload) {
  return payload?.vc?.credentialSubject?.birthdate || '-';
}

function getSubjectId(payload) {
  return payload?.vc?.credentialSubject?.id || '-';
}

function decodePayload64(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function getIncomingVcText() {
  try {
    const params = new URLSearchParams(window.location.search);
    const payload64 = params.get('payload64');
    if (payload64) return decodePayload64(payload64);

    return params.get('payload') || params.get('vc') || '';
  } catch {
    return '';
  }
}

function cleanVcPayloadFromUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete('payload64');
  url.searchParams.delete('payload');
  url.searchParams.delete('vc');
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

export default function VcStorePage() {
  const incomingVcText = getIncomingVcText();
  const [vcText, setVcText] = useState(incomingVcText);
  const [savedVc, setSavedVc] = useState(() => loadVc(null));
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!incomingVcText) return;

    let parsed;
    let errorMessage = '';
    try {
      parsed = JSON.parse(incomingVcText);

      if (!parsed.vc || !parsed.vcHash) {
        throw new Error('VC JSON은 { vc, vcHash } 구조여야 합니다.');
      }
    } catch (nextError) {
      errorMessage = nextError.message || 'VC QR 링크 처리에 실패했습니다.';
    }

    const timer = window.setTimeout(() => {
      if (errorMessage) {
        setError(errorMessage);
        setStatusMessage('');
        return;
      }

      saveVc(parsed);
      setSavedVc(parsed);
      setStatusMessage('VC QR 링크에서 VC를 읽고 지갑에 저장했습니다.');
      setError('');
      cleanVcPayloadFromUrl();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [incomingVcText]);

  const handleSave = () => {
    setError('');
    setStatusMessage('');

    try {
      const parsed = JSON.parse(vcText);

      if (!parsed.vc || !parsed.vcHash) {
        throw new Error('VC JSON은 { vc, vcHash } 구조여야 합니다.');
      }

      saveVc(parsed);
      setSavedVc(parsed);
      setStatusMessage('VC가 지갑에 저장되었습니다.');
    } catch (nextError) {
      setError(nextError.message || 'VC 저장에 실패했습니다.');
    }
  };

  const handleClear = () => {
    clearVc();
    setSavedVc(null);
    setStatusMessage('저장된 VC를 삭제했습니다.');
    setError('');
  };

  return (
    <section className="content-stack">
      <div className="page-header">
        <p className="eyebrow">02 VC Store</p>
        <h2>VC 수신 및 저장</h2>
        <p>
          C 웹의 VC 발급 화면에서 전달받은 VC JSON을 D 지갑에 저장하는 화면입니다.
          QR 링크 또는 JSON 붙여넣기로 VC를 저장합니다.
        </p>
      </div>

      <div className="two-column">
        <section className="panel form-panel">
          <div className="section-title">
            <h3>VC JSON 입력</h3>
            <span>C 웹 Issuer에서 나온 JSON을 붙여넣는 자리입니다.</span>
          </div>

          <label>
            VC Payload
            <textarea
              value={vcText}
              onChange={(event) => setVcText(event.target.value)}
              placeholder='{"vc": {...}, "vcHash": "..."}'
              rows={14}
            />
          </label>

          <div className="button-row">
            <button className="primary-button" type="button" onClick={handleSave} disabled={!vcText}>
              VC 저장하기
            </button>
            <button className="danger-button" type="button" onClick={handleClear} disabled={!savedVc}>
              저장 VC 삭제
            </button>
          </div>

          {statusMessage && <p className="success-text">{statusMessage}</p>}
          {error && <p className="error-text">{error}</p>}
        </section>

        <section className={savedVc ? 'panel status-panel success' : 'panel status-panel warning'}>
          <div>
            <h3>{savedVc ? 'VC 저장됨' : '저장된 VC 없음'}</h3>
            <p>
              {savedVc
                ? '이 VC는 VP 생성 및 입장 증명 생성에 사용됩니다.'
                : '먼저 VC JSON을 저장해야 VP 생성 흐름을 진행할 수 있습니다.'}
            </p>
          </div>
        </section>
      </div>

      {savedVc && (
        <section className="panel">
          <div className="section-title">
            <h3>저장된 VC 요약</h3>
            <span>지갑 내부에 저장된 신원 정보입니다.</span>
          </div>

          <div className="summary-grid">
            <div>
              <span>이름</span>
              <strong>{getSubjectName(savedVc)}</strong>
            </div>
            <div>
              <span>생년월일</span>
              <strong>{getBirthdate(savedVc)}</strong>
            </div>
            <div>
              <span>Subject DID</span>
              <strong>{getSubjectId(savedVc)}</strong>
            </div>
            <div>
              <span>VC Hash</span>
              <strong>{savedVc.vcHash}</strong>
            </div>
          </div>
        </section>
      )}

      <JsonPreview title="Saved VC Payload" data={savedVc} />
    </section>
  );
}
