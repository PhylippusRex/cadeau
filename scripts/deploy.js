const hre = require("hardhat");
const fs = require("fs");

async function main() {
  const { ethers, network } = hre;
  const [deployer] = await ethers.getSigners();
  const usdc = process.env.USDC_ADDRESS;
  const relayer = new ethers.Wallet(process.env.RELAYER_PRIVATE_KEY).address;
  const fee = ethers.parseUnits("0.1", 6);

  console.log("Network:", network.name);
  console.log("Deployer:", deployer.address);
  console.log("Gas balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "USDC");

  const Cadeau = await ethers.getContractFactory("Cadeau");
  const cadeau = await Cadeau.deploy(usdc, relayer, fee);
  const receipt = await cadeau.deploymentTransaction().wait();
  const address = await cadeau.getAddress();

  const abi = (await hre.artifacts.readArtifact("Cadeau")).abi;
  fs.mkdirSync("deployments", { recursive: true });
  fs.writeFileSync(`deployments/${network.name}.json`, JSON.stringify({
    network: network.name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    address, usdc, relayer, relayerFee: fee.toString(),
    deployTx: receipt.hash, abi,
  }, null, 2));

  console.log("Tessera deployed to:", address);
  console.log("Deploy tx:", receipt.hash);
}
main().catch((e) => { console.error(e); process.exit(1); });
