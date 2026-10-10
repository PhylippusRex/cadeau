const { ethers } = require("ethers");
const fs = require("fs");
if (fs.existsSync(".env")) { console.log(".env exists, not overwriting."); process.exit(0); }
const d = ethers.Wallet.createRandom();
const r = ethers.Wallet.createRandom();
fs.writeFileSync(".env", [
  `DEPLOYER_PRIVATE_KEY=${d.privateKey}`,
  `RELAYER_PRIVATE_KEY=${r.privateKey}`,
  "ARC_MAINNET_RPC=https://rpc.mainnet.arc.io",
  "PUBLIC_RPC=",
  "EXPLORER_BASE=",
  "USDC_ADDRESS=0x3600000000000000000000000000000000000000",
  "NETWORK=arcMainnet",
  "PORT=3001",
  "BASE_URL=http://localhost:3001",
  "RESEND_API_KEY=",
  'EMAIL_FROM="Tessera <onboarding@resend.dev>"',
].join("\n") + "\n");
console.log("Deployer (also your sender wallet):", d.address);
console.log("Relayer:", r.address);
