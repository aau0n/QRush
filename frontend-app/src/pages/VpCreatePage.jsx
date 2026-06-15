import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ethers } from 'ethers';
import JsonPreview from '../components/JsonPreview.jsx';
import { API_BASE_URL } from '../config.js';
import {
  connectMetaMaskAccount,
  consumeMetaMaskConnectSignResult,
  onMetaMaskConnectSignResult,
  signMessageWithMetaMaskConnect,
} from '../services/metamaskConnect.js';
import { loadHolderProfile, loadVc, saveHolderProfile, saveLastVp } from '../services/storage.js';

const initialForm = {
  eventId: '',
  seat: '',
  sessionId: '',
  submitEndpoint: '',
  resultEndpoint: '',
};
const PENDING_BOOKING_SIGN_KEY = 'qrush_booking_pending_sign';

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
    holder: walletAddress,
    did: subject.id || profile?.holderDid || '',
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

function savePendingBookingSign(payload) {
  try {
    window.localStorage.setItem(PENDING_BOOKING_SIGN_KEY, JSON.stringify(payload));
  } catch {
    // Best-effort persistence for Safari ↔ MetaMask app return.
  }
}

function takePendingBookingSign() {
  try {
    const raw = window.localStorage.getItem(PENDING_BOOKING_SIGN_KEY);
    if (!raw) return null;
    window.localStorage.removeItem(PENDING_BOOKING_SIGN_KEY);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function clearPendingBookingSign() {
  try {
    window.localStorage.removeItem(PENDING_BOOKING_SIGN_KEY);
  } catch {
    // Ignore.
  }
}

function decodePayload64(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function delay(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function withTimeout(promise, ms, message) {
  let timer;

  const timeout = new Promise((_, reject) => {
    timer = window.setTimeout(() => reject(new Error(message)), ms);
  });

  return Promise.race([promise, timeout]).finally(() => {
    window.clearTimeout(timer);
  });
}

async function getEthereumProvider() {
  for (let index = 0; index < 20; index += 1) {
    if (window.ethereum) return window.ethereum;
    await delay(100);
  }

  throw new Error('현재 브라우저에 MetaMask 연결 객체가 없습니다. Safari라면 MetaMask 승인 화면이 열릴 때까지 잠시 기다려 주세요.');
}

async function getConnectedAddress() {
  if (window.ethereum) {
    const ethereum = await getEthereumProvider();

    const accounts = await withTimeout(
      ethereum.request({
        method: 'eth_requestAccounts',
      }),
      45000,
      'MetaMask 계정 연결 응답이 없습니다. MetaMask 앱에서 승인 후 이 화면으로 돌아왔는지 확인해 주세요.',
    );

    console.log('MetaMask accounts:', accounts);

    return accounts[0] || '';
  }

  return connectMetaMaskAccount();
}

async function signVpMessage(message, preferredAddress = '') {
  if (window.ethereum) {
    const ethereum = await getEthereumProvider();
    const provider = new ethers.BrowserProvider(ethereum);
    const signer = await provider.getSigner();
    const signerAddress = await signer.getAddress();
    const nextSignature = await withTimeout(
      signer.signMessage(message),
      90000,
      'MetaMask 서명 응답이 없습니다. MetaMask 앱에서 승인 후 Safari로 돌아왔는지 확인해 주세요.',
    );

    console.log('Signer address:', signerAddress);

    if (preferredAddress && signerAddress.toLowerCase() !== preferredAddress.toLowerCase()) {
      throw new Error('서명한 MetaMask 계정이 VP holder 주소와 다릅니다. 같은 계정으로 다시 시도해 주세요.');
    }

    return {
      address: signerAddress,
      signature: nextSignature,
    };
  }

  const signed = await withTimeout(
    signMessageWithMetaMaskConnect(message),
    90000,
    'MetaMask 서명 응답이 없습니다. MetaMask 앱에서 승인 후 Safari로 돌아왔는지 확인해 주세요.',
  );

  if (preferredAddress && signed.address && signed.address.toLowerCase() !== preferredAddress.toLowerCase()) {
    throw new Error('서명한 MetaMask 계정이 VP holder 주소와 다릅니다. 같은 계정으로 다시 시도해 주세요.');
  }

  return signed;
}

function parseBookingQr(rawValue) {
  const raw = rawValue.trim();
  if (!raw) throw new Error('예매 QR 값을 입력해 주세요.');

  try {
    const parsed = JSON.parse(raw);
    if (parsed.type === 'QRushBookingSession') return normalizeBookingSessionPayload(parsed);
  } catch {
    // Continue with URL parsing.
  }

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

  const session64 = url.searchParams.get('session64');
  const sessionJson = url.searchParams.get('session');

  if (session64 || sessionJson) {
    const sessionPayload = JSON.parse(session64 ? decodePayload64(session64) : sessionJson);
    return normalizeBookingSessionPayload(sessionPayload);
  }

  const sessionId = url.searchParams.get('sessionId');
  const submitEndpoint = url.searchParams.get('submitEndpoint');
  if (sessionId || submitEndpoint) {
    return normalizeBookingSessionPayload({
      type: 'QRushBookingSession',
      sessionId,
      submitEndpoint,
      eventId: url.searchParams.get('eventId'),
      seatId: url.searchParams.get('seatId') || url.searchParams.get('seat'),
    });
  }

  const eventId = url.searchParams.get('eventId');
  const seat = url.searchParams.get('seat');

  if (!eventId || !seat) {
    throw new Error('예매 QR에 eventId 또는 seat 값이 없습니다.');
  }

  return {
    eventId,
    seat,
    sessionId: '',
    submitEndpoint: '',
    resultEndpoint: '',
  };
}

function normalizeBookingSessionPayload(payload) {
  if (payload.type !== 'QRushBookingSession') {
    throw new Error('예매 세션 QR 형식이 올바르지 않습니다.');
  }

  const sessionId = payload.sessionId || '';
  const submitEndpoint = toApiUrl(
    payload.submitEndpoint || (sessionId ? `/api/booking/submit/${sessionId}` : ''),
  );
  const resultEndpoint = toApiUrl(
    payload.resultEndpoint || (sessionId ? `/api/booking/result/${sessionId}` : ''),
  );
  const eventId = payload.eventId || '';
  const seat = payload.seatId || payload.seat || '';

  if (!sessionId && !submitEndpoint) {
    throw new Error('예매 세션 QR에 sessionId 또는 submitEndpoint가 없습니다.');
  }

  if (!eventId || !seat) {
    throw new Error('예매 세션 QR에 eventId 또는 seatId가 없습니다.');
  }

  return {
    eventId,
    seat,
    sessionId,
    submitEndpoint,
    resultEndpoint,
  };
}

function toApiUrl(pathOrUrl) {
  if (!pathOrUrl) return '';
  if (/^https?:\/\//.test(pathOrUrl)) return rewriteLocalhostForPhone(pathOrUrl);
  return rewriteLocalhostForPhone(
    `${API_BASE_URL}${pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`}`,
  );
}

function isLocalHost(hostname) {
  return ['localhost', '127.0.0.1', '::1'].includes(hostname);
}

function rewriteLocalhostForPhone(urlString) {
  if (typeof window === 'undefined') return urlString;

  const pageHost = window.location.hostname;
  if (!pageHost || isLocalHost(pageHost)) return urlString;

  try {
    const url = new URL(urlString);
    if (!isLocalHost(url.hostname)) return urlString;

    url.hostname = pageHost;
    return url.toString().replace(/\/$/, '');
  } catch {
    return urlString;
  }
}

async function submitBookingSession({ submitEndpoint, vp, signature, eventId, seat }) {
  if (!submitEndpoint) {
    throw new Error('예매 세션 제출 endpoint가 없습니다.');
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 30000);
  let response;

  try {
    response = await fetch(submitEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vp, signature, eventId, seatId: seat }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('예매 세션 제출 시간이 초과되었습니다. 백엔드 주소가 폰에서 접근 가능한지 확인해 주세요.', {
        cause: error,
      });
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }

  const result = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(result?.error || result?.reason || `예매 세션 제출 실패 (${response.status})`);
    error.body = result;
    throw error;
  }

  return result;
}

function getInitialBookingQrText() {
  const params = new URLSearchParams(window.location.search);
  const deeplink = params.get('deeplink');
  if (deeplink) return deeplink;

  if (
    params.has('session64') ||
    params.has('session') ||
    params.has('sessionId') ||
    params.has('submitEndpoint')
  ) {
    return window.location.href;
  }

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
  const [bookingQrText, setBookingQrText] = useState(getInitialBookingQrText);
  const [form, setForm] = useState(getInitialBookingForm);

  const [profile, setProfile] = useState(() => loadHolderProfile(null));

  const [savedVc] = useState(() => loadVc(null));

  const [walletAddress, setWalletAddress] = useState('');
  const [vpPayload, setVpPayload] = useState(null);
  const [signature, setSignature] = useState('');
  const [submitResult, setSubmitResult] = useState(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');
  const [flowStep, setFlowStep] = useState('idle');
  const isProcessing = ['wallet', 'sign', 'submit'].includes(flowStep);
  const isCompletingSignatureRef = useRef(false);
  const submissionStateRef = useRef('idle');

  const signedPayload = useMemo(() => {
    if (!vpPayload || !signature) return null;

    return {
      vp: vpPayload,
      signature,
      eventId: form.eventId,
      seat: form.seat,
      sessionId: form.sessionId,
      submitEndpoint: form.submitEndpoint,
      resultEndpoint: form.resultEndpoint,
    };
  }, [form.eventId, form.resultEndpoint, form.seat, form.sessionId, form.submitEndpoint, signature, vpPayload]);

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
      setStatusMessage('예매 QR에서 eventId, seat, submitEndpoint를 읽었습니다.');
    } catch (nextError) {
      setError(nextError.message || '예매 QR 파싱에 실패했습니다.');
    }
  };

  const connectWallet = async () => {
    setError('');
    setStatusMessage('');

    try {
      const account = await getConnectedAddress();

      if (!account) {
        throw new Error('MetaMask에서 계정 주소를 가져오지 못했습니다.');
      }

      setWalletAddress(account);
      const nextProfile = { ...(profile || {}), walletAddress: account };
      saveHolderProfile(nextProfile);
      setProfile(nextProfile);
      setVpPayload(null);
      setSignature('');
      setSubmitResult(null);
      setFlowStep('idle');

      setStatusMessage(`지갑 연결 완료: ${shortenAddress(account)}`);
    } catch (nextError) {
      setError(nextError.message || '지갑 연결에 실패했습니다.');
    }
  };

  const resetStoredData = () => {
    localStorage.clear();

    setWalletAddress('');
    setVpPayload(null);
    setSignature('');
    setSubmitResult(null);
    setFlowStep('idle');
    setStatusMessage('저장된 지갑/VP 데이터를 초기화했습니다. 페이지를 새로고침한 뒤 MetaMask를 다시 연결하세요.');
    setError('');
  };

  const createVpOnly = async () => {
    setError('');
    setStatusMessage('');

    try {
      if (!savedVc) {
        throw new Error('저장된 VC가 없습니다. 먼저 VC 저장 화면에서 VC를 저장해 주세요.');
      }

      const connectedAddress = await getConnectedAddress();

      if (!connectedAddress) {
        throw new Error('MetaMask에서 계정 주소를 가져오지 못했습니다.');
      }

      const vp = buildBookingVp({
        profile,
        savedVc,
        walletAddress: connectedAddress,
      });

      setWalletAddress(connectedAddress);
      const nextProfile = { ...(profile || {}), walletAddress: connectedAddress };
      saveHolderProfile(nextProfile);
      setProfile(nextProfile);
      setVpPayload(vp);
      setSignature('');
      setSubmitResult(null);
      setFlowStep('idle');

      saveLastVp({
        vp,
        signature: '',
        walletAddress: connectedAddress,
        sessionId: form.sessionId,
        submitEndpoint: form.submitEndpoint,
        resultEndpoint: form.resultEndpoint,
      });

      setStatusMessage(`예매용 VP JSON을 생성했습니다. Holder: ${shortenAddress(connectedAddress)}`);
    } catch (nextError) {
      setError(nextError.message || '예매용 VP JSON 생성에 실패했습니다.');
    }
  };

  const saveSignedVp = useCallback(({ vp, nextSignature, nextWalletAddress }) => {
    setWalletAddress(nextWalletAddress);
    const nextProfile = { ...(profile || {}), walletAddress: nextWalletAddress };
    saveHolderProfile(nextProfile);
    setProfile(nextProfile);
    setVpPayload(vp);
    setSignature(nextSignature);

    saveLastVp({
      vp,
      signature: nextSignature,
      walletAddress: nextWalletAddress,
      sessionId: form.sessionId,
      submitEndpoint: form.submitEndpoint,
      resultEndpoint: form.resultEndpoint,
    });
  }, [form.resultEndpoint, form.sessionId, form.submitEndpoint, profile]);

  const completeSignedBooking = useCallback(
    async (signed, fallbackContext = null) => {
      if (
        !signed?.signature ||
        isCompletingSignatureRef.current ||
        submissionStateRef.current === 'done'
      ) {
        return;
      }

      isCompletingSignatureRef.current = true;

      const pending = takePendingBookingSign() || fallbackContext;
      if (!pending?.vp || !pending?.submitEndpoint) {
        isCompletingSignatureRef.current = false;
        return;
      }

      try {
        const signerAddress = signed.address || signed.accounts?.[0] || pending.walletAddress || '';

        if (
          pending.walletAddress &&
          signerAddress &&
          signerAddress.toLowerCase() !== pending.walletAddress.toLowerCase()
        ) {
          throw new Error('서명한 MetaMask 계정이 VP holder 주소와 다릅니다. 같은 계정으로 다시 시도해 주세요.');
        }

        saveSignedVp({
          vp: pending.vp,
          nextSignature: signed.signature,
          nextWalletAddress: signerAddress || pending.walletAddress,
        });

        setFlowStep('submit');
        setStatusMessage('VP 서명이 완료되었습니다. 예매 세션으로 제출 중입니다...');
        setError('');

        const result = await submitBookingSession({
          submitEndpoint: pending.submitEndpoint,
          vp: pending.vp,
          signature: signed.signature,
          eventId: pending.eventId,
          seat: pending.seat,
        });

        setSubmitResult(result);
        submissionStateRef.current = 'done';
        setFlowStep('done');
        setStatusMessage('VP 제출이 완료되었습니다. PC 예매 화면에서 결과를 확인하세요.');
      } catch (nextError) {
        submissionStateRef.current = 'error';
        setFlowStep('error');
        setSubmitResult(nextError.body || null);
        setError(nextError.message || 'VP 제출에 실패했습니다.');
      } finally {
        isCompletingSignatureRef.current = false;
      }
    },
    [saveSignedVp],
  );

  useEffect(() => {
    const handleSignedResult = (result) => {
      completeSignedBooking({
        address: result?.accounts?.[0],
        accounts: result?.accounts,
        signature: result?.signature,
      });
    };

    const unsubscribe = onMetaMaskConnectSignResult(handleSignedResult);

    const consumeStoredResult = () => {
      const result = consumeMetaMaskConnectSignResult();
      if (result) handleSignedResult(result);
    };

    consumeStoredResult();
    window.addEventListener('focus', consumeStoredResult);
    document.addEventListener('visibilitychange', consumeStoredResult);

    return () => {
      unsubscribe();
      window.removeEventListener('focus', consumeStoredResult);
      document.removeEventListener('visibilitychange', consumeStoredResult);
    };
  }, [completeSignedBooking]);

  const signVpWithMetaMask = async () => {
    setError('');
    setStatusMessage('');
    setSubmitResult(null);
    submissionStateRef.current = 'idle';
    clearPendingBookingSign();

    try {
      setFlowStep('wallet');
      if (!savedVc) {
        throw new Error('저장된 VC가 없습니다. 먼저 VC 저장 화면에서 VC를 저장해 주세요.');
      }

      if (!form.sessionId || !form.submitEndpoint) {
        throw new Error('예매 세션 정보가 없습니다. PC 예매 페이지의 QR을 다시 스캔해 주세요.');
      }

      setStatusMessage('MetaMask 계정 연결을 확인하는 중입니다. MetaMask 앱이 열리면 승인 후 Safari로 돌아와 주세요.');
      const connectedAddress = await getConnectedAddress();

      if (!connectedAddress) {
        throw new Error('MetaMask에서 계정 주소를 가져오지 못했습니다.');
      }

      const vp = buildBookingVp({
        profile,
        savedVc,
        walletAddress: connectedAddress,
      });

      const message = stringifyVpForSignature(vp);
      const pendingContext = {
        vp,
        message,
        walletAddress: connectedAddress,
        eventId: form.eventId,
        seat: form.seat,
        sessionId: form.sessionId,
        submitEndpoint: form.submitEndpoint,
        resultEndpoint: form.resultEndpoint,
      };

      setFlowStep('sign');
      setStatusMessage('MetaMask 서명 요청을 보냈습니다. MetaMask에서 확인을 누른 뒤 Safari로 돌아와 주세요.');
      savePendingBookingSign(pendingContext);
      const { address: signerAddress, signature: nextSignature } = await signVpMessage(
        message,
        connectedAddress,
      );

      await completeSignedBooking(
        {
          address: signerAddress,
          signature: nextSignature,
        },
        pendingContext,
      );
    } catch (nextError) {
      if (submissionStateRef.current === 'done') return;
      setFlowStep('error');
      setSubmitResult(nextError.body || null);
      setError(nextError.message || 'VP 서명에 실패했습니다.');
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

  return (
    <section className="content-stack">
      <div className="page-header">
        <p className="eyebrow">03 VP Create</p>
        <h2>예매 VP 생성</h2>
        <p>
          C 웹의 예매 QR을 읽고 저장된 VC로 VP를 만든 뒤, compact JSON.stringify(vp) 원문에
          지갑 서명을 붙여 백엔드 예매 세션으로 제출합니다.
        </p>
      </div>

      <section className="panel flow-panel">
        <div className="section-title">
          <h3>예매 QR 처리</h3>
          <span>QRushBookingSession 세션 QR을 읽어 예매 세션에 제출합니다.</span>
        </div>

        <label>
          Booking QR deeplink
          <textarea
            value={bookingQrText}
            onChange={(event) => setBookingQrText(event.target.value)}
            placeholder="http://.../vp?session64=..."
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

          <button className="secondary-button" type="button" onClick={resetStoredData}>
            저장값 초기화
          </button>
        </div>

        {walletAddress && (
          <p className="success-text">
            현재 연결 주소: {walletAddress}
          </p>
        )}
      </section>

      <div className="two-column">
        <section className="panel form-panel">
          <div className="section-title">
            <h3>예매 요청 정보</h3>
            <span>QR 파싱 결과를 확인하거나 필요한 값을 직접 수정할 수 있습니다.</span>
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
            sessionId
            <input name="sessionId" value={form.sessionId} onChange={updateForm} />
          </label>

          <label>
            submitEndpoint
            <input name="submitEndpoint" value={form.submitEndpoint} onChange={updateForm} />
          </label>

          <label>
            resultEndpoint
            <input name="resultEndpoint" value={form.resultEndpoint} onChange={updateForm} />
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

          <button className="primary-button" type="button" onClick={signVpWithMetaMask} disabled={isProcessing}>
            {flowStep === 'wallet' && 'MetaMask 연결 확인 중'}
            {flowStep === 'sign' && 'MetaMask 서명 대기 중'}
            {flowStep === 'submit' && '예매 세션 제출 중'}
            {!isProcessing && 'MetaMask로 VP 서명 후 제출'}
          </button>

        </div>

        {flowStep !== 'idle' && (
          <div className={`auto-flow-panel ${flowStep === 'error' ? 'error' : flowStep === 'done' ? 'done' : 'verify'}`}>
            <div className={isProcessing ? 'spinner' : 'spinner idle'} aria-hidden="true" />
            <div>
              <h3>
                {flowStep === 'wallet' && '지갑 연결 확인 중'}
                {flowStep === 'sign' && 'MetaMask 서명 대기 중'}
                {flowStep === 'submit' && '예매 세션 제출 중'}
                {flowStep === 'done' && '제출 완료'}
                {flowStep === 'error' && '처리 실패'}
              </h3>
              <p>{statusMessage || error}</p>
              {form.sessionId && <small>sessionId: {form.sessionId}</small>}
            </div>
          </div>
        )}

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

          {submitResult && (
            <div className={submitResult.success === false ? 'status-panel warning' : 'status-panel success'}>
              <h3>{submitResult.success === false ? '예매 세션 제출 실패' : '예매 세션 제출 완료'}</h3>
              <p>
                {submitResult.success === false
                  ? submitResult.reason || submitResult.error || 'PC 예매 화면에 실패 결과가 반영됩니다.'
                  : 'PC 예매 화면에 결과가 자동으로 반영됩니다.'}
              </p>
            </div>
          )}

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

      <JsonPreview title="Last Booking VP Payload" data={signedPayload || (vpPayload ? { vp: vpPayload } : null)} />
    </section>
  );
}
