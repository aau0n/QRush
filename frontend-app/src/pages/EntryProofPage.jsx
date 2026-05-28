import { useEffect, useState } from 'react';
import JsonPreview from '../components/JsonPreview.jsx';
import { mockHolderProfile, mockTickets } from '../data/mockWalletData.js';
import {
  loadHolderProfile,
  loadLastEntryProof,
  loadSelectedTicket,
  loadTickets,
  loadVc,
  saveHolderProfile,
  saveLastEntryProof,
  saveTickets,
} from '../services/storage.js';

const sampleGateChallenge = {
  type: 'QRushGateChallenge',
  nonce: 'mock-nonce-1234567890abcdef',
  endpoint: '/verify-proof',
  expiresIn: 30,
};

function buildMockProof({ challenge, ticket, profile, savedVc }) {
  return {
    type: 'QRushEntryProof',
    tokenId: ticket.tokenId,
    holderDid: profile.holderDid,
    walletAddress: profile.walletAddress,
    vcHash: savedVc?.vcHash || null,
    nonce: challenge.nonce,
    gateEndpoint: challenge.endpoint || '/verify-proof',
    proof: {
      pi_a: ['mock-pi-a-1', 'mock-pi-a-2'],
      pi_b: [
        ['mock-pi-b-1', 'mock-pi-b-2'],
        ['mock-pi-b-3', 'mock-pi-b-4'],
      ],
      pi_c: ['mock-pi-c-1', 'mock-pi-c-2'],
      protocol: 'groth16',
      curve: 'bn128',
    },
    publicSignals: [
      challenge.nonce,
      ticket.tokenId,
      savedVc?.vcHash || 'no-vc-hash',
    ],
    createdAt: new Date().toISOString(),
  };
}

export default function EntryProofPage() {
  const [profile, setProfile] = useState(null);
  const [savedVc, setSavedVc] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [selectedTokenId, setSelectedTokenId] = useState('');
  const [challengeText, setChallengeText] = useState('');
  const [parsedChallenge, setParsedChallenge] = useState(null);
  const [entryProof, setEntryProof] = useState(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const currentProfile = loadHolderProfile(mockHolderProfile);
    const currentTickets = loadTickets(mockTickets);
    const currentVc = loadVc(null);
    const lastProof = loadLastEntryProof(null);
    const selectedTicketFromWallet = loadSelectedTicket(null);

    saveHolderProfile(currentProfile);
    saveTickets(currentTickets);

    setProfile(currentProfile);
    setTickets(currentTickets);
    setSavedVc(currentVc);

    const selectedTicketStillExists = currentTickets.find(
    (ticket) => ticket.tokenId === selectedTicketFromWallet?.tokenId,
    );

    if (selectedTicketStillExists) {
    setSelectedTokenId(selectedTicketStillExists.tokenId);
    setStatusMessage(`티켓 목록에서 선택한 #${selectedTicketStillExists.tokenId}를 자동으로 불러왔습니다.`);
    } else {
    setSelectedTokenId(
        currentTickets.find((ticket) => ticket.status === 'VALID')?.tokenId ||
        currentTickets[0]?.tokenId ||
        '',
    );
    }

    if (lastProof) {
    setEntryProof(lastProof);
    }
  }, []);

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

  const createEntryProof = () => {
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

    if (!parsedChallenge) {
      setError('먼저 Gate Challenge를 파싱해 주세요.');
      return;
    }

    const selectedTicket = tickets.find((ticket) => ticket.tokenId === selectedTokenId);

    if (!selectedTicket) {
      setError('선택된 티켓을 찾을 수 없습니다.');
      return;
    }

    if (selectedTicket.status !== 'VALID') {
      setError('사용 가능한 티켓만 입장 증명에 사용할 수 있습니다.');
      return;
    }

    const proofPayload = buildMockProof({
      challenge: parsedChallenge,
      ticket: selectedTicket,
      profile,
      savedVc,
    });

    setEntryProof(proofPayload);
    saveLastEntryProof(proofPayload);
    setStatusMessage('입장용 mock proof payload를 생성했습니다.');
  };

  const copyEntryProof = async () => {
    if (!entryProof) return;

    await navigator.clipboard.writeText(JSON.stringify(entryProof, null, 2));
    setStatusMessage('/verify-proof 요청 payload를 클립보드에 복사했습니다.');
  };

  return (
    <section className="content-stack">
      <div className="page-header">
        <p className="eyebrow">04 Entry Proof</p>
        <h2>입장 증명 생성</h2>
        <p>
          C 웹 Gate 화면의 nonce QR payload를 입력받고, 사용 가능한 티켓과 VC를 기반으로
          입장 검증용 proof payload를 생성합니다.
        </p>
      </div>

      <div className="two-column">
        <section className="panel form-panel">
          <div className="section-title">
            <h3>Gate QR Payload 입력</h3>
            <span>C 웹 Gate 화면 QR을 스캔한 결과를 붙여넣는 자리입니다.</span>
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
          <button className="primary-button" type="button" onClick={createEntryProof}>
            입장 proof 생성
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