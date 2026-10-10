const hre = require("hardhat");
const crypto = require("crypto");
const fs = require("fs");

function makeCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (const b of crypto.randomBytes(16)) s += alphabet[b % 32];
  return `TSRA-${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}`;
}

async function main() {
  const { ethers, network } = hre;
  const dep = JSON.parse(fs.readFileSync(`deployments/${network.name}.json`));
  const [sender] = await ethers.getSigners();
  const tessera = new ethers.Contract(dep.address, dep.abi, sender);
  const usdc = new ethers.Contract(dep.usdc, ["function approve(address,uint256) returns (bool)"], sender);

  const amount = ethers.parseUnits(process.env.AMOUNT || "0.05", 6);
  const message = process.env.MESSAGE || "Enjoy your gift!";
  const fee = await tessera.relayerFee();
  const code = makeCode();
  const codeHash = ethers.keccak256(ethers.toUtf8Bytes(code));

  console.log(`Approving ${ethers.formatUnits(amount + fee, 6)} USDC...`);
  await (await usdc.approve(dep.address, amount + fee)).wait();
  console.log("Creating gift...");
  const receipt = await (await tessera.createGift(codeHash, amount, message)).wait();

  console.log("\nCREATE TX:", receipt.hash);
  console.log("GIFT CODE (secret, save it):", code);
}
main().catch((e) => { console.error(e); process.exit(1); });
