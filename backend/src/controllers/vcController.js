/**
 * vcController.js
 *
 * POST /api/vc/register-vc : C 어드민(발급기관)이 VC 해시를 등록 (VCRegistry)
 * POST /api/vc/verify-vp   : D 앱이 만든 VP + 서명을 검증
 *
 * VP 포맷 (D 앱과 합의된 형태):
 * {
 *   "vp": {
 *     "holder": "0x... (지갑 주소)",
 *     "did": "did:qrush:user-...",
 *     "issuer": "0x... (발급기관 주소)",
 *     "vcHash": "1234... (Poseidon(birthdate, vcSecret), 십진수 문자열)",
 *     "claims": { "name": "홍길동", "age": 23 }
 *   },
 *   "signature": "0x..."  // signMessage(JSON.stringify(vp))
 * }
 */
const { ethers } = require("ethers");
const blockchain = require("../services/blockchain");
const bookingLogic = require("../services/bookingLogic");

exports.registerVC = async (req, res) => {
  try {
    const { vcHash, issuer } = req.body;
    if (!vcHash) {
      return res.status(400).json({ success: false, error: "vcHash is required" });
    }

    // 발급기관이 신뢰 기관인지 확인 (IssuerRegistry)
    if (issuer) {
      const trusted = await blockchain.isTrustedIssuer(issuer);
      if (!trusted) {
        return res.status(403).json({ success: false, error: "Issuer is not trusted" });
      }
    }

    const result = await blockchain.registerVC(vcHash);
    res.status(201).json({ success: true, txHash: result.txHash });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.verifyVP = async (req, res) => {
  try {
    const { vp, signature } = req.body;
    if (!vp || !signature) {
      return res.status(400).json({ success: false, error: "vp and signature are required" });
    }

    const { verified, signatureValid, issuerTrusted, vcValid } = await bookingLogic.verifyVP(vp, signature);
    const checks = { signatureValid, issuerTrusted, vcValid };

    if (!verified) {
      return res.status(401).json({ success: false, verified: false, ...checks });
    }
    res.json({ success: true, verified: true, holder: vp.holder, ...checks });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
