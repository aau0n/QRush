import { useState } from 'react';
import QRCodePanel from '../components/QRCodePanel.jsx';
import { registerVcHash } from '../api/qrushApi.js';
import { computeVcHash, randomVcSecret, stableJson, toYyyymmdd } from '../utils/hash.js';
import { ISSUER_ADDRESS, IS_MOCK } from '../config.js';

const initialForm = {
  name: '',
  birthdate: '',
  subject: '',
};

export default function IssuerPage() {
  const [form, setForm] = useState(initialForm);
  const [issued, setIssued] = useState(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

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
        vc,
        issuer: ISSUER_ADDRESS,
        vcHash, // 십진 문자열
        vcSecret, // proof private input
        birthdate: String(birthdateNum), // YYYYMMDD, proof private input
        registerTxHash: result.txHash,
      };

      setIssued(credential);
      setStatus('done');
    } catch (nextError) {
      setError(nextError.message || 'VC 발급에 실패했습니다.');
      setStatus('error');
    }
  };

  const credentialJson = issued ? stableJson(issued) : '';

  return (
    <section className="content-stack">
      <div className="page-header">
        <p className="eyebrow">01 VC Issuer</p>
        <h2>VC 발급 시뮬레이션</h2>
        <p>
          신원 발급 기관 역할의 어드민 화면입니다. vcHash = Poseidon(birthdate, vcSecret)를
          계산해 A 서버에 등록하고, 같은 값을 담은 VC를 QR/JSON으로 D 앱에 전달합니다.
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

      {issued && (
        <section className="panel">
          <div className="section-title">
            <h3>발급 결과 (D 앱 전달용)</h3>
            <span>vcSecret·birthdate(YYYYMMDD)·vcHash가 proof 입력에 그대로 쓰입니다.</span>
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
          <p className="disclosure-note">
            🔒 서버에는 <strong>vcHash(해시)만 등록</strong>됩니다. 원본 생년월일·vcSecret은
            사용자 기기에만 존재하며, 해시에서 원본을 복원할 수 없습니다.
          </p>
          <pre>{credentialJson}</pre>
        </section>
      )}
    </section>
  );
}
