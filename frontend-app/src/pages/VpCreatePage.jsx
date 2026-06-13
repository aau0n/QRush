import { useState } from 'react';
import { ethers } from 'ethers';
import JsonPreview from '../components/JsonPreview.jsx';
import { mockHolderProfile } from '../data/mockWalletData.js';
import { loadHolderProfile, loadLastVp, loadVc, saveHolderProfile, saveLastVp } from '../services/storage.js';

const initialForm = {
  eventId: 'event-001',
  seat: 'A3',
  callback: 'http://localhost:5173/booking',
};

function shortenAddress(address) {
  if (!address) return '-';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function normalizeBirthdate(value) {
  return String(value || '').replaceAll('-', '').trim();
}

function calculateAge(birthdate) {
  const normalized = normalizeBirthdate(birthdate);
  if (!/^\d{8}$/.test(normalized)) return null;

  const year = Number(normalized.slice(0, 4));
  const month = Number(normalized.slice(4, 6));
  const day = Number(normalized.slice(6, 8));
  const today = new Date();
  let age = today.getFullYear() - year;

  if (today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day)) {
    age -= 1;
  }

  return age;
}

function getCredentialSubject(savedVc) {
  return savedVc?.vc?.credentialSubject || {};
}

function getIssuer(savedVc) {
  return savedVc?.issuer || savedVc?.vc?.issuer || '';
}

function buildBookingVp({ profile, savedVc, walletAddress }) {
  const subject = getCredentialSubject(savedVc);
  const age = subject.age ?? calculateAge(subject.birthdate);

  return {
    holder: walletAddress || profile.walletAddress,
    did: subject.id || profile.holderDid,
    issuer: getIssuer(savedVc),
    vcHash: savedVc?.vcHash || null,
    claims: {
      name: subject.name || '',
      age,
    },
  };
}

function stringifyVpForSignature(vp) {
  return JSON.stringify(vp);
}

