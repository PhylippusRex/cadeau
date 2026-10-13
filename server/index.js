require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const { Resvg } = require("@resvg/resvg-js");
const brand = require("./brand");
const { esc, sendGiftEmail } = require("./email");

const NETWORK = process.env.NETWORK || "arcMainnet";
const IS_MAIN = NETWORK === "arcMainnet";
const RPC = IS_MAIN
  ? process.env.ARC_MAINNET_RPC || "https://rpc.drpc.mainnet.arc.io"
  : process.env.ARC_TESTNET_RPC || "https://rpc.testnet.arc.io";
const EXPLORER_BASE =
  process.env.EXPLORER_BASE || (IS_MAIN ? "https://explorer.arc.io/" : "https://explorer.testnet.arc.io/");
const PUBLIC_DIR = path.join(__dirname, "..", "public");

// Which website file to serve. Part 2 will change "app.html" to "site.html".
const SITE_FILE = "site.html";
// true = the link-preview picture shows the real code (same exposure as the link itself).
const SHOW_CODE_IN_PREVIEW = true;

const dep = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "deployments", `${NETWORK}.json`)));
const provider = new ethers.JsonRpcProvider(RPC, dep.chainId, { staticNetwork: true, batchMaxCount: 1 });
const wallet = new ethers.Wallet(process.env.RELAYER_PRIVATE_KEY, provider);
const cadeau = new ethers.Contract(dep.address, dep.abi, wallet);

const CODE_RE = /^CDEU(-[A-HJ-NP-Z2-9]{4}){4}$/;
const AMOUNT_RE = /^\d{1,9}(\.\d{1,6})?$/;
const STATUS = ["none", "active", "redeemed", "refunded"];
const MASK = "CDEU2-XXXX-XXXX-XXXX-XXXX";
const baseUrl = (req) =>
  (process.env.BASE_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");

const app = express();
app.set("trust proxy", 1);
app.use(cors());
app.use(express.json());

// Rate limit per IP, with a separate counter for each kind of request
const hits = new Map();
function limited(ip, max = 15, bucket = "general") {
  const key = bucket + ":" + ip;
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < 60000);
  arr.push(now);
  hits.set(key, arr);
  return arr.length > max;
}
function readCode(body) {
  const code = String((body && body.code) || "").trim().toUpperCase();
  return CODE_RE.test(code) ? code : null;
}
async function lookup(code) {
  const hash = ethers.keccak256(ethers.toUtf8Bytes(code));
  const g = await cadeau.gifts(hash);
  return {
    status: STATUS[Number(g.status)],
    amount: ethers.formatUnits(g.amount, 6),
    message: g.message,
    expiresAt: Number(g.expiresAt),
  };
}

// ---------- API ----------
app.get("/api/health", (_req, res) => res.json({ ok: true, network: NETWORK, contract: dep.address }));

app.get("/api/config", async (_req, res) => {
  try {
    res.json({
      network: NETWORK,
      chainName: IS_MAIN ? "Arc" : "Arc Testnet",
      chainId: dep.chainId,
      chainIdHex: "0x" + dep.chainId.toString(16),
      rpc: process.env.PUBLIC_RPC || RPC,
      contract: dep.address,
      usdc: dep.usdc,
      relayerFee: (await cadeau.relayerFee()).toString(),
      explorerBase: EXPLORER_BASE,
    });
  } catch (e) {
    res.status(500).json({ error: "Config unavailable" });
  }
});

app.post("/api/preview", async (req, res) => {
  if (limited(req.ip, 60, "preview")) return res.status(429).json({ error: "Too many requests" });
  const code = readCode(req.body);
  if (!code) return res.status(400).json({ error: "Invalid code format" });
  try {
    const g = await lookup(code);
    if (g.status === "none") return res.status(404).json({ error: "Gift not found" });
    res.json(g);
  } catch (e) {
    res.status(500).json({ error: "Lookup failed" });
  }
});

let queue = Promise.resolve();
app.post("/api/claim", (req, res) => {
  queue = queue.then(() => handleClaim(req, res)).catch(() => {});
});
async function handleClaim(req, res) {
  try {
    if (limited(req.ip, 15, "claim")) return res.status(429).json({ error: "Too many requests" });
    const code = readCode(req.body);
    if (!code) return res.status(400).json({ error: "Invalid code format" });
    const recipient = String(req.body.recipient || "").trim();
    if (!ethers.isAddress(recipient)) return res.status(400).json({ error: "Invalid wallet address" });

    const g = await lookup(code);
    if (g.status !== "active") return res.status(400).json({ error: `Gift is ${g.status}` });
    if (Date.now() / 1000 > g.expiresAt) return res.status(400).json({ error: "Gift expired" });

    const receipt = await (await cadeau.claim(code, recipient)).wait();
    res.json({ ok: true, amount: g.amount, txHash: receipt.hash, explorer: `${EXPLORER_BASE}tx/${receipt.hash}` });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Claim failed. Please try again." });
  }
}

