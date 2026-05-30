require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    // 로컬 개발 네트워크
    localhost: {
      url: "http://127.0.0.1:8545",
    },
    hardhat: {
      // 공연장 서버 다운 시뮬레이션용: 블록타임 15초로 설정
      mining: {
        interval: 0,
      },
    },
  },
  paths: {
    sources:   "./contracts",
    tests:     "./test",
    cache:     "./cache",
    artifacts: "./artifacts",
  },
};
