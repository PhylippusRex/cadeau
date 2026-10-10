const hre = require("hardhat");
const fs = require("fs");
async function main() {
  const { ethers, network } = hre;
  const dep = JSON.parse(fs.readFileSync(`deployments/${network.name}.json`));
  const [owner] = await ethers.getSigners();
  const t = new ethers.Contract(dep.address, dep.abi, owner);
  await (await t.setRelayerFee(ethers.parseUnits(process.env.FEE, 6))).wait();
  console.log("Fee is now", ethers.formatUnits(await t.relayerFee(), 6), "USDC");
}
main().catch((e) => { console.error(e.shortMessage || e.message); process.exit(1); });
