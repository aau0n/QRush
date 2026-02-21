import { ethers } from 'ethers';
import fs from 'fs';

async function main() {
    const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
    // 하드햇 노드의 첫 번째 계정 (지갑 주인)
    const wallet = new ethers.Wallet('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', provider);

    const contractAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
    const artifact = JSON.parse(fs.readFileSync('./artifacts/contracts/TicketNFT.sol/TicketNFT.json', 'utf8'));
    const contract = new ethers.Contract(contractAddress, artifact.abi, wallet);

    console.log('--- 티켓 발행 시작 ---');
    console.log('발행 대상 지갑:', wallet.address);
    
    // 티켓 발행 함수 호출
    const tx = await contract.mintTicket(wallet.address);
    console.log('트랜잭션 전송됨... 대기 중...');
    
    await tx.wait();

    console.log('-----------------------------------------');
    console.log('✅ 티켓 발행 성공!');
    console.log('트랜잭션 해시:', tx.hash);
    console.log('-----------------------------------------');

    // 내 잔액 확인
    const balance = await contract.balanceOf(wallet.address);
    console.log('현재 내 지갑의 티켓 개수:', balance.toString(), '개');
}

main().catch(console.error);
