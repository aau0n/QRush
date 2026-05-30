// scripts/deploy.js
// QRush 스마트 컨트랙트 배포 스크립트
// 배포 순서: IssuerRegistry → VCRegistry → ZKPVerifier → TicketNFT

const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("=".repeat(60));
  console.log("QRush Contract Deployment");
  console.log("=".repeat(60));
  console.log(`Deployer : ${deployer.address}`);
  console.log(`Balance  : ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`);
  console.log("");

  // ── 1. IssuerRegistry ────────────────────────────────────────────────────
  console.log("1/4 Deploying IssuerRegistry...");
  const IssuerRegistry = await ethers.getContractFactory("IssuerRegistry");
  const issuerRegistry = await IssuerRegistry.deploy();
  await issuerRegistry.waitForDeployment();
  const issuerRegistryAddr = await issuerRegistry.getAddress();
  console.log(`    ✓ IssuerRegistry : ${issuerRegistryAddr}`);

  // ── 2. VCRegistry ────────────────────────────────────────────────────────
  console.log("2/4 Deploying VCRegistry...");
  const VCRegistry = await ethers.getContractFactory("VCRegistry");
  const vcRegistry = await VCRegistry.deploy(issuerRegistryAddr);
  await vcRegistry.waitForDeployment();
  const vcRegistryAddr = await vcRegistry.getAddress();
  console.log(`    ✓ VCRegistry     : ${vcRegistryAddr}`);

  // ── 3. ZKPVerifier ───────────────────────────────────────────────────────
  // TODO: A의 verifier.sol이 준비되면 이 부분을 실제 Groth16 verifier로 교체
  console.log("3/4 Deploying ZKPVerifier (stub)...");
  const ZKPVerifier = await ethers.getContractFactory("ZKPVerifier");
  const zkpVerifier = await ZKPVerifier.deploy();
  await zkpVerifier.waitForDeployment();
  const zkpVerifierAddr = await zkpVerifier.getAddress();
  console.log(`    ✓ ZKPVerifier    : ${zkpVerifierAddr}`);

  // ── 4. TicketNFT ─────────────────────────────────────────────────────────
  console.log("4/4 Deploying TicketNFT...");
  const TicketNFT = await ethers.getContractFactory("TicketNFT");
  const ticketNFT = await TicketNFT.deploy(zkpVerifierAddr, vcRegistryAddr);
  await ticketNFT.waitForDeployment();
  const ticketNFTAddr = await ticketNFT.getAddress();
  console.log(`    ✓ TicketNFT      : ${ticketNFTAddr}`);

  // ── 초기 설정 ────────────────────────────────────────────────────────────
  console.log("\nPost-deploy setup...");

  // 예매 서버(deployer)를 minter로 등록
  await ticketNFT.authorizeMinter(deployer.address);
  console.log(`    ✓ Minter authorized: ${deployer.address}`);

  // ── 주소 파일 저장 (A, C, D 공유용) ──────────────────────────────────────
  const addresses = {
    network: (await ethers.provider.getNetwork()).name,
    deployedAt: new Date().toISOString(),
    contracts: {
      IssuerRegistry: issuerRegistryAddr,
      VCRegistry:     vcRegistryAddr,
      ZKPVerifier:    zkpVerifierAddr,
      TicketNFT:      ticketNFTAddr,
    },
  };

  const outputPath = path.join(__dirname, "../deployed-addresses.json");
  fs.writeFileSync(outputPath, JSON.stringify(addresses, null, 2));

  console.log("\n" + "=".repeat(60));
  console.log("Deployment complete!");
  console.log("Contract addresses saved to: deployed-addresses.json");
  console.log("=".repeat(60));
  console.log(JSON.stringify(addresses.contracts, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
