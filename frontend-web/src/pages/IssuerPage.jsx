import { useState } from 'react';
import QRCodePanel from '../components/QRCodePanel.jsx';
import { registerVcHash } from '../api/qrushApi.js';
import { sha256, stableJson } from '../utils/hash.js';

const initialForm = {
  name: '',
  birthdate: '',
  subject: '',
};

export default function IssuerPage() {
  const [form, setForm] = useState(initialForm);
  const [issuedVc, setIssuedVc] = useState(null);
  const [vcHash, setVcHash] = useState('');
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
      const vc = {
        '@context': ['https://www.w3.org/2018/credentials/v1'],
        type: ['VerifiableCredential', 'QRushIdentityCredential'],
        issuer: 'did:qrush:issuer-admin',
        issuanceDate: new Date().toISOString(),
        credentialSubject: {
          id: form.subject.trim(),
          name: form.name.trim(),
          birthdate: form.birthdate,
        },
      };

      const vcJson = stableJson(vc);
      const hash = await sha256(vcJson);
      await registerVcHash(hash, vc);

      setIssuedVc(vc);
      setVcHash(hash);
      setStatus('done');
    } catch (nextError) {
      setError(nextError.message || 'VC 발급에 실패했습니다.');
      setStatus('error');
    }
  };

  const vcJson = issuedVc ? stableJson({ vc: issuedVc, vcHash }) : '';

  return (
    <section className="content-stack">
      <div className="page-header">
        <p className="eyebrow">01 VC Issuer</p>
        <h2>VC 발급 시뮬레이션</h2>
        <p>
          신원 발급 기관 역할의 어드민 화면입니다. 발급된 VC는 QR 또는 JSON으로 D 앱에
          전달합니다.
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

          {error && <p className="error-text">{error}</p>}
        </form>

        <div className="panel result-panel">
          {issuedVc ? (
            <>
              <div className="status-row success">
                <span>VC 발급 완료</span>
                <code>{vcHash.slice(0, 16)}...</code>
              </div>
              <QRCodePanel label="D 앱에서 스캔할 VC QR" value={vcJson} />
            </>
          ) : (
            <div className="empty-state">
              <h3>아직 발급된 VC가 없습니다</h3>
              <p>폼을 입력하고 발급하면 QR과 JSON이 여기에 표시됩니다.</p>
            </div>
          )}
        </div>
      </div>

      {issuedVc && (
        <section className="panel">
          <div className="section-title">
            <h3>발급 JSON</h3>
            <span>A 서버에는 VC 해시만 등록하는 흐름입니다.</span>
          </div>
          <pre>{vcJson}</pre>
        </section>
      )}
    </section>
  );
}
