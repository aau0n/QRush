import { useMemo, useState } from 'react';
import { ethers } from 'ethers';
import JsonPreview from '../components/JsonPreview.jsx';
import { mockHolderProfile } from '../data/mockWalletData.js';
import { loadHolderProfile, loadLastVp, loadVc, saveHolderProfile, saveLastVp } from '../services/storage.js';

const initialForm = {
  eventId: 'match-001',
  seat: 'A1',
  callback: 'http://192.168.0.20:5173/booking',
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

function getVcHash(savedVc) {
  return savedVc?.vcHash || savedVc?.vc?.vcHash || savedVc?.vc?.credentialSubject?.vcHash || '';
}

function buildBookingVp({ profile, savedVc, walletAddress }) {
  const subject = getCredentialSubject(savedVc);
  const age = subject.age ?? calculateAge(subject.birthdate || savedVc?.birthdate);

  return {
    holder: walletAddress || profile.walletAddress,
    did: subject.id || profile.holderDid,
    issuer: getIssuer(savedVc),
    vcHash: getVcHash(savedVc),
    claims: {
      name: subject.name || savedVc?.name || '',
      age,
    },
  };
}

function stringifyVpForSignature(vp) {
  return JSON.stringify(vp);
}

function delay(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function getEthereumProvider() {
  for (let index = 0; index < 20; index += 1) {
    if (window.ethereum) return window.ethereum;
    await delay(100);
  }

  throw new Error('현재 브라우저에 MetaMask 연결 객체가 없습니다. Safari로 열린 상태라면 MetaMask 앱 브라우저에서 이 페이지를 열어주세요.');
}

function parseBookingQr(rawValue) {
  const raw = rawValue.trim();
  if (!raw) throw new Error('예매 QR 값을 입력해 주세요.');

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('예매 QR URL 형식이 올바르지 않습니다.');
  }

  const isCustomScheme = url.protocol === 'qrush:' && url.hostname === 'create-vp';
  const isHttpFallback =
    (url.protocol === 'http:' || url.protocol === 'https:') && url.pathname.replace(/\/$/, '') === '/vp';

  if (!isCustomScheme && !isHttpFallback) {
    throw new Error('qrush://create-vp 또는 http(s)://.../vp 형식의 예매 QR만 처리할 수 있습니다.');
  }

  const eventId = url.searchParams.get('eventId');
  const seat = url.searchParams.get('seat');
  const callback = url.searchParams.get('callback');

  if (!eventId || !seat) {
    throw new Error('예매 QR에 eventId 또는 seat 값이 없습니다.');
  }

  return {
    eventId,
    seat,
    callback: callback || '',
  };
}

function buildCallbackUrl({ callback, vp, signature, eventId, seat }) {
  if (!callback) throw new Error('callback URL이 없습니다.');

  const url = new URL(callback);
  url.searchParams.set('vp', JSON.stringify(vp));
  url.searchParams.set('signature', signature);
  url.searchParams.set('eventId', eventId);
  url.searchParams.set('seat', seat);
  return url.toString();
}

function getInitialBookingQrText() {
  const params = new URLSearchParams(window.location.search);
  const deeplink = params.get('deeplink');
  if (deeplink) return deeplink;

  const eventId = params.get('eventId');
  const seat = params.get('seat');
  if (!eventId || !seat) return '';

  return window.location.href;
}

function getInitialBookingForm() {
  try {
    const qrText = getInitialBookingQrText();
    return qrText ? parseBookingQr(qrText) : initialForm;
  } catch {
    return initialForm;
  }
}

export default function VpCreatePage() {
  const lastVp = loadLastVp(null);
  const [bookingQrText, setBookingQrText] = useState(getInitialBookingQrText);
  const [form, setForm] = useState(getInitialBookingForm);
  const [profile] = useState(() => {
    const currentProfile = loadHolderProfile(mockHolderProfile);
    saveHolderProfile(currentProfile);
    return currentProfile;
  });
  const [savedVc] = useState(() => loadVc(null));
  const [walletAddress, setWalletAddress] = useState(() => lastVp?.walletAddress || '');
  const [vpPayload, setVpPayload] = useState(() => lastVp?.vp || null);
  const [signature, setSignature] = useState(() => lastVp?.signature || '');
  const [callbackUrl, setCallbackUrl] = useState(() => lastVp?.callbackUrl || '');
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');

  const signedPayload = useMemo(() => {
    if (!vpPayload || !signature) return null;
    return {
      vp: vpPayload,
      signature,
      eventId: form.eventId,
      seat: form.seat,
      callback: form.callback,
    };
  }, [form.callback, form.eventId, form.seat, signature, vpPayload]);

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
      const parsed = parseBookingQr(bookingQrText);
      setForm(parsed);
      setStatusMessage('예매 QR에서 eventId, seat, callback을 읽었습니다.');
    } catch (nextError) {
      setError(nextError.message || '예매 QR 파싱에 실패했습니다.');
    }
  };

  const connectWallet = async () => {
    setError('');
    setStatusMessage('');

    try {
      const ethereum = await getEthereumProvider();

      const accounts = await ethereum.request({
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
      setError('저장된 VC가 없습니다. 먼저 VC 저장 화면에서 VC를 저장해 주세요.');
      return;
    }

    const vp = buildBookingVp({
      profile,
      savedVc,
      walletAddress,
    });

    setVpPayload(vp);
    setSignature('');
    setCallbackUrl('');

    saveLastVp({
      vp,
      signature: '',
      walletAddress: walletAddress || profile.walletAddress,
      callbackUrl: '',
    });

    setStatusMessage('예매용 VP JSON을 생성했습니다. 서명은 아직 생성하지 않았습니다.');
  };

  const saveSignedVp = ({ vp, nextSignature, nextWalletAddress }) => {
    let nextCallbackUrl = '';

    if (form.callback) {
      nextCallbackUrl = buildCallbackUrl({
        callback: form.callback,
        vp,
        signature: nextSignature,
        eventId: form.eventId,
        seat: form.seat,
      });
    }

    setWalletAddress(nextWalletAddress);
    setVpPayload(vp);
    setSignature(nextSignature);
    setCallbackUrl(nextCallbackUrl);

    saveLastVp({
      vp,
      signature: nextSignature,
      walletAddress: nextWalletAddress,
      callbackUrl: nextCallbackUrl,
    });

    return nextCallbackUrl;
  };

  const signVpWithMetaMask = async () => {
    setError('');
    setStatusMessage('');

    try {
      const ethereum = await getEthereumProvider();

      if (!profile) {
        throw new Error('Holder profile이 없습니다.');
      }

      if (!savedVc) {
        throw new Error('저장된 VC가 없습니다. 먼저 VC 저장 화면에서 VC를 저장해 주세요.');
      }

      const provider = new ethers.BrowserProvider(ethereum);
      const signer = await provider.getSigner();
      const signerAddress = await signer.getAddress();

      const vp = buildBookingVp({
        profile,
        savedVc,
        walletAddress: signerAddress,
      });

      const nextSignature = await signer.signMessage(stringifyVpForSignature(vp));
      saveSignedVp({
        vp,
        nextSignature,
        nextWalletAddress: signerAddress,
      });

      setStatusMessage('MetaMask로 VP를 서명했습니다. 필요하면 callback URL로 C 예매 화면에 전달하세요.');
    } catch (nextError) {
      setError(nextError.message || 'VP 서명에 실패했습니다.');
    }
  };

  const createMockSignature = () => {
    setError('');
    setStatusMessage('');

    try {
      const vp =
        vpPayload ||
        buildBookingVp({
          profile,
          savedVc,
          walletAddress,
        });

      const mockSignature = `mock-signature-${Date.now()}`;
      saveSignedVp({
        vp,
        nextSignature: mockSignature,
        nextWalletAddress: walletAddress || profile?.walletAddress || '',
      });

      setStatusMessage('프로토타입용 mock signature를 생성했습니다.');
    } catch (nextError) {
      setError(nextError.message || 'mock signature 생성에 실패했습니다.');
    }
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

  const copyCallbackUrl = async () => {
    if (!callbackUrl) return;

    await navigator.clipboard.writeText(callbackUrl);
    setStatusMessage('callback URL을 클립보드에 복사했습니다.');
  };

  const openCallbackUrl = () => {
    if (!callbackUrl) return;
    window.location.href = callbackUrl;
  };

  return (
    <section className="content-stack">
      <div className="page-header">
        <p className="eyebrow">03 VP Create</p>
        <h2>예매 VP 생성</h2>
        <p>
          C 웹의 예매 QR을 읽고 저장된 VC로 VP를 만든 뒤, compact JSON.stringify(vp) 원문에
          지갑 서명을 붙여 callback URL로 돌려보냅니다.
        </p>
      </div>

      <section className="panel flow-panel">
        <div className="section-title">
          <h3>예매 QR 처리</h3>
          <span>qrush://create-vp?eventId=...&seat=...&callback=... 형식입니다.</span>
        </div>
        <label>
          Booking QR deeplink
          <textarea
            value={bookingQrText}
            onChange={(event) => setBookingQrText(event.target.value)}
            placeholder="qrush://create-vp?eventId=match-001&seat=A1&callback=http://192.168.0.20:5173/booking"
            rows={4}
          />
        </label>
        <div className="button-row">
          <button className="primary-button" type="button" onClick={parseDeeplink}>
            예매 QR 읽기
          </button>
          <button className="secondary-button" type="button" onClick={connectWallet}>
            {walletAddress ? shortenAddress(walletAddress) : 'MetaMask 연결'}
          </button>
        </div>
      </section>

      <div className="two-column">
        <section className="panel form-panel">
          <div className="section-title">
            <h3>예매 요청 정보</h3>
            <span>QR 파싱 결과를 확인하거나 데모용으로 직접 수정할 수 있습니다.</span>
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
        </section>

        <section className={savedVc ? 'panel status-panel success' : 'panel status-panel warning'}>
          <div>
            <h3>{savedVc ? 'VC 사용 가능' : 'VC 없음'}</h3>
            <p>{savedVc ? `VC Hash: ${getVcHash(savedVc)}` : 'VP 생성을 위해 먼저 VC를 저장해야 합니다.'}</p>
          </div>
        </section>
      </div>

      <section className="panel form-panel">
        <div className="section-title">
          <h3>VP 생성 및 서명</h3>
          <span>VP 키 순서는 holder, did, issuer, vcHash, claims로 고정됩니다.</span>
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
            <span>서명 검증은 JSON.stringify(vp) compact 문자열 기준입니다.</span>
          </div>

          <label>
            VP JSON
            <textarea readOnly rows={10} value={JSON.stringify(vpPayload, null, 2)} />
          </label>

          <label>
            Signature
            <input readOnly value={signature} placeholder="아직 서명이 없습니다." />
          </label>

          {callbackUrl && (
            <label>
              Callback URL
              <textarea readOnly rows={4} value={callbackUrl} />
            </label>
          )}

          <div className="button-row">
            <button className="secondary-button" type="button" onClick={copyVpJson}>
              VP JSON 복사
            </button>
            <button className="secondary-button" type="button" onClick={copySignature} disabled={!signature}>
              Signature 복사
            </button>
            <button className="secondary-button" type="button" onClick={copyCallbackUrl} disabled={!callbackUrl}>
              callback URL 복사
            </button>
            <button className="primary-button" type="button" onClick={openCallbackUrl} disabled={!callbackUrl}>
              C 예매 화면으로 돌아가기
            </button>
          </div>
        </section>
      )}

      <JsonPreview title="Last Booking VP Payload" data={signedPayload || (vpPayload ? { vp: vpPayload } : null)} />
    </section>
  );
}