const emailCount = new Map();
app.post("/api/email", async (req, res) => {
  if (limited(req.ip, 40, "email")) return res.status(429).json({ error: "Too many requests" });
  const code = readCode(req.body);
  if (!code) return res.status(400).json({ error: "Invalid code format" });
  const to = String(req.body.to || "").trim();
  if (to.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to))
    return res.status(400).json({ error: "Invalid email address" });
  const senderName = String(req.body.senderName || "").trim().slice(0, 40);
  if ((emailCount.get(code) || 0) >= 3) return res.status(429).json({ error: "Email limit reached for this gift" });
  try {
    const g = await lookup(code);
    if (g.status !== "active") return res.status(400).json({ error: `Gift is ${g.status}` });
    emailCount.set(code, (emailCount.get(code) || 0) + 1);
    const base = baseUrl(req);
    await sendGiftEmail({ to, amount: g.amount, message: g.message, code, senderName, link: `${base}/g/${code}`, baseUrl: base });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not send email" });
  }
});

// ---------- Pictures: gift card + link preview ----------
// Fonts: Manrope if the files are in server/fonts, otherwise the old Barlow look.
const FONT_DIR = path.join(__dirname, "fonts");
const MANROPE_FILES = ["Manrope-Regular.ttf", "Manrope-Medium.ttf", "Manrope-Bold.ttf"].map((f) => path.join(FONT_DIR, f));
const HAS_MANROPE = MANROPE_FILES.every((f) => fs.existsSync(f));
function renderPng(svg, width) {
  if (!HAS_MANROPE) return brand.png(svg, width);
  const styled = svg
    .replace(/font-family="Barlow( Semi Condensed)?"/g, 'font-family="Manrope"')
    .replace("scale(1.08 1)", "scale(1 1)")
    .replace('font-size="36.5"', 'font-size="32"');
  return new Resvg(styled, {
    font: { fontFiles: MANROPE_FILES, loadSystemFonts: false },
    fitTo: { mode: "width", value: width },
  }).render().asPng();
}
const withCode = (svg, code) => (code ? svg.replace(MASK, code) : svg);
const cleanCode = (q) => {
  const c = String(q || "").trim().toUpperCase();
  return CODE_RE.test(c) ? c : "";
};

const imgCache = new Map();
function cachedPng(key, make) {
  if (!imgCache.has(key)) {
    if (imgCache.size > 300) imgCache.clear();
    imgCache.set(key, make());
  }
  return imgCache.get(key);
}
function sendPng(res, buf, isPrivate) {
  res.set({ "Content-Type": "image/png", "Cache-Control": isPrivate ? "private, no-store" : "public, max-age=86400" });
  res.send(buf);
}
const goodAmount = (a) => AMOUNT_RE.test(a) && Number(a) > 0;

app.get("/card.png", (req, res) => {
  const a = String(req.query.amount || "");
  if (!goodAmount(a)) return res.status(400).json({ error: "Invalid amount" });
  const code = cleanCode(req.query.code);
  if (code) return sendPng(res, renderPng(withCode(brand.cardSvg(a), code), 1200), true);
  sendPng(res, cachedPng("card:" + a, () => renderPng(brand.cardSvg(a), 1200)));
});
app.get("/og.png", (req, res) => {
  const a = String(req.query.amount || "");
  if (!a) return sendPng(res, cachedPng("og:default", () => renderPng(brand.ogDefaultSvg(), 1200)));
  if (!goodAmount(a)) return res.status(400).json({ error: "Invalid amount" });
  const code = cleanCode(req.query.code);
  if (code) return sendPng(res, renderPng(withCode(brand.ogSvg(a), code), 1200), true);
  sendPng(res, cachedPng("og:" + a, () => renderPng(brand.ogSvg(a), 1200)));
});

// ---------- Website (one page file in public/) ----------
const fill = (tpl, v) => tpl.replace(/{{(\w+)}}/g, (_, k) => esc(v[k] ?? ""));
const appFile = path.join(PUBLIC_DIR, SITE_FILE);
app.get(["/", "/send", "/claim", "/history", "/g/:code"], async (req, res) => {
  if (!fs.existsSync(appFile)) return res.status(404).send(`Website file (public/${SITE_FILE}) is not installed yet.`);
  const base = baseUrl(req);
  let title = "Cadeau: send USDC gifts on Arc";
  let desc = "Create a single-use USDC gift code on Arc and share it as a link. They claim it with any wallet, no gas needed.";
  let image = `${base}/og.png`;
  const code = String(req.params.code || "").toUpperCase();
  if (CODE_RE.test(code)) {
    title = "You've received a Cadeau gift";
    desc = "Tap to claim your USDC gift card. No gas needed.";
    try {
      const g = await lookup(code);
      if (g.status === "active") {
        title = `You've received a $${brand.fmtCardAmount(g.amount)} USDC gift`;
        image = `${base}/og.png?amount=${g.amount}` + (SHOW_CODE_IN_PREVIEW ? `&code=${code}` : "");
      }
    } catch (e) {}
  }
  res.type("html").send(fill(fs.readFileSync(appFile, "utf8"), { TITLE: title, DESC: desc, URL: base + req.path, IMAGE: image }));
});

app.use("/fonts", express.static(path.join(__dirname, "fonts"), { maxAge: "30d" }));
app.use(express.static(PUBLIC_DIR, { index: false }));

   if (require.main === module) app.listen(process.env.PORT || 3001, () =>
  console.log(`Cadeau running on :${process.env.PORT || 3001} (${NETWORK}) fonts:${HAS_MANROPE ? "Manrope" : "Barlow"}`));
   module.exports = app;
