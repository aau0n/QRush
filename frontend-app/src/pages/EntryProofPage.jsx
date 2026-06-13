import { useState } from 'react';
import JsonPreview from '../components/JsonPreview.jsx';
import { mockHolderProfile } from '../data/mockWalletData.js';
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

const sampleGateChallenge = {
  type: 'QRushGateChallenge',
  nonce: '763585835955600474492399',
  nonceHex: '0xa1b21234567890abcdef',
  endpoint: 'http://192.168.0.20:3000/api/gate/verify-proof',
  expiresIn: 30,
};

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
  const endpoint = params.get('endpoint');
  if (!nonce) return '';

  return JSON.stringify(
    {
      type: 'QRushGateChallenge',
      nonce,
      endpoint: endpoint || '/api/gate/verify-proof',
      expiresIn: Number(params.get('expiresIn') || 30),
    },
    null,
    2,
  );
}

function parseGateChallenge(rawValue) {
  const parsed = JSON.parse(rawValue);

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
    holderDid: profile.holderDid,
    walletAddress: profile.walletAddress,
    vcHash: input.vcHash,
    nonce: input.nonce,
    nonceHex: challenge.nonceHex || null,
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

export default function EntryProofPage() {
  const [profile] = useState(() => loadHolderProfile(mockHolderProfile));
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
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSyncingTickets, setIsSyncingTickets] = useState(false);

  const fillSampleChallenge = () => {
    setChallengeText(JSON.stringify(sampleGateChallenge, null, 2));
    setStatusMessage('샘플 Gate Challenge JSON을 입력했습니다.');
    setError('');
  };

  const parseChallenge = () => {
    setError('');
    setStatusMessage('');
    setParsedChallenge(null);

    try {
      const parsed = parseGateChallenge(challengeText);
      setParsedChallenge(parsed);
      setStatusMessage('Gate Challenge를 정상적으로 읽었습니다.');
    } catch (nextError) {
      setError(nextError.message || 'Gate Challenge 파싱에 실패했습니다.');
    }
  };

  const syncTickets = async () => {
    setError('');
    setStatusMessage('');
    setIsSyncingTickets(true);

    try {
      const syncedTickets = await fetchTicketsByWallet(walletAddress);
      saveTickets(syncedTickets);
      setTickets(syncedTickets);

      const nextSelectedTokenId =
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

  const createEntryProof = async () => {
    setError('');
    setStatusMessage('');
    setGateResult(null);
    setIsGenerating(true);

    try {
      if (!profile) {
        throw new Error('Holder profile이 없습니다.');
      }

      if (!savedVc) {
        throw new Error('저장된 VC가 없습니다. 먼저 VC 저장 화면에서 VC를 저장해 주세요.');
      }

      const challenge = parsedChallenge || parseGateChallenge(challengeText);
      setParsedChallenge(challenge);

      const selectedTicket = tickets.find((ticket) => ticket.tokenId === selectedTokenId);

      if (!selectedTicket) {
        throw new Error('선택한 티켓을 찾을 수 없습니다.');
      }

      if (selectedTicket.status !== 'VALID') {
        throw new Error('사용 가능한 티켓만 입장 증명에 사용할 수 있습니다.');
      }

      const proofPayload = await buildProofPayload({
        challenge,
        ticket: selectedTicket,
        profile,
        savedVc,
      });

      setEntryProof(proofPayload);
      saveLastEntryProof(proofPayload);
      setStatusMessage(`ZKP entry proof를 생성했습니다. (${proofPayload.proofMeta.generatedMs}ms)`);
      return proofPayload;
    } catch (nextError) {
      setError(nextError.message || 'ZKP proof 생성에 실패했습니다.');
      return null;
    } finally {
      setIsGenerating(false);
    }
  };

  const submitEntryProof = async () => {
    setError('');
    setStatusMessage('');
    setGateResult(null);
    setIsSubmitting(true);

    try {
      const challenge = parsedChallenge || parseGateChallenge(challengeText);
      const proofPayload = entryProof || (await createEntryProof());

      if (!proofPayload) {
        throw new Error('제출할 proof payload가 없습니다.');
      }

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

      setGateResult({
        ok: response.ok,
        status: response.status,
        body: result,
      });

      if (!response.ok) {
        throw new Error(result?.message || result?.error || `Gate verify failed (${response.status})`);
      }

      setStatusMessage('Gate endpoint로 proof를 제출했습니다.');
    } catch (nextError) {
      setError(nextError.message || 'Gate endpoint 제출에 실패했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyEntryProof = async () => {
    if (!entryProof) return;

    await navigator.clipboard.writeText(JSON.stringify(entryProof.verifyProofBody, null, 2));
    setStatusMessage('/verify-proof 요청 payload를 클립보드에 복사했습니다.');
  };

  return (
    <section className="content-stack">
      <div className="page-header">
        <p className="eyebrow">04 Entry Proof</p>
        <h2>입장 증명 생성</h2>
        <p>
          C 웹 Gate QR의 JSON을 읽고 nonce 십진값과 endpoint를 사용해 Groth16 proof를 생성한 뒤,
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
            <span>GatePage QR의 JSON 문자열 전체를 붙여넣습니다. nonceHex는 사용하지 않습니다.</span>
          </div>

          <label>
            Gate Challenge JSON
            <textarea
              value={challengeText}
              onChange={(event) => setChallengeText(event.target.value)}
              placeholder='{"type":"QRushGateChallenge","nonce":"field decimal","endpoint":"http://192.168.0.20:3000/api/gate/verify-proof","expiresIn":30}'
              rows={10}
            />
          </label>

          <div className="button-row">
            <button className="secondary-button" type="button" onClick={fillSampleChallenge}>
              샘플 채우기
            </button>
            <button className="primary-button" type="button" onClick={parseChallenge} disabled={!challengeText}>
              Challenge 읽기
            </button>
          </div>

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
            </div>
          )}
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
          <span>mock payload가 아니라 로컬 wasm/zkey로 생성하는 proof입니다.</span>
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
          <span>VALID 상태의 NFT 티켓만 입장 증명에 사용할 수 있습니다.</span>
        </div>

        <label>
          티켓 조회 지갑 주소
          <input
            value={walletAddress}
            onChange={(event) => setWalletAddress(event.target.value)}
            placeholder="0x..."
          />
        </label>

        <label>
          사용할 티켓
          <select value={selectedTokenId} onChange={(event) => setSelectedTokenId(event.target.value)}>
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
            disabled={isSyncingTickets || !walletAddress}
          >
            {isSyncingTickets ? '티켓 동기화 중' : '서버에서 티켓 동기화'}
          </button>
          <button className="secondary-button" type="button" onClick={createEntryProof} disabled={isGenerating}>
            {isGenerating ? 'proof 생성 중' : '입장 proof 생성'}
          </button>
          <button className="primary-button" type="button" onClick={submitEntryProof} disabled={isGenerating || isSubmitting}>
            {isSubmitting ? 'Gate 제출 중' : 'Gate로 proof 제출'}
          </button>
          <button className="secondary-button" type="button" onClick={copyEntryProof} disabled={!entryProof}>
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
