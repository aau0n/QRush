import { useState } from 'react';
import { ethers } from 'ethers';

function App() {
  // 지갑 주소를 저장할 상태 공간 (초기값은 빈 문자열)
  const [walletAddress, setWalletAddress] = useState("");

  // 지갑 연결 버튼을 눌렀을 때 실행될 함수
  const connectWallet = async () => {
    // 1. 브라우저에 메타마스크가 깔려 있는지 확인
    if (typeof window.ethereum !== "undefined") {
      try {
        // 2. 메타마스크 창을 띄워서 연결 권한 요청
        const accounts = await window.ethereum.request({
          method: "eth_requestAccounts",
        });
        // 3. 사용자가 승인하면, 첫 번째 지갑 주소를 화면에 저장
        setWalletAddress(accounts[0]);
        console.log("연결된 지갑 주소:", accounts[0]);
      } catch (error) {
        console.error("지갑 연결 실패:", error);
      }
    } else {
      // 메타마스크가 없으면 경고창 띄우기
      alert("크롬 익스텐션에서 MetaMask를 먼저 설치해주세요!");
    }
  };

  return (
    <div style={{ padding: "50px", textAlign: "center", fontFamily: "sans-serif" }}>
      <h1>🎟️ QRush 예매 사이트</h1>
      
      {/* 지갑 주소가 있으면 주소를 보여주고, 없으면 연결 버튼을 보여줌 */}
      {walletAddress ? (
        <div style={{ marginTop: "20px", padding: "20px", backgroundColor: "#f0f0f0", borderRadius: "10px" }}>
          <h3>✅ 지갑 연결 완료!</h3>
          <p style={{ wordBreak: "break-all", fontWeight: "bold", color: "#333" }}>
            {walletAddress}
          </p>
        </div>
      ) : (
        <button 
          onClick={connectWallet} 
          style={{ 
            marginTop: "20px", 
            padding: "15px 30px", 
            fontSize: "18px", 
            backgroundColor: "#F6851B", // 메타마스크 여우 색상
            color: "white", 
            border: "none", 
            borderRadius: "5px",
            cursor: "pointer",
            fontWeight: "bold"
          }}
        >
          🦊 메타마스크 지갑 연결
        </button>
      )}
    </div>
  );
}

export default App;