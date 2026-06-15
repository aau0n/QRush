import { useCallback, useEffect, useRef, useState } from 'react';
import JsonPreview from '../components/JsonPreview.jsx';
import { generateEntryProof } from '../services/zkpProof.js';
import {
  loadHolderProfile,
  loadLastEntryProof,
  loadLastVp,
  loadSelectedTicket,
  loadTickets,
  loadVc,
  saveLastEntryProof,
  saveTickets,
} from '../services/storage.js';
import { fetchTicketsByWallet } from '../services/ticketSync.js';

const circuitMeta = {
  scheme: 'Groth16',
  curve: 'BN254',
  constraints: 42,
  privateInputs: 1,
  publicInputs: 4,
  outputs: 1,
  publicSignals: 5,
};

function getInitialSelectedTokenId(tickets) {
  const selectedTicketFromWallet = loadSelectedTicket(null);
  const selectedTicketStillExists = tickets.find(
    (ticket) => ticket.tokenId === selectedTicketFromWallet?.tokenId,
  );

  return (
    selectedTicketStillExists?.tokenId ||
    tickets.find((ticket) => ticket.status === 'VALID')?.tokenId ||
    tickets[0]?.tokenId ||
    ''
  );
}

function getInitialWalletAddress(profile) {
  return loadLastVp(null)?.walletAddress || profile?.walletAddress || '';
}

function getInitialChallengeText() {
  const params = new URLSearchParams(window.location.search);
  const challenge = params.get('challenge');
  if (challenge) return challenge;

  const nonce = params.get('nonce');
  if (!nonce) return '';

  return JSON.stringify(buildGateChallengeFromParams(params), null, 2);
}

function buildGateChallengeFromParams(params) {
  return {
    type: 'QRushGateChallenge',
    nonce: params.get('nonce') || '',
    nonceHex: params.get('nonceHex') || undefined,
    endpoint: params.get('endpoint') || '/api/gate/verify-proof',
    eventId: params.get('eventId') || '',
    eventTitle: params.get('eventTitle') || '',
    expiresIn: Number(params.get('expiresIn') || 30),
  };
}

function parseGateChallengeJson(rawValue) {
  try {
    return JSON.parse(rawValue);
  } catch {
    throw new Error('Gate QR JSON이 비어 있거나 끝까지 입력되지 않았습니다. Gate 화면의 QR 링크를 다시 스캔하거나 전체 JSON을 붙여넣어 주세요.');
  }
}

