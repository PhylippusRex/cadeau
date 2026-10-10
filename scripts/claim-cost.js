const hre = require("hardhat");
const fs = require("fs");

async function main() {
  const { ethers, network } = hre;
  const dep = JSON.parse(fs.readFileSync(`deployments/${network.name}.json`));
  const relayer = new ethers.Wallet(process.env.RELAYER_PRIVATE_KEY, ethers.provider);
  const t = new ethers.Contract(dep.address, dep.abi, relayer);
  const to = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY).address;
  const gas = await t.claim.estimateGas(process.env.GIFT_CODE, to);
  const fd = await ethers.provider.getFeeData();
  const price = fd.maxFeePerGas ?? fd.gasPrice;
  console.log("claim gas units:", gas.toString());
  console.log("claim cost ≈", ethers.formatEther(gas * price), "USDC");
}
main().catch((e) => { console.error(e.shortMessage || e.message); process.exit(1); });
