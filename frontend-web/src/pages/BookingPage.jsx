import { useMemo, useState } from 'react';
import { ethers } from 'ethers';
import QRCodePanel from '../components/QRCodePanel.jsx';
import { mintTicket, verifyVp } from '../api/qrushApi.js';
import { mockEvents, seatRows } from '../data/mockData.js';

export default function BookingPage() {
  const eventId = new URLSearchParams(window.location.search).get('eventId') || mockEvents[0].id;
  const event = mockEvents.find((item) => item.id === eventId) || mockEvents[0];
  const [walletAddress, setWalletAddress] = useState('');
  const [selectedSeat, setSelectedSeat] = useState('A1');
  const [vpText, setVpText] = useState('');
  const [signature, setSignature] = useState('');
  const [bookingResult, setBookingResult] = useState(null);
  const [status, setStatus] = useState('idle');

  const deeplink = useMemo(() => {
    const params = new URLSearchParams({
      eventId: event.id,
      seat: selectedSeat,
      callback: `${window.location.origin}/booking`,
    });

    return `qrush://create-vp?${params.toString()}`;
  }, [event.id, selectedSeat]);

  const connectWallet = async () => {
    if (!window.ethereum) {
      alert('MetaMask를 설치하거나 지갑 브라우저에서 열어주세요.');
      return;
    }

    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    setWalletAddress(accounts[0]);
  };

  const signMockVp = async () => {
    if (!window.ethereum) {
      alert('MetaMask가 필요합니다.');
      return;
    }

    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const vp = {
      type: 'QRushBookingVP',
      eventId: event.id,
      seat: selectedSeat,
      audience: walletAddress || (await signer.getAddress()),
      createdAt: new Date().toISOString(),
    };
    const vpJson = JSON.stringify(vp, null, 2);

    setWalletAddress(vp.audience);
    setVpText(vpJson);
    setSignature(await signer.signMessage(vpJson));
  };

  const submitBooking = async () => {
    setStatus('loading');
    setBookingResult(null);

    try {
      const parsedVp = JSON.parse(vpText);
      const verifyResult = await verifyVp(parsedVp, signature);

      if (!verifyResult.verified) {
        setBookingResult({ ok: false, message: verifyResult.reason || 'VP 검증 실패' });
        setStatus('done');
        return;
      }

      const mintResult = await mintTicket({
        eventId: event.id,
        seat: selectedSeat,
        walletAddress: parsedVp.audience,
      });

      setBookingResult({
        ok: true,
        tokenId: mintResult.tokenId,
        txHash: mintResult.txHash,
        message: '예매가 완료되었습니다.',
      });
      setStatus('done');
    } catch (error) {
      setBookingResult({ ok: false, message: error.message || '예매 처리 실패' });
      setStatus('done');
    }
  };

  return (
    <section className="content-stack">
      <div className="page-header">
        <p className="eyebrow">03 Booking</p>
        <h2>좌석 선택과 예매 처리</h2>
        <p>D 앱에 VP 생성을 요청하고, 받은 VP와 서명을 A 서버로 검증한 뒤 티켓 mint를 호출합니다.</p>
      </div>

      <div className="two-column wide-left">
        <section className="panel">
          <div className="section-title">
            <h3>{event.title}</h3>
            <span>
              {event.date} {event.time} / {event.venue}
            </span>
          </div>

          <div className="screen-marker">STAGE</div>
          <div className="seat-map" aria-label="좌석 선택">
            {seatRows.map((row) =>
              Array.from({ length: 6 }, (_, index) => {
                const seat = `${row}${index + 1}`;
                return (
                  <button
                    className={selectedSeat === seat ? 'seat selected' : 'seat'}
                    key={seat}
                    onClick={() => setSelectedSeat(seat)}
                    type="button"
                  >
                    {seat}
                  </button>
                );
              }),
            )}
          </div>

          <div className="booking-actions">
            <button className="secondary-button" onClick={connectWallet} type="button">
              {walletAddress
                ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
                : '지갑 연결'}
            </button>
            <button className="secondary-button" onClick={signMockVp} type="button">
              MetaMask로 mock VP 서명
            </button>
          </div>
        </section>

        <section className="panel">
          <QRCodePanel label="D 앱 VP 생성 요청 QR" value={deeplink} />
          <pre>{deeplink}</pre>
        </section>
      </div>

      <section className="panel form-panel">
        <div className="section-title">
          <h3>VP 검증 + 티켓 발급</h3>
          <span>D 앱 연동 전에는 아래 입력창으로 mock 검증할 수 있습니다.</span>
        </div>

        <label>
          VP JSON
          <textarea
            onChange={(event) => setVpText(event.target.value)}
            placeholder='{"type":"QRushBookingVP","audience":"0x..."}'
            rows={8}
            value={vpText}
          />
        </label>

        <label>
          Signature
          <input
            onChange={(event) => setSignature(event.target.value)}
            placeholder="0x..."
            type="text"
            value={signature}
          />
        </label>

        <button
          className="primary-button"
          disabled={status === 'loading' || !vpText || !signature}
          onClick={submitBooking}
          type="button"
        >
          {status === 'loading' ? '처리 중' : '검증하고 티켓 발급'}
        </button>

        {bookingResult && (
          <div className={bookingResult.ok ? 'status-box allowed' : 'status-box denied'}>
            <h3>{bookingResult.message}</h3>
            {bookingResult.tokenId && <p>tokenId: {bookingResult.tokenId}</p>}
            {bookingResult.txHash && <code>{bookingResult.txHash}</code>}
          </div>
        )}
      </section>
    </section>
  );
}