function parseGateChallenge(rawValue) {
  const trimmedValue = String(rawValue || '').trim();

  if (!trimmedValue) {
    throw new Error('Gate QR을 먼저 스캔하거나 Gate Challenge JSON을 붙여넣어 주세요.');
  }

  let parsed;

  if (trimmedValue.startsWith('{')) {
    parsed = parseGateChallengeJson(trimmedValue);
  } else {
    let parsedUrl;

    try {
      parsedUrl = new URL(trimmedValue, window.location.origin);
    } catch {
      parsed = parseGateChallengeJson(trimmedValue);
    }

    if (parsedUrl) {
      const nestedChallenge = parsedUrl.searchParams.get('challenge');

      if (nestedChallenge) {
        return parseGateChallenge(nestedChallenge);
      }

      parsed = buildGateChallengeFromParams(parsedUrl.searchParams);
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Gate QR payload는 nonce와 endpoint를 가진 JSON 객체여야 합니다.');
  }

  if (parsed.type !== 'QRushGateChallenge') {
    throw new Error('type이 QRushGateChallenge인 Gate QR payload만 사용할 수 있습니다.');
  }

  if (!parsed.nonce) {
    throw new Error('Gate Challenge에 nonce가 없습니다.');
  }

  try {
    BigInt(parsed.nonce);
  } catch {
    throw new Error('Gate Challenge nonce는 십진 field 문자열이어야 합니다.');
  }

  if (!parsed.endpoint) {
    throw new Error('Gate Challenge에 endpoint가 없습니다.');
  }

  if (!parsed.eventId) {
    throw new Error('Gate QR에 공연 정보(eventId)가 없습니다. Gate 화면에서 공연을 선택한 뒤 QR을 다시 스캔해 주세요.');
  }

  return parsed;
}

function getInitialParsedChallenge() {
  try {
    const challengeText = getInitialChallengeText();
    return challengeText ? parseGateChallenge(challengeText) : null;
  } catch {
    return null;
  }
}

async function buildProofPayload({ challenge, ticket, profile, savedVc }) {
  const startedAt = performance.now();
  const { input, proof, publicSignals } = await generateEntryProof({
    challenge,
    ticket,
    savedVc,
  });
  const generatedMs = Math.round(performance.now() - startedAt);

  return {
    type: 'QRushEntryProof',
    tokenId: input.tokenId,
    holderDid: profile?.holderDid || savedVc?.vc?.credentialSubject?.id || null,
    walletAddress: profile?.walletAddress || null,
    vcHash: input.vcHash,
    nonce: input.nonce,
    nonceHex: challenge.nonceHex || null,
    eventId: challenge.eventId,
    eventTitle: challenge.eventTitle || null,
    gateEndpoint: challenge.endpoint,
    proof,
    publicSignals,
    proofInput: input,
    proofMeta: {
      ...circuitMeta,
      generatedMs,
    },
    verifyProofBody: {
      proof,
      publicSignals,
      nonce: input.nonce,
      tokenId: input.tokenId,
      vcHash: input.vcHash,
    },
    createdAt: new Date().toISOString(),
  };
}

async function submitProofPayload(challenge, proofPayload) {
  const response = await fetch(challenge.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(proofPayload.verifyProofBody),
  });

  const resultText = await response.text();
  let result;

  try {
    result = resultText ? JSON.parse(resultText) : {};
  } catch {
    result = { message: resultText };
  }

  const gateResult = {
    ok: response.ok,
    status: response.status,
    body: result,
  };

  if (!response.ok) {
    throw new Error(result?.message || result?.error || `Gate verify failed (${response.status})`);
  }

  return gateResult;
}

function getChallengeKey(challenge, tokenId) {
  return `${challenge.nonce}|${challenge.endpoint}|${challenge.eventId}|${tokenId || ''}`;
}

function normalizeEventId(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  if (/^\d+$/.test(normalized)) return `match-${normalized.padStart(3, '0')}`;
  return normalized;
}

function ticketMatchesChallengeEvent(ticket, challenge) {
  const challengeEventId = normalizeEventId(challenge?.eventId);
  const ticketEventId = normalizeEventId(ticket?.eventId);

  if (challengeEventId && ticketEventId) {
    return challengeEventId === ticketEventId;
  }

  return Boolean(
    challenge?.eventTitle &&
    ticket?.eventTitle &&
    String(challenge.eventTitle).trim() === String(ticket.eventTitle).trim(),
  );
}

function findValidTicketForChallenge(tickets, challenge) {
  return tickets.find(
    (ticket) => ticket.status === 'VALID' && ticketMatchesChallengeEvent(ticket, challenge),
  );
}

function getChallengeEventLabel(challenge) {
  if (!challenge) return '-';
  return challenge.eventTitle || challenge.eventId || '-';
}

