import { ethers } from 'ethers';
import fs from 'fs';

async function main() {
    const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
    const wallet = new ethers.Wallet('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', provider);

    const contractAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
    const artifact = JSON.parse(fs.readFileSync('./artifacts/contracts/TicketNFT.sol/TicketNFT.json', 'utf8'));
    const contract = new ethers.Contract(contractAddress, artifact.abi, wallet);

    // 전송받을 지갑 (Account #1)
    const receiver = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

    console.log('--- 티켓 전송 시작 ---');
    console.log('보내는 사람:', wallet.address);
    console.log('받는 사람:', receiver);
    
    // 0번 티켓 전송
    const tx = await contract.transferFrom(wallet.address, receiver, 0);
    await tx.wait();

    console.log('-----------------------------------------');
    console.log('✅ 티켓 전송 성공!');
    console.log('트랜잭션 해시:', tx.hash);
    
    const balance = await contract.balanceOf(receiver);
    console.log('받은 사람의 현재 티켓 개수:', balance.toString(), '개');
}

main().catch(console.error);
