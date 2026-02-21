import { ethers } from 'ethers';
import fs from 'fs';

async function main() {
    // 로컬 하드햇 노드 주소
    const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
    
    // 하드햇 노드의 첫 번째 계정 (기본 제공)
    const wallet = new ethers.Wallet('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', provider);

    // 컴파일된 ABI와 Bytecode 가져오기
    const artifact = JSON.parse(fs.readFileSync('./artifacts/contracts/TicketNFT.sol/TicketNFT.json', 'utf8'));
    
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
    
    console.log('Deploying TicketNFT via direct ethers...');
    const contract = await factory.deploy();
    await contract.waitForDeployment();

    console.log('-----------------------------------------');
    console.log('TicketNFT deployed to:', await contract.getAddress());
    console.log('-----------------------------------------');
}

main().catch(console.error);
