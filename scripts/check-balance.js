require("dotenv").config();
const { ethers } = require("ethers");

async function main() {
  const p = new ethers.JsonRpcProvider(process.env.ARC_MAINNET_RPC || "https://rpc.mainnet.arc.io");
  const net = await p.getNetwork();
  console.log("Connected to Arc, chain ID:", net.chainId.toString());
  const usdc = new ethers.Contract(
    process.env.USDC_ADDRESS,
    ["function balanceOf(address) view returns (uint256)"],
    p
  );
  for (const [name, key] of [["Deployer", "DEPLOYER_PRIVATE_KEY"], ["Relayer ", "RELAYER_PRIVATE_KEY"]]) {
    const addr = new ethers.Wallet(process.env[key]).address;
    const bal = await usdc.balanceOf(addr);
    console.log(name, addr, "→", ethers.formatUnits(bal, 6), "USDC");
  }
}
main().catch((e) => { console.error("Failed:", e.shortMessage || e.message); process.exit(1); });
