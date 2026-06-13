import { useState } from 'react';
import JsonPreview from '../components/JsonPreview.jsx';
import { mockHolderProfile, mockTickets } from '../data/mockWalletData.js';
import { generateEntryProof } from '../services/zkpProof.js';
import {
  loadHolderProfile,
  loadLastEntryProof,
  loadSelectedTicket,
  loadTickets,
  loadVc,
  saveLastEntryProof,
} from '../services/storage.js';

const sampleGateChallenge = {
  type: 'QRushGateChallenge',
  nonce: 'a1b21234567890abcdef',
  endpoint: '/verify-proof',
  expiresIn: 30,
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

async function buildProofPayload({ challenge, ticket, profile, savedVc }) {
  const { input, proof, publicSignals } = await generateEntryProof({
    challenge,
    ticket,
    savedVc,
  });

  return {
    type: 'QRushEntryProof',
    tokenId: ticket.tokenId,
    holderDid: profile.holderDid,
    walletAddress: profile.walletAddress,
    vcHash: input.vcHash,
    nonce: challenge.nonce,
    gateEndpoint: challenge.endpoint || '/verify-proof',
    proof,
    publicSignals,
    proofInput: input,
    verifyProofBody: {
      proof,
      publicSignals,
      nonce: challenge.nonce,
      tokenId: ticket.tokenId,
    },
    createdAt: new Date().toISOString(),
  };
}

export default function EntryProofPage() {
  const [profile] = useState(() => loadHolderProfile(mockHolderProfile));
  const [savedVc] = useState(() => loadVc(null));
  const [tickets] = useState(() => loadTickets(mockTickets));
  const [selectedTokenId, setSelectedTokenId] = useState(() =>
    getInitialSelectedTokenId(loadTickets(mockTickets)),
  );
  const [challengeText, setChallengeText] = useState('');
  const [parsedChallenge, setParsedChallenge] = useState(null);
  const [entryProof, setEntryProof] = useState(() => loadLastEntryProof(null));
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

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
      const parsed = JSON.parse(challengeText);

      if (parsed.type !== 'QRushGateChallenge') {
        throw new Error('type이 QRushGateChallenge인 Gate QR payload만 사용할 수 있습니다.');
      }

      if (!parsed.nonce) {
        throw new Error('Gate Challenge에 nonce가 없습니다.');
      }

      setParsedChallenge(parsed);
      setStatusMessage('Gate Challenge를 정상적으로 읽었습니다.');
    } catch (nextError) {
      setError(nextError.message || 'Gate Challenge 파싱에 실패했습니다.');
    }
  };

  const createEntryProof = async () => {
    setError('');
    setStatusMessage('');
    setIsGenerating(true);

    try {
      if (!profile) {
        throw new Error('Holder profile이 없습니다.');
      }

      if (!savedVc) {
        throw new Error('저장된 VC가 없습니다. 먼저 VC 저장 화면에서 VC를 저장해주세요.');
      }

      if (!parsedChallenge) {
        throw new Error('먼저 Gate Challenge를 파싱해주세요.');
      }

      const selectedTicket = tickets.find((ticket) => ticket.tokenId === selectedTokenId);

      if (!selectedTicket) {
        throw new Error('선택한 티켓을 찾을 수 없습니다.');
      }

      if (selectedTicket.status !== 'VALID') {
        throw new Error('사용 가능한 티켓만 입장 증명에 사용할 수 있습니다.');
      }

      const proofPayload = await buildProofPayload({
        challenge: parsedChallenge,
        ticket: selectedTicket,
        profile,
        savedVc,
      });

      setEntryProof(proofPayload);
      saveLastEntryProof(proofPayload);
      setStatusMessage('ZKP entry proof payload를 생성했습니다.');
    } catch (nextError) {
      setError(nextError.message || 'ZKP proof 생성에 실패했습니다.');
    } finally {
      setIsGenerating(false);
    }
  };

  const copyEntryProof = async () => {
    if (!entryProof) return;

    const payload = entryProof.verifyProofBody || {
      proof: entryProof.proof,
      publicSignals: entryProof.publicSignals,
      nonce: entryProof.nonce,
      tokenId: entryProof.tokenId,
    };

    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setStatusMessage('/verify-proof 요청 payload를 클립보드에 복사했습니다.');
  };

  return (
    <section className="content-stack">
      <div className="page-header">
        <p className="eyebrow">04 Entry Proof</p>
        <h2>입장 증명 생성</h2>
        <p>
          C의 Gate 화면에서 nonce QR payload를 입력받고, 사용 가능한 티켓과 VC를 기반으로
          입장 검증용 Groth16 proof payload를 생성합니다.
        </p>
      </div>

      <div className="two-column">
        <section className="panel form-panel">
          <div className="section-title">
            <h3>Gate QR Payload 입력</h3>
            <span>C Gate 화면 QR을 스캔한 결과를 붙여넣는 영역입니다.</span>
          </div>

          <label>
            Gate Challenge JSON
            <textarea
              value={challengeText}
              onChange={(event) => setChallengeText(event.target.value)}
              placeholder='{"type":"QRushGateChallenge","nonce":"...","endpoint":"/verify-proof","expiresIn":30}'
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
                <strong>{parsedChallenge.endpoint || '/verify-proof'}</strong>
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

      <section className="panel form-panel">
        <div className="section-title">
          <h3>티켓 선택</h3>
          <span>VALID 상태의 NFT 티켓만 입장 증명에 사용할 수 있습니다.</span>
        </div>

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
          <button className="primary-button" type="button" onClick={createEntryProof} disabled={isGenerating}>
            {isGenerating ? 'proof 생성 중' : '입장 proof 생성'}
          </button>
          <button className="secondary-button" type="button" onClick={copyEntryProof} disabled={!entryProof}>
            /verify-proof payload 복사
          </button>
        </div>

        {statusMessage && <p className="success-text">{statusMessage}</p>}
        {error && <p className="error-text">{error}</p>}
      </section>

      <JsonPreview title="Entry Proof Payload" data={entryProof} />
    </section>
  );
}
