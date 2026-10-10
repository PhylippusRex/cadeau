const hre = require("hardhat");
async function main() {
  const { ethers } = hre;
  const [d] = await ethers.getSigners();
  const F = await ethers.getContractFactory("Tessera");
  const relayer = new ethers.Wallet(process.env.RELAYER_PRIVATE_KEY).address;
  const tx = await F.getDeployTransaction(process.env.USDC_ADDRESS, relayer, ethers.parseUnits("0.1", 6));
  const gas = await ethers.provider.estimateGas({ from: d.address, ...tx });
  const fee = await ethers.provider.getFeeData();
  const price = fee.maxFeePerGas ?? fee.gasPrice;
  console.log("deploy cost ≈", ethers.formatEther(gas * price), "USDC");
}
main().catch((e) => { console.error(e.shortMessage || e.message); process.exit(1); });
