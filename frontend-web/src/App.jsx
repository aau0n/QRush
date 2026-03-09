import { useState } from 'react';
import { ethers } from 'ethers';

function App() {
  const [walletAddress, setWalletAddress] = useState("");
  const [isBooked, setIsBooked] = useState(false); // 예매 완료 상태 확인용

  // 1. 지갑 연결 함수 (아까 만든 것 그대로)
  const connectWallet = async () => {
    if (typeof window.ethereum !== "undefined") {
      try {
        const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
        setWalletAddress(accounts[0]);
      } catch (error) {
        console.error("지갑 연결 실패:", error);
      }
    } else {
      alert("MetaMask를 설치해주세요!");
    }
  };

  // 2. 예매하기 버튼 함수 (새로 추가됨! ⭐)
  const handleReserve = async (concertName) => {
    if (!walletAddress) {
      alert("먼저 지갑을 연결해주세요!");
      return;
    }

    try {
      // ethers.js를 사용해 메타마스크 띄우기 세팅
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();

      // [핵심] 나중에 여기에 팀원 A가 만든 스마트 컨트랙트(NFT Mint) 호출 코드가 들어갑니다!
      // 지금은 컨트랙트가 없으므로, 메타마스크 서명 창만 띄우는 가짜(Test) 로직을 넣습니다.
      console.log("예매 트랜잭션 진행 중...");
      const message = `${concertName} 티켓 예매를 위한 서명입니다.`;
      
      // 메타마스크 창이 뜨면서 서명을 요구함!
      const signature = await signer.signMessage(message); 
      
      console.log("서명 완료! 서명값:", signature);
      alert("🎉 예매(서명)가 완료되었습니다!");
      setIsBooked(true); // 예매 완료 화면으로 넘기기

    } catch (error) {
      console.error("예매 중 에러 발생:", error);
      alert("예매가 취소되었거나 에러가 발생했습니다.");
    }
  };

  return (
    <div style={{ padding: "40px", fontFamily: "sans-serif", maxWidth: "600px", margin: "0 auto" }}>
      <h1 style={{ textAlign: "center" }}>🎟️ QRush 티켓 예매</h1>

      {/* 상단 지갑 연결 상태바 */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "30px" }}>
        {walletAddress ? (
          <span style={{ background: "#e0f7fa", padding: "10px", borderRadius: "8px", fontWeight: "bold" }}>
            🟢 연결됨: {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
          </span>
        ) : (
          <button onClick={connectWallet} style={{ padding: "10px 20px", background: "#F6851B", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "bold" }}>
            🦊 메타마스크 연결
          </button>
        )}
      </div>

      {/* 화면 분기: 예매 완료 전 vs 후 */}
      {!isBooked ? (
        // [공연 목록 UI 화면]
        <div style={{ border: "1px solid #ddd", borderRadius: "10px", padding: "20px", boxShadow: "0 4px 8px rgba(0,0),0,0.1)" }}>
          <div style={{ background: "#f0f0f0", height: "200px", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "20px" }}>
            <span style={{ fontSize: "50px" }}>🎸</span>
          </div>
          <h2>이화여대 대동제 초청 공연</h2>
          <p style={{ color: "#666" }}>일시: 2026. 05. 20 (수)</p>
          <p style={{ fontWeight: "bold", fontSize: "18px" }}>가격: 0.01 ETH</p>
          
          {/* 예매하기 버튼 */}
          <button 
            onClick={() => handleReserve("이화여대 대동제 초청 공연")}
            style={{ width: "100%", padding: "15px", marginTop: "10px", background: "#007BFF", color: "white", border: "none", borderRadius: "8px", fontSize: "18px", cursor: "pointer", fontWeight: "bold" }}
          >
            티켓 예매하기
          </button>
        </div>
      ) : (
        // [예매 완료 화면]
        <div style={{ textAlign: "center", padding: "50px 20px", border: "2px solid #4CAF50", borderRadius: "10px", background: "#f9fff9" }}>
          <h1 style={{ fontSize: "60px", margin: "0 0 20px 0" }}>🎊</h1>
          <h2>예매가 완료되었습니다!</h2>
          <p>발급된 NFT 티켓은 QRush 앱(지갑)에서 확인하실 수 있습니다.</p>
          <button 
            onClick={() => setIsBooked(false)} 
            style={{ marginTop: "30px", padding: "10px 20px", background: "#333", color: "white", border: "none", borderRadius: "8px", cursor: "pointer" }}
          >
            돌아가기
          </button>
        </div>
      )}
    </div>
  );
}

export default App;