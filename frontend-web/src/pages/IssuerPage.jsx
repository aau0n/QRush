import { useState } from 'react';
import QRCodePanel from '../components/QRCodePanel.jsx';
import { registerVcHash } from '../api/qrushApi.js';
import { computeVcHash, randomId, randomVcSecret, stableJson, toYyyymmdd } from '../utils/hash.js';
import { loadIssuedVcs, saveIssuedVcs } from '../utils/vcStore.js';
import { ISSUER_ADDRESS, IS_MOCK } from '../config.js';

const initialForm = {
  name: '',
  birthdate: '',
  subject: '',
};

export default function IssuerPage() {
  const [form, setForm] = useState(initialForm);
  const [history, setHistory] = useState(loadIssuedVcs); // localStorage에서 복원
  const [selectedId, setSelectedId] = useState(() => loadIssuedVcs()[0]?.id || null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  const issued = history.find((c) => c.id === selectedId) || null;

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
      // 1) vcSecret(랜덤 salt) 생성 + birthdate를 YYYYMMDD로 변환
      const vcSecret = randomVcSecret();
      const birthdateNum = toYyyymmdd(form.birthdate); // 20030415
      // 2) vcHash = Poseidon(birthdate, vcSecret) — D/체인과 동일한 값
      const vcHash = computeVcHash(birthdateNum, vcSecret);

      const vc = {
        '@context': ['https://www.w3.org/2018/credentials/v1'],
        type: ['VerifiableCredential', 'QRushIdentityCredential'],
        issuer: ISSUER_ADDRESS,
        issuanceDate: new Date().toISOString(),
        credentialSubject: {
          id: form.subject.trim(),
          name: form.name.trim(),
          birthdate: form.birthdate, // 사람이 읽는 형식
        },
      };

      // 3) A 서버에 vcHash(십진) + issuer(0x) 등록
      const result = await registerVcHash({ vcHash, issuer: ISSUER_ADDRESS });

      // 4) D 앱이 proof/VP를 만드는 데 필요한 모든 값을 한 객체로 — QR로 전달
      const credential = {
        id: randomId(),
        issuedAt: new Date().toISOString(),
        vc,
        issuer: ISSUER_ADDRESS,
        vcHash, // 십진 문자열
        vcSecret, // proof private input
        birthdate: String(birthdateNum), // YYYYMMDD, proof private input
        registerTxHash: result.txHash,
      };

      persist([credential, ...history]); // 최신을 맨 앞에
      setSelectedId(credential.id);
      setForm(initialForm);
      setStatus('done');
    } catch (nextError) {
      setError(nextError.message || 'VC 발급에 실패했습니다.');
      setStatus('error');
    }
  };

  const removeVc = (id) => {
    const next = history.filter((c) => c.id !== id);
    persist(next);
    if (selectedId === id) setSelectedId(next[0]?.id || null);
  };

  const clearAll = () => {
    persist([]);
    setSelectedId(null);
  };

  // QR/JSON에는 내부 메타(id, issuedAt)를 빼고 D에게 필요한 값만 담는다.
  const credentialJson = issued
    ? stableJson({
        vc: issued.vc,
        issuer: issued.issuer,
        vcHash: issued.vcHash,
        vcSecret: issued.vcSecret,
        birthdate: issued.birthdate,
        registerTxHash: issued.registerTxHash,
      })
    : '';

  return (
    <section className="content-stack">
      <div className="page-header">
        <p className="eyebrow">01 VC Issuer</p>
        <h2>VC 발급 시뮬레이션</h2>
        <p>관람객의 신원 정보를 등록하고 디지털 신분증(VC)을 발급합니다.</p>
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
                <code>{issued.vcHash.slice(0, 18)}…</code>
              </div>
              <QRCodePanel label="D 앱에서 스캔할 VC QR" value={credentialJson} />
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
            {history.map((c) => (
              <div
                className={c.id === selectedId ? 'vc-history-item active' : 'vc-history-item'}
                key={c.id}
              >
                <button className="vc-history-main" onClick={() => setSelectedId(c.id)} type="button">
                  <strong>{c.vc?.credentialSubject?.name || '(이름 없음)'}</strong>
                  <span>{c.vc?.credentialSubject?.birthdate}</span>
                  <code>{c.vcHash.slice(0, 14)}…</code>
                  <small>{new Date(c.issuedAt).toLocaleString()}</small>
                </button>
                <button className="vc-history-del" onClick={() => removeVc(c.id)} type="button">
                  삭제
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {issued && (
        <section className="panel">
          <div className="section-title">
            <h3>발급 결과</h3>
          </div>
          <dl className="kv-list">
            <div>
              <dt>vcHash (십진)</dt>
              <dd><code>{issued.vcHash}</code></dd>
            </div>
            <div>
              <dt>등록 txHash</dt>
              <dd><code>{issued.registerTxHash || '(mock)'}</code></dd>
            </div>
          </dl>
          <pre>{credentialJson}</pre>
        </section>
      )}
    </section>
  );
}
