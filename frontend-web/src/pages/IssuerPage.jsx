import { useState } from 'react';
import QRCodePanel from '../components/QRCodePanel.jsx';
import { registerVcHash } from '../api/qrushApi.js';
import { computeVcHash, randomId, randomVcSecret, stableJson, toYyyymmdd } from '../utils/hash.js';
import { loadIssuedVcs, saveIssuedVcs } from '../utils/vcStore.js';
import { DAPP_BASE_URL, ISSUER_ADDRESS, IS_MOCK } from '../config.js';

const initialForm = {
  name: '',
  birthdate: '',
  subject: '',
};

function toBase64Url(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export default function IssuerPage() {
  const [form, setForm] = useState(initialForm);
  const [history, setHistory] = useState(loadIssuedVcs);
  const [selectedId, setSelectedId] = useState(() => loadIssuedVcs()[0]?.id || null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  const issued = history.find((credential) => credential.id === selectedId) || null;

  const persist = (next) => {
    setHistory(next);
    saveIssuedVcs(next);
  };

  const updateForm = (event) => {
    setForm((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
  };

  const issueVc = async (event) => {
    event.preventDefault();
    setStatus('loading');
    setError('');

    try {
      const vcSecret = randomVcSecret();
      const birthdateNum = toYyyymmdd(form.birthdate);
      const vcHash = computeVcHash(birthdateNum, vcSecret);

      const vc = {
        '@context': ['https://www.w3.org/2018/credentials/v1'],
        type: ['VerifiableCredential', 'QRushIdentityCredential'],
        issuer: ISSUER_ADDRESS,
        issuanceDate: new Date().toISOString(),
        credentialSubject: {
          id: form.subject.trim(),
          name: form.name.trim(),
          birthdate: form.birthdate,
        },
      };

      const result = await registerVcHash({ vcHash, issuer: ISSUER_ADDRESS });

      const credential = {
        id: randomId(),
        issuedAt: new Date().toISOString(),
        vc,
        issuer: ISSUER_ADDRESS,
        vcHash,
        vcSecret,
        birthdate: String(birthdateNum),
        registerTxHash: result.txHash,
      };

      persist([credential, ...history]);
      setSelectedId(credential.id);
      setForm(initialForm);
      setStatus('done');
    } catch (nextError) {
      setError(nextError.message || 'VC 발급에 실패했습니다.');
      setStatus('error');
    }
  };

  const removeVc = (id) => {
    const next = history.filter((credential) => credential.id !== id);
    persist(next);
    if (selectedId === id) setSelectedId(next[0]?.id || null);
  };

  const clearAll = () => {
    persist([]);
    setSelectedId(null);
  };

  const credentialPayload = issued
    ? {
        vc: issued.vc,
        issuer: issued.issuer,
        vcHash: issued.vcHash,
        vcSecret: issued.vcSecret,
        birthdate: issued.birthdate,
        registerTxHash: issued.registerTxHash,
      }
    : null;
  const credentialJson = credentialPayload ? stableJson(credentialPayload) : '';
  const credentialQrLink = credentialPayload
    ? `${DAPP_BASE_URL}/vc?payload64=${toBase64Url(JSON.stringify(credentialPayload))}`
    : '';

  return (
    <section className="content-stack">
      <div className="page-header">
        <p className="eyebrow">01 VC Issuer</p>
        <h2>VC 발급 시뮬레이터</h2>
        <p>
          관람객의 신원 정보를 등록하고 VC를 발급합니다. 서버에는 vcHash만 등록하고,
          원본 생년월일과 vcSecret은 D 앱으로 전달합니다.
        </p>
      </div>

      <div className="two-column">
        <form className="panel form-panel" onSubmit={issueVc}>
          <label>
            이름
            <input
              name="name"
              onChange={updateForm}
              placeholder="홍길동"
              required
              type="text"
              value={form.name}
            />
          </label>

          <label>
            생년월일
            <input
              name="birthdate"
              onChange={updateForm}
              required
              type="date"
              value={form.birthdate}
            />
          </label>

          <label>
            DID 또는 지갑 주소
            <input
              name="subject"
              onChange={updateForm}
              placeholder="did:qrush:user-abc123 또는 0x..."
              required
              type="text"
              value={form.subject}
            />
          </label>

          <button className="primary-button" disabled={status === 'loading'} type="submit">
            {status === 'loading' ? '발급 중' : 'VC 발급하기'}
          </button>

          <p className="hint-text">
            발급기관 주소(issuer): <code>{ISSUER_ADDRESS}</code>
            {IS_MOCK && ' · 현재 mock 모드'}
          </p>

          {error && <p className="error-text">{error}</p>}
        </form>

        <div className="panel result-panel">
          {issued ? (
            <>
              <div className="status-row success">
                <span>VC 발급 + vcHash 등록 완료</span>
                <code>{issued.vcHash.slice(0, 18)}...</code>
              </div>
              <QRCodePanel label="D 앱으로 열어 VC 저장" value={credentialQrLink} />
            </>
          ) : (
            <div className="empty-state">
              <h3>아직 발급된 VC가 없습니다</h3>
              <p>폼을 입력하고 발급하면 QR과 JSON이 여기에 표시됩니다.</p>
            </div>
          )}
        </div>
      </div>

      {history.length > 0 && (
        <section className="panel">
          <div className="section-title">
            <h3>발급 이력 ({history.length})</h3>
            <button className="link-button" onClick={clearAll} type="button">
              전체 삭제
            </button>
          </div>
          <div className="vc-history">
            {history.map((credential) => (
              <div
                className={credential.id === selectedId ? 'vc-history-item active' : 'vc-history-item'}
                key={credential.id}
              >
                <button className="vc-history-main" onClick={() => setSelectedId(credential.id)} type="button">
                  <strong>{credential.vc?.credentialSubject?.name || '(이름 없음)'}</strong>
                  <span>{credential.vc?.credentialSubject?.birthdate}</span>
                  <code>{credential.vcHash.slice(0, 14)}...</code>
                  <small>{new Date(credential.issuedAt).toLocaleString()}</small>
                </button>
                <button className="vc-history-del" onClick={() => removeVc(credential.id)} type="button">
                  삭제
                </button>
              </div>
            ))}
          </div>
          <p className="hint-text">발급된 VC는 현재 브라우저에 저장되며, 새로고침 후에도 유지됩니다.</p>
        </section>
      )}

      {issued && (
        <section className="panel">
          <div className="section-title">
            <h3>발급 결과</h3>
            <span>vcSecret, birthdate, vcHash가 D 앱 proof 입력에 그대로 쓰입니다.</span>
          </div>
          <dl className="kv-list">
            <div>
              <dt>vcHash (십진)</dt>
              <dd>
                <code>{issued.vcHash}</code>
              </dd>
            </div>
            <div>
              <dt>등록 txHash</dt>
              <dd>
                <code>{issued.registerTxHash || '(mock)'}</code>
              </dd>
            </div>
          </dl>
          <p className="disclosure-note">
            서버에는 <strong>vcHash만 등록</strong>합니다. 원본 생년월일과 vcSecret은 사용자 기기에만
            저장됩니다.
          </p>
          <pre>{credentialJson}</pre>
        </section>
      )}
    </section>
  );
}
