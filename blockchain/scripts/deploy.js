// scripts/deploy.js
// QRush 스마트 컨트랙트 배포 스크립트
// 배포 순서: IssuerRegistry → VCRegistry → ZKPVerifier → TicketNFT

const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Hardhat node account #1 — A(예매 서버) 기본값
const DEFAULT_SERVER_ADDRESS = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("=".repeat(60));
  console.log("QRush Contract Deployment");
  console.log("=".repeat(60));
  console.log(`Deployer : ${deployer.address}`);
  console.log(`Balance  : ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`);
  console.log("");

  console.log("1/4 Deploying IssuerRegistry...");
  const IssuerRegistry = await ethers.getContractFactory("IssuerRegistry");
  const issuerRegistry = await IssuerRegistry.deploy();
  await issuerRegistry.waitForDeployment();
  const issuerRegistryAddr = await issuerRegistry.getAddress();
  console.log(`    ✓ IssuerRegistry : ${issuerRegistryAddr}`);

  console.log("2/4 Deploying VCRegistry...");
  const VCRegistry = await ethers.getContractFactory("VCRegistry");
  const vcRegistry = await VCRegistry.deploy(issuerRegistryAddr);
  await vcRegistry.waitForDeployment();
  const vcRegistryAddr = await vcRegistry.getAddress();
  console.log(`    ✓ VCRegistry     : ${vcRegistryAddr}`);

  console.log("3/4 Deploying ZKPVerifier...");
  const ZKPVerifier = await ethers.getContractFactory("ZKPVerifier");
  const zkpVerifier = await ZKPVerifier.deploy();
  await zkpVerifier.waitForDeployment();
  const zkpVerifierAddr = await zkpVerifier.getAddress();
  console.log(`    ✓ ZKPVerifier    : ${zkpVerifierAddr}`);

  console.log("4/4 Deploying TicketNFT...");
  const TicketNFT = await ethers.getContractFactory("TicketNFT");
  const ticketNFT = await TicketNFT.deploy(zkpVerifierAddr, vcRegistryAddr);
  await ticketNFT.waitForDeployment();
  const ticketNFTAddr = await ticketNFT.getAddress();
  console.log(`    ✓ TicketNFT      : ${ticketNFTAddr}`);

  console.log("\nPost-deploy setup...");
  const serverAddress = process.env.SERVER_MINTER_ADDRESS || DEFAULT_SERVER_ADDRESS;
  await ticketNFT.authorizeMinter(serverAddress);
  console.log(`    ✓ Minter authorized: ${serverAddress}`);

  await issuerRegistry.registerIssuer(deployer.address, "QRush Admin");
  console.log(`    ✓ Issuer registered: ${deployer.address}`);

  await issuerRegistry.registerIssuer(serverAddress, "QRush Server");
  console.log(`    ✓ Issuer registered: ${serverAddress} (register-vc용)`);

  await ticketNFT.transferOwnership(serverAddress);
  console.log(`    ✓ TicketNFT ownership → ${serverAddress} (registerNonce용)`);

  const network = await ethers.provider.getNetwork();
  const addresses = {
    network: network.name,
    chainId: Number(network.chainId),
    rpcUrl: "http://127.0.0.1:8545",
    deployedAt: new Date().toISOString(),
    contracts: {
      IssuerRegistry: issuerRegistryAddr,
      VCRegistry: vcRegistryAddr,
      ZKPVerifier: zkpVerifierAddr,
      TicketNFT: ticketNFTAddr,
    },
    serverWallet: {
      address: serverAddress,
      note: "Hardhat account #1 private key — A에게 별도 전달 (Git에 올리지 말 것)",
    },
    trustedIssuer: deployer.address,
    pubSignalsOrder: ["isAdult", "vcHash", "nonce", "tokenId", "currentDate"],
  };

  const outputPath = path.join(__dirname, "../deployed-addresses.json");
  fs.writeFileSync(outputPath, JSON.stringify(addresses, null, 2));

  console.log("\n" + "=".repeat(60));
  console.log("Deployment complete!");
  console.log(`Saved: ${outputPath}`);
  console.log("=".repeat(60));
  console.log(JSON.stringify(addresses, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
