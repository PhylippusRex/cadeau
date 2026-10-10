const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

const USDC = (n) => ethers.parseUnits(String(n), 6);
const FEE = USDC("0.1");
const CODE = "TSRA-TEST-CODE-0001";
const HASH = ethers.keccak256(ethers.toUtf8Bytes(CODE));

async function deploy() {
  const [owner, sender, relayer, recipient, stranger] = await ethers.getSigners();
  const usdc = await (await ethers.getContractFactory("MockUSDC")).deploy();
  const tessera = await (await ethers.getContractFactory("Tessera"))
    .deploy(await usdc.getAddress(), relayer.address, FEE);
  await usdc.mint(sender.address, USDC(1000));
  await usdc.connect(sender).approve(await tessera.getAddress(), ethers.MaxUint256);
  return { tessera, usdc, owner, sender, relayer, recipient, stranger };
}

describe("Tessera", () => {
  it("sender pays 50.1, recipient gets exactly 50, relayer gets 0.1", async () => {
    const { tessera, usdc, sender, relayer, recipient } = await loadFixture(deploy);
    await tessera.connect(sender).createGift(HASH, USDC(50), "Happy birthday!");
    expect(await usdc.balanceOf(sender.address)).to.equal(USDC("949.9"));
    await tessera.connect(relayer).claim(CODE, recipient.address);
    expect(await usdc.balanceOf(recipient.address)).to.equal(USDC(50));
    expect(await usdc.balanceOf(relayer.address)).to.equal(FEE);
    expect(await usdc.balanceOf(await tessera.getAddress())).to.equal(0n);
  });

  it("only the relayer can claim", async () => {
    const { tessera, sender, stranger } = await loadFixture(deploy);
    await tessera.connect(sender).createGift(HASH, USDC(5), "");
    await expect(tessera.connect(stranger).claim(CODE, stranger.address)).to.be.revertedWith("Only relayer");
  });

  it("rejects a wrong code", async () => {
    const { tessera, sender, relayer, recipient } = await loadFixture(deploy);
    await tessera.connect(sender).createGift(HASH, USDC(5), "");
    await expect(tessera.connect(relayer).claim("WRONG", recipient.address)).to.be.revertedWith("Gift not active");
  });

  it("cannot be claimed twice", async () => {
    const { tessera, sender, relayer, recipient } = await loadFixture(deploy);
    await tessera.connect(sender).createGift(HASH, USDC(5), "");
    await tessera.connect(relayer).claim(CODE, recipient.address);
    await expect(tessera.connect(relayer).claim(CODE, recipient.address)).to.be.revertedWith("Gift not active");
  });

  it("refund only works for the sender after expiry", async () => {
    const { tessera, usdc, sender, stranger } = await loadFixture(deploy);
    await tessera.connect(sender).createGift(HASH, USDC(50), "");
    await expect(tessera.connect(sender).refund(HASH)).to.be.revertedWith("Not expired yet");
    await time.increase(31 * 24 * 60 * 60);
    await expect(tessera.connect(stranger).refund(HASH)).to.be.revertedWith("Not the sender");
    await tessera.connect(sender).refund(HASH);
    expect(await usdc.balanceOf(sender.address)).to.equal(USDC(1000));
  });

  it("rejects a duplicate code hash", async () => {
    const { tessera, sender } = await loadFixture(deploy);
    await tessera.connect(sender).createGift(HASH, USDC(5), "");
    await expect(tessera.connect(sender).createGift(HASH, USDC(5), "")).to.be.revertedWith("Code already used");
  });
});