export default function EntryProofPage() {
  const [profile] = useState(() => loadHolderProfile(null));
  const [savedVc] = useState(() => loadVc(null));
  const [walletAddress, setWalletAddress] = useState(() => getInitialWalletAddress(profile));
  const [tickets, setTickets] = useState(() => loadTickets([]));
  const [selectedTokenId, setSelectedTokenId] = useState(() =>
    getInitialSelectedTokenId(loadTickets([])),
  );
  const [challengeText, setChallengeText] = useState(getInitialChallengeText);
  const [parsedChallenge, setParsedChallenge] = useState(getInitialParsedChallenge);
  const [entryProof, setEntryProof] = useState(() => loadLastEntryProof(null));
  const [gateResult, setGateResult] = useState(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');
  const [flowStep, setFlowStep] = useState('idle');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSyncingTickets, setIsSyncingTickets] = useState(false);
  const isProcessingRef = useRef(false);
  const handledChallengeKeyRef = useRef('');

  const handleChallengeTextChange = (event) => {
    if (isProcessingRef.current) return;

    handledChallengeKeyRef.current = '';
    setChallengeText(event.target.value);
    setParsedChallenge(null);
    setEntryProof(null);
    setGateResult(null);
    setFlowStep('idle');
    setStatusMessage('QR 값을 읽으면 자동으로 proof 생성과 Gate 제출을 진행합니다.');
    setError('');
  };

  const runAutomaticEntry = useCallback(async (rawChallengeText, { force = false } = {}) => {
    if (isProcessingRef.current) return null;

    setError('');
    setGateResult(null);

    try {
      const challenge = parseGateChallenge(rawChallengeText);
      const selectedTicket = findValidTicketForChallenge(tickets, challenge);
      const challengeKey = getChallengeKey(challenge, selectedTicket?.tokenId || selectedTokenId);

      if (!force && handledChallengeKeyRef.current === challengeKey) {
        return null;
      }

      handledChallengeKeyRef.current = challengeKey;
      isProcessingRef.current = true;
      setIsProcessing(true);
      setParsedChallenge(challenge);
      setEntryProof(null);

      if (selectedTicket) {
        setSelectedTokenId(selectedTicket.tokenId);
      }

      if (!savedVc) {
        throw new Error('저장된 VC가 없습니다. 먼저 VC 저장 화면에서 VC를 저장해 주세요.');
      }

      if (!selectedTicket) {
        throw new Error(
          `Gate에서 선택한 공연(${getChallengeEventLabel(challenge)})에 사용할 수 있는 VALID 티켓이 없습니다.`,
        );
      }

      setFlowStep('proof');
      setStatusMessage('증명 생성 중...');

      const proofPayload = await buildProofPayload({
        challenge,
        ticket: selectedTicket,
        profile,
        savedVc,
      });

      setEntryProof(proofPayload);
      saveLastEntryProof(proofPayload);

      setFlowStep('verify');
      setStatusMessage('입장 확인 중...');

      const nextGateResult = await submitProofPayload(challenge, proofPayload);

      setGateResult(nextGateResult);
      setFlowStep('done');
      setStatusMessage('입장 확인이 완료되었습니다.');
      return proofPayload;
    } catch (nextError) {
      setFlowStep('error');
      setError(nextError.message || '입장 proof 자동 처리에 실패했습니다.');
      return null;
    } finally {
      isProcessingRef.current = false;
      setIsProcessing(false);
    }
  }, [profile, savedVc, selectedTokenId, tickets]);

  useEffect(() => {
    if (!challengeText.trim() || isProcessingRef.current) return undefined;

    const timerId = window.setTimeout(() => {
      runAutomaticEntry(challengeText);
    }, 350);

    return () => window.clearTimeout(timerId);
  }, [challengeText, runAutomaticEntry]);

  const syncTickets = async () => {
    setError('');
    setStatusMessage('');
    setIsSyncingTickets(true);

    try {
      const syncedTickets = await fetchTicketsByWallet(walletAddress);
      saveTickets(syncedTickets);
      setTickets(syncedTickets);

      const challengeMatchedTicket = parsedChallenge
        ? findValidTicketForChallenge(syncedTickets, parsedChallenge)
        : null;
      const nextSelectedTokenId =
        challengeMatchedTicket?.tokenId ||
        syncedTickets.find((ticket) => ticket.status === 'VALID')?.tokenId ||
        syncedTickets[0]?.tokenId ||
        '';

      setSelectedTokenId(nextSelectedTokenId);

      setStatusMessage(
        nextSelectedTokenId
          ? `서버에서 티켓 ${syncedTickets.length}개를 동기화하고 #${nextSelectedTokenId}를 선택했습니다.`
          : '서버에서 조회된 티켓이 없습니다. 예매에 사용한 MetaMask 주소인지 확인해 주세요.',
      );
    } catch (nextError) {
      setError(nextError.message || '티켓 동기화에 실패했습니다.');
    } finally {
      setIsSyncingTickets(false);
    }
  };

  const copyEntryProof = async () => {
    if (!entryProof) return;

    await navigator.clipboard.writeText(JSON.stringify(entryProof.verifyProofBody, null, 2));
    setStatusMessage('/verify-proof 요청 payload를 클립보드에 복사했습니다.');
  };

  const flowTitle = {
    idle: 'QR 대기 중',
    proof: '증명 생성 중...',
    verify: '입장 확인 중...',
    done: gateResult?.ok ? '입장 승인' : '입장 확인 완료',
    error: '처리 실패',
  }[flowStep];

  const flowDescription = {
    idle: 'Gate QR을 읽으면 nonce를 파싱하고 proof 생성부터 Gate 제출까지 자동으로 진행합니다.',
    proof: '로컬 wasm/zkey로 Groth16 proof를 생성하고 있습니다. 잠시만 기다려 주세요.',
    verify: '생성한 proof를 Gate verify-proof endpoint로 제출하고 있습니다.',
    done: gateResult?.ok ? 'Gate가 proof를 검증했고 입장이 승인되었습니다.' : 'Gate 응답을 확인했습니다.',
    error: '같은 QR의 중복 제출은 막았습니다. 새 Gate QR을 다시 스캔해 주세요.',
  }[flowStep];

  return (
    <section className="content-stack">
      <div className="page-header">
        <p className="eyebrow">04 Entry Proof</p>
        <h2>입장 증명 생성</h2>
        <p>
          C 웹 Gate QR의 링크 또는 JSON을 읽고 nonce 십진값과 endpoint를 사용해 Groth16 proof를 생성한 뒤,
          서버의 verify-proof endpoint로 직접 제출합니다.
        </p>
      </div>

      <section className="panel privacy-panel">
        <div className="section-title">
          <h3>기기 밖으로 나가는 것과 안 나가는 것</h3>
          <span>입장 단계에서는 신원을 공개하지 않고 자격만 증명합니다.</span>
        </div>
        <div className="visibility-grid">
          <div className="visibility-column private">
            <span className="visibility-label">기기에만 남음</span>
            <strong>생년월일, 원본 VC, 개인키</strong>
            <p>birthdate는 witness로만 쓰이고 네트워크 요청에는 포함되지 않습니다.</p>
          </div>
          <div className="visibility-column public">
            <span className="visibility-label">서버로 전송됨</span>
            <strong>proof + publicSignals</strong>
            <p>[isAdult, vcHash, nonce, tokenId, currentDate]만 검증자에게 전달합니다.</p>
          </div>
        </div>
      </section>

      <div className="two-column">
        <section className="panel form-panel">
          <div className="section-title">
            <h3>Gate QR Payload 입력</h3>
            <span>GatePage QR 링크를 스캔하거나 Challenge JSON 문자열 전체를 붙여넣습니다. nonceHex는 사용하지 않습니다.</span>
          </div>

          <label>
            Gate Challenge QR 링크 또는 JSON
            <textarea
              value={challengeText}
              onChange={handleChallengeTextChange}
              disabled={isProcessing}
              placeholder='http://192.168.0.20:5174/entry?nonce=field-decimal&endpoint=http%3A%2F%2F192.168.0.20%3A3000%2Fapi%2Fgate%2Fverify-proof&expiresIn=30'
              rows={10}
            />
          </label>

          {parsedChallenge && (
            <div className="mini-summary">
              <div>
                <span>nonce</span>
                <strong>{parsedChallenge.nonce}</strong>
              </div>
              <div>
                <span>endpoint</span>
                <strong>{parsedChallenge.endpoint}</strong>
              </div>
              <div>
                <span>공연</span>
                <strong>{getChallengeEventLabel(parsedChallenge)}</strong>
              </div>
            </div>
          )}
        </section>

        <section className={`panel auto-flow-panel ${flowStep}`}>
          <div className={isProcessing ? 'spinner' : 'spinner idle'} aria-hidden="true" />
          <div>
            <h3>{flowTitle}</h3>
            <p>{flowDescription}</p>
            {parsedChallenge && (
              <small>
                {getChallengeEventLabel(parsedChallenge)} · nonce {parsedChallenge.nonce} · token #{selectedTokenId || '-'}
              </small>
            )}
          </div>
        </section>

        <section className={savedVc ? 'panel status-panel success' : 'panel status-panel warning'}>
          <div>
            <h3>{savedVc ? 'VC 사용 가능' : 'VC 없음'}</h3>
            <p>
              {savedVc
                ? `VC Hash: ${savedVc.vcHash}`
                : '입장 증명을 생성하려면 먼저 VC를 저장해야 합니다.'}
            </p>
          </div>
        </section>
      </div>

      <section className="panel proof-meta-panel">
        <div className="section-title">
          <h3>실제 증명 메타데이터</h3>
          <span>로컬 wasm/zkey로 생성하는 실제 proof입니다.</span>
        </div>
        <div className="proof-meta-grid">
          <div>
            <span>Protocol</span>
            <strong>{circuitMeta.scheme}</strong>
          </div>
          <div>
            <span>Curve</span>
            <strong>{circuitMeta.curve}</strong>
          </div>
          <div>
            <span>Constraints</span>
            <strong>{circuitMeta.constraints}</strong>
          </div>
          <div>
            <span>Signals</span>
            <strong>{circuitMeta.publicSignals} public</strong>
          </div>
          <div>
            <span>Private Inputs</span>
            <strong>{circuitMeta.privateInputs}</strong>
          </div>
          <div>
            <span>Last Generation</span>
            <strong>{entryProof?.proofMeta?.generatedMs ? `${entryProof.proofMeta.generatedMs}ms` : '-'}</strong>
          </div>
        </div>
      </section>

      <section className="panel form-panel">
        <div className="section-title">
          <h3>티켓 선택</h3>
          <span>
            {parsedChallenge
              ? `Gate 선택 공연: ${getChallengeEventLabel(parsedChallenge)}`
              : 'VALID 상태의 NFT 티켓만 입장 증명에 사용할 수 있습니다.'}
          </span>
        </div>

        <label>
          티켓 조회 지갑 주소
          <input
            value={walletAddress}
            onChange={(event) => setWalletAddress(event.target.value)}
            disabled={isProcessing}
            placeholder="0x..."
          />
        </label>

        <label>
          사용할 티켓
          <select
            value={selectedTokenId}
            onChange={(event) => setSelectedTokenId(event.target.value)}
            disabled={isProcessing}
          >
            {tickets.map((ticket) => (
              <option key={ticket.tokenId} value={ticket.tokenId}>
                #{ticket.tokenId} / {ticket.eventTitle} / {ticket.seat} / {ticket.status}
              </option>
            ))}
          </select>
        </label>

        <div className="ticket-mini-list">
          {tickets.map((ticket) => (
            <div
              key={ticket.tokenId}
              className={ticket.tokenId === selectedTokenId ? 'ticket-mini selected' : 'ticket-mini'}
            >
              <strong>#{ticket.tokenId}</strong>
              <span>{ticket.eventTitle}</span>
              <span>{ticket.seat}</span>
              <span className={ticket.status === 'VALID' ? 'badge valid' : 'badge used'}>{ticket.status}</span>
            </div>
          ))}
        </div>

        <div className="button-row">
          <button
            className="secondary-button"
            type="button"
            onClick={syncTickets}
            disabled={isSyncingTickets || isProcessing || !walletAddress}
          >
            {isSyncingTickets ? '티켓 동기화 중' : '서버에서 티켓 동기화'}
          </button>
          <button className="secondary-button" type="button" onClick={copyEntryProof} disabled={!entryProof || isProcessing}>
            /verify-proof payload 복사
          </button>
        </div>

        {statusMessage && <p className="success-text">{statusMessage}</p>}
        {error && <p className="error-text">{error}</p>}
      </section>

      {gateResult && (
        <section className={gateResult.ok ? 'panel status-panel success' : 'panel status-panel warning'}>
          <div>
            <h3>{gateResult.ok ? 'Gate 승인' : 'Gate 거부'}</h3>
            <p>HTTP {gateResult.status}</p>
          </div>
        </section>
      )}

      <JsonPreview title="Gate Verify Result" data={gateResult} />
      <JsonPreview title="Entry Proof Payload" data={entryProof} />
    </section>
  );
}
