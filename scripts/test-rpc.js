const { ethers } = require("ethers");
const urls = [
  "https://rpc.mainnet.arc.io",
  "https://rpc.drpc.mainnet.arc.io",
  "https://rpc.blockdaemon.mainnet.arc.io",
  "https://rpc.quicknode.mainnet.arc.io",
];
const body = JSON.stringify({ jsonrpc: "2.0", method: "eth_chainId", params: [], id: 1 });

async function main() {
  for (const url of urls) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(15000),
      });
      console.log("fetch  OK  ", url, (await r.text()).slice(0, 60));
    } catch (e) {
      console.log("fetch  FAIL", url, (e.cause && e.cause.code) || e.message);
    }
    try {
      const p = new ethers.JsonRpcProvider(url, 5042, { staticNetwork: true, batchMaxCount: 1 });
      console.log("ethers OK  ", url, "block", await p.getBlockNumber());
      p.destroy();
    } catch (e) {
      console.log("ethers FAIL", url, e.shortMessage || e.message);
    }
  }
  process.exit(0);
}
main();
