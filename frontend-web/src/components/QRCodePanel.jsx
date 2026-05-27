import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export default function QRCodePanel({ label, value }) {
  const [dataUrl, setDataUrl] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function buildQr() {
      if (!value) {
        setDataUrl('');
        return;
      }

      const url = await QRCode.toDataURL(value, {
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 280,
      });

      if (!cancelled) setDataUrl(url);
    }

    buildQr();
    return () => {
      cancelled = true;
    };
  }, [value]);

  return (
    <section className="qr-panel" aria-label={label}>
      <div className="qr-frame">
        {dataUrl ? <img src={dataUrl} alt={label} /> : <span>QR 준비 중</span>}
      </div>
      <p>{label}</p>
    </section>
  );
}