export default function VpCreatePage() {
  const lastVp = loadLastVp(null);
  const [form, setForm] = useState(initialForm);
  const [profile] = useState(() => {
    const currentProfile = loadHolderProfile(mockHolderProfile);
    saveHolderProfile(currentProfile);
    return currentProfile;
  });
  const [savedVc] = useState(() => loadVc(null));
  const [walletAddress, setWalletAddress] = useState(() => lastVp?.walletAddress || '');
  const [vpPayload, setVpPayload] = useState(() => lastVp?.vp || null);
  const [signature, setSignature] = useState(() => lastVp?.signature || '');
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');

  const updateForm = (event) => {
    setForm((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
  };

  const parseDeeplink = () => {
    setError('');
    setStatusMessage('');

    try {
      const raw = window.prompt(
        'C 웹에서 생성한 deeplink를 붙여넣어 주세요.\n예: qrush://create-vp?eventId=event-001&seat=A3&callback=http://localhost:5173/booking',
      );

      if (!raw) return;

      const url = new URL(raw);
      const eventId = url.searchParams.get('eventId');
      const seat = url.searchParams.get('seat');
      const callback = url.searchParams.get('callback');

      if (!eventId || !seat) {
        throw new Error('deeplink에 eventId 또는 seat 값이 없습니다.');
      }

      setForm({
        eventId,
        seat,
        callback: callback || '',
      });

      setStatusMessage('deeplink에서 예매 요청 정보를 불러왔습니다.');
    } catch (nextError) {
      setError(nextError.message || 'deeplink 파싱에 실패했습니다.');
    }
  };

  const connectWallet = async () => {
    setError('');
    setStatusMessage('');

    try {
      if (!window.ethereum) {
        throw new Error('MetaMask가 설치되어 있지 않습니다.');
      }

      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts',
      });

      setWalletAddress(accounts[0]);
      setStatusMessage(`지갑 연결 완료: ${shortenAddress(accounts[0])}`);
    } catch (nextError) {
      setError(nextError.message || '지갑 연결에 실패했습니다.');
    }
  };

  const createVpOnly = () => {
    setError('');
    setStatusMessage('');

    if (!profile) {
      setError('Holder profile이 없습니다.');
      return;
    }

    if (!savedVc) {
      setError('저장된 VC가 없습니다. 먼저 VC 저장 화면에서 VC를 저장해주세요.');
      return;
    }

    const vp = buildBookingVp({
      profile,
      savedVc,
      walletAddress,
    });

    setVpPayload(vp);
    setSignature('');

    saveLastVp({
      vp,
      signature: '',
      walletAddress: walletAddress || profile.walletAddress,
    });

    setStatusMessage('예매용 VP JSON을 생성했습니다. 아직 서명은 생성하지 않았습니다.');
  };

  const signVpWithMetaMask = async () => {
    setError('');
    setStatusMessage('');

    try {
      if (!window.ethereum) {
        throw new Error('MetaMask가 설치되어 있지 않습니다.');
      }

      if (!profile) {
        throw new Error('Holder profile이 없습니다.');
      }

      if (!savedVc) {
        throw new Error('저장된 VC가 없습니다. 먼저 VC 저장 화면에서 VC를 저장해주세요.');
      }

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const signerAddress = await signer.getAddress();

      const vp = buildBookingVp({
        profile,
        savedVc,
        walletAddress: signerAddress,
      });

      const nextSignature = await signer.signMessage(stringifyVpForSignature(vp));

      setWalletAddress(signerAddress);
      setVpPayload(vp);
      setSignature(nextSignature);

      saveLastVp({
        vp,
        signature: nextSignature,
        walletAddress: signerAddress,
      });

      setStatusMessage('MetaMask로 VP 서명을 생성했습니다.');
    } catch (nextError) {
      setError(nextError.message || 'VP 서명에 실패했습니다.');
    }
  };

  const createMockSignature = () => {
    setError('');
    setStatusMessage('');

    if (!vpPayload) {
      setError('먼저 VP JSON을 생성해주세요.');
      return;
    }

    const mockSignature = `mock-signature-${Date.now()}`;
    setSignature(mockSignature);

    saveLastVp({
      vp: vpPayload,
      signature: mockSignature,
      walletAddress: walletAddress || profile?.walletAddress || '',
    });

    setStatusMessage('프로토타입용 mock signature를 생성했습니다.');
  };

  const copyVpJson = async () => {
    if (!vpPayload) return;

    await navigator.clipboard.writeText(JSON.stringify(vpPayload, null, 2));
    setStatusMessage('VP JSON을 클립보드에 복사했습니다.');
  };

  const copySignature = async () => {
    if (!signature) return;

    await navigator.clipboard.writeText(signature);
    setStatusMessage('Signature를 클립보드에 복사했습니다.');
  };

  return (
    <section className="content-stack">
      <div className="page-header">
        <p className="eyebrow">03 VP Create</p>
        <h2>예매용 VP 생성</h2>
        <p>
          C 웹의 예매 요청을 받고 저장된 VC를 기반으로 VP를 생성한 뒤, 사용자의 지갑으로
          JSON.stringify(vp) 원문을 서명합니다.
        </p>
      </div>

      <div className="two-column">
        <section className="panel form-panel">
          <div className="section-title">
            <h3>예매 요청 정보</h3>
            <span>C BookingPage deeplink 값과 맞춰지는 정보입니다.</span>
          </div>

          <label>
            eventId
            <input name="eventId" value={form.eventId} onChange={updateForm} />
          </label>

          <label>
            seat
            <input name="seat" value={form.seat} onChange={updateForm} />
          </label>

          <label>
            callback
            <input name="callback" value={form.callback} onChange={updateForm} />
          </label>

          <div className="button-row">
            <button className="secondary-button" type="button" onClick={parseDeeplink}>
              deeplink 붙여넣기
            </button>
            <button className="secondary-button" type="button" onClick={connectWallet}>
              {walletAddress ? shortenAddress(walletAddress) : 'MetaMask 연결'}
            </button>
          </div>
        </section>

        <section className={savedVc ? 'panel status-panel success' : 'panel status-panel warning'}>
          <div>
            <h3>{savedVc ? 'VC 사용 가능' : 'VC 없음'}</h3>
            <p>{savedVc ? `VC Hash: ${savedVc.vcHash}` : 'VP 생성을 위해 먼저 VC를 저장해야 합니다.'}</p>
          </div>
        </section>
      </div>

      <section className="panel form-panel">
        <div className="section-title">
          <h3>VP 생성 및 서명</h3>
          <span>C 웹의 VP JSON / Signature 입력칸에 복사해서 넣을 수 있습니다.</span>
        </div>

        <div className="button-row">
          <button className="secondary-button" type="button" onClick={createVpOnly}>
            VP JSON만 생성
          </button>
          <button className="primary-button" type="button" onClick={signVpWithMetaMask}>
            MetaMask로 VP 서명
          </button>
          <button className="secondary-button" type="button" onClick={createMockSignature}>
            mock signature 생성
          </button>
        </div>

        {statusMessage && <p className="success-text">{statusMessage}</p>}
        {error && <p className="error-text">{error}</p>}
      </section>

      {vpPayload && (
        <section className="panel form-panel">
          <div className="section-title">
            <h3>C 웹으로 전달할 값</h3>
            <span>VP 키 순서는 holder, did, issuer, vcHash, claims입니다.</span>
          </div>

          <label>
            VP JSON
            <textarea readOnly rows={10} value={JSON.stringify(vpPayload, null, 2)} />
          </label>

          <label>
            Signature
            <input readOnly value={signature} placeholder="아직 서명이 없습니다." />
          </label>

          <div className="button-row">
            <button className="secondary-button" type="button" onClick={copyVpJson}>
              VP JSON 복사
            </button>
            <button className="secondary-button" type="button" onClick={copySignature} disabled={!signature}>
              Signature 복사
            </button>
          </div>
        </section>
      )}

      <JsonPreview title="Last Booking VP Payload" data={vpPayload ? { vp: vpPayload, signature } : null} />
    </section>
  );
}
