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

    // 1. 전자서명 검증: 서명자 == vp.holder
    let recovered;
    try {
      recovered = ethers.verifyMessage(JSON.stringify(vp), signature);
    } catch (e) {
      return res.status(400).json({ success: false, error: "Invalid signature format" });
    }
    if (recovered.toLowerCase() !== String(vp.holder).toLowerCase()) {
      return res.status(401).json({ success: false, verified: false, error: "Signature does not match holder" });
    }

    // 2. 발급기관 신뢰 여부 (IssuerRegistry.isTrusted)
    const trusted = await blockchain.isTrustedIssuer(vp.issuer);
    if (!trusted) {
      return res.status(401).json({ success: false, verified: false, error: "Issuer is not trusted" });
    }

    // 3. VC 해시 유효성 (VCRegistry.isValid — 폐기 여부 포함)
    const valid = await blockchain.isValidVC(vp.vcHash);
    if (!valid) {
      return res.status(401).json({ success: false, verified: false, error: "VC is not valid (not registered or revoked)" });
    }

    res.json({ success: true, verified: true, holder: recovered });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
