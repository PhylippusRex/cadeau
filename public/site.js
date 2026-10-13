"use strict";
const GITHUB_URL = "https://github.com/PhylippusRex/cadeau";
const $ = (id) => document.getElementById(id);
const CODE_RE = /^CDEU(-[A-HJ-NP-Z2-9]{4}){4}$/;
const AMOUNT_RE = /^\d{1,9}(\.\d{1,6})?$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MAX_BULK = 20;
const CADEAU_ABI = ["function createGift(bytes32 codeHash, uint256 amount, string message)"];
const USDC_ABI = [
  "function approve(address,uint256) returns (bool)",
  "function allowance(address,address) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)"
];
const views = { landing: $("view-landing"), send: $("view-send"), claim: $("view-claim"), history: $("view-history") };
const PATHS = { landing: "/", send: "/send", claim: "/claim", history: "/history" };
let cfg = null, signer = null, account = null, claimCode = "", cdTimer = null, mode = "one", lastBulk = [], histRun = 0;

/* ---------- helpers ---------- */
function setText(id, msg, isErr) { const el = $(id); el.textContent = msg; el.classList.toggle("err", !!isErr); }
function nice(s) { return s.indexOf(".") === -1 ? s : s.replace(/0+$/, "").replace(/\.$/, ""); }
function fmtAmt(a) { return Number(a).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 6 }); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) { window.prompt("Copy this:", text); return false; }
}
async function api(path, body) {
  const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "Something went wrong");
  return data;
}
function makeCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let s = "";
  for (const b of bytes) s += ALPHABET[b % 32];
  return "CDEU-" + s.slice(0, 4) + "-" + s.slice(4, 8) + "-" + s.slice(8, 12) + "-" + s.slice(12, 16);
}
const validAmount = (s) => AMOUNT_RE.test(s) && Number(s) >= 0.01;
function miniBtn(text, fn) {
  const b = document.createElement("button");
  b.type = "button"; b.className = "btn btn-outline btn-sm"; b.textContent = text; b.onclick = fn;
  return b;
}

/* ---------- router (Home / Send / Claim / History) ---------- */
function show(view) {
  Object.keys(views).forEach((k) => views[k].classList.toggle("on", k === view));
  document.querySelectorAll(".bottomnav a").forEach((a) => a.classList.toggle("on", a.dataset.tab === view));
  if (view === "history") renderHistoryView();
}
function go(view, anchor) {
  show(view);
  history.pushState({}, "", PATHS[view]);
  if (view === "claim") startClaim("");
  if (anchor && $(anchor)) $(anchor).scrollIntoView(); else window.scrollTo({ top: 0 });
}
function routeFromLocation() {
  const p = location.pathname;
  const m = p.match(/^\/g\/([^/]+)/);
  if (m) { show("claim"); startClaim(decodeURIComponent(m[1])); }
  else if (p === "/claim") { show("claim"); startClaim(""); }
  else if (p === "/send") show("send");
  else if (p === "/history") show("history");
  else show("landing");
}
document.querySelectorAll("[data-go]").forEach((el) => el.addEventListener("click", (e) => {
  e.preventDefault();
  go(el.dataset.go, el.dataset.anchor);
}));
window.addEventListener("popstate", routeFromLocation);
$("flip").addEventListener("click", () => $("flip").classList.toggle("flipped"));

/* ---------- dropdown menu ---------- */
$("menuBtn").addEventListener("click", (e) => {
  e.stopPropagation();
  const m = $("menu");
  m.hidden = !m.hidden;
  $("menuBtn").setAttribute("aria-expanded", String(!m.hidden));
});
document.addEventListener("click", () => { $("menu").hidden = true; });

/* ---------- wallet ---------- */
function setAccount(addr, s) {
  account = addr; signer = s;
  $("connectBtn").textContent = addr.slice(0, 6) + "…" + addr.slice(-4);
  $("menuHistory").hidden = false;
  if (views.history.classList.contains("on")) renderHistoryView();
}
async function switchChain() {
  try {
    await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: cfg.chainIdHex }] });
  } catch (e) {
    await window.ethereum.request({
      method: "wallet_addEthereumChain",
      params: [{ chainId: cfg.chainIdHex, chainName: cfg.chainName, nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: [cfg.rpc], blockExplorerUrls: [cfg.explorerBase] }]
    });
  }
}
async function connect() {
  if (!cfg) throw new Error("The server is not reachable yet. Please try again.");
  if (!window.ethereum) throw new Error("No wallet found. Open this page inside your wallet app's browser (MetaMask, Rabby, Trust…) or use a desktop browser with a wallet extension.");
  await window.ethereum.request({ method: "eth_requestAccounts" });
  await switchChain();
  const s = await new ethers.BrowserProvider(window.ethereum).getSigner();
  setAccount(await s.getAddress(), s);
}
async function restoreWallet() {
  try {
    if (!window.ethereum) return;
    const a = await window.ethereum.request({ method: "eth_accounts" });
    if (a.length) {
      const s = await new ethers.BrowserProvider(window.ethereum).getSigner();
      setAccount(await s.getAddress(), s);
    }
    if (window.ethereum.on) window.ethereum.on("accountsChanged", () => location.reload());
  } catch (e) {}
}
function connectWithMessage() {
  const id = views.send.classList.contains("on") ? "sendStatus" : views.claim.classList.contains("on") ? "claimStatus" : views.history.classList.contains("on") ? "histStatus" : null;
  connect().catch((e) => { if (id) setText(id, e.shortMessage || e.message, true); else alert(e.message); });
}
$("connectBtn").addEventListener("click", connectWithMessage);
$("histConnect").addEventListener("click", connectWithMessage);

/* ---------- history (saved in this browser, one list per wallet) ---------- */
const histKey = () => "tessera_gifts_" + (account || "").toLowerCase();
function loadHistory() { try { return JSON.parse(localStorage.getItem(histKey()) || "[]"); } catch (e) { return []; } }
function loadLegacy() { try { return JSON.parse(localStorage.getItem("tessera_gifts") || "[]"); } catch (e) { return []; } }
function saveGift(item) { localStorage.setItem(histKey(), JSON.stringify([item].concat(loadHistory()).slice(0, 50))); }
const STATUS_LABEL = { active: "Waiting", redeemed: "Claimed ✓", refunded: "Refunded", none: "Not found" };

function histRow(g) {
  const li = document.createElement("li"); li.className = "hrow";
  const top = document.createElement("div"); top.className = "hrow-top";
  const amt = document.createElement("strong"); amt.textContent = fmtAmt(g.amount) + " USDC";
  const chip = document.createElement("span"); chip.className = "chip"; chip.textContent = "Checking…";
  top.append(amt, chip);
  const meta = document.createElement("div"); meta.className = "meta";
  meta.textContent = new Date(g.time).toLocaleString() + (g.message ? " · “" + g.message + "”" : "");
  const code = document.createElement("div"); code.className = "hcode"; code.textContent = g.code;
  const btns = document.createElement("div"); btns.className = "hbtns";
  btns.append(
    miniBtn("Copy link", () => copy(location.origin + "/g/" + g.code)),
    miniBtn("Copy code", () => copy(g.code))
  );
  li.append(top, meta, code, btns);
  li._chip = chip; li._code = g.code;
  return li;
}
async function fillList(list, ul, run) {
  const rows = list.filter((g) => g && CODE_RE.test(g.code)).slice(0, 30).map(histRow);
  ul.replaceChildren.apply(ul, rows);
  for (const li of rows) {
    if (run !== histRun) return;
    try {
      const g = await api("/api/preview", { code: li._code });
      li._chip.textContent = STATUS_LABEL[g.status] || g.status;
      li._chip.className = "chip s-" + g.status;
    } catch (e) { li._chip.textContent = "Unknown"; }
  }
}
async function renderHistoryView() {
  const run = ++histRun;
  $("histNeed").hidden = !!account;
  $("histEmpty").hidden = true; $("legacyTitle").hidden = true;
  $("histList").replaceChildren(); $("legacyList").replaceChildren();
  if (!account) return;
  const mine = loadHistory();
  $("histEmpty").hidden = mine.length > 0;
  await fillList(mine, $("histList"), run);
  const old = loadLegacy();
  $("legacyTitle").hidden = !old.length;
  await fillList(old, $("legacyList"), run);
}

/* ---------- SEND ---------- */
function setSteps(n) {
  ["st1", "st2", "st3"].forEach((id, i) => { $(id).classList.toggle("done", i < n); $(id).classList.toggle("now", i === n); });
}
function parseEmails() {
  const raw = $("emails").value.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
  const bad = raw.filter((e) => !EMAIL_RE.test(e));
  const good = [...new Set(raw.filter((e) => EMAIL_RE.test(e)).map((e) => e.toLowerCase()))];
  return { good, bad };
}
function countNow() {
  if (mode === "one") return 1;
  return parseEmails().good.length || Math.floor(Number($("qty").value) || 0);
}
function updateFee() {
  const s = $("amount").value.trim();
  if (!cfg) { setText("feeLine", ""); return; }
  const fee = BigInt(cfg.relayerFee);
  if (!s) { setText("feeLine", "Network fee: " + nice(ethers.formatUnits(fee, 6)) + " USDC per gift."); return; }
  if (!validAmount(s)) { setText("feeLine", "Enter an amount of at least 0.01 USDC."); return; }
  const n = Math.max(1, countNow());
  const total = (ethers.parseUnits(s, 6) + fee) * BigInt(n);
  setText("feeLine", (n > 1 ? n + " gifts · " : "") + "You pay " + nice(ethers.formatUnits(total, 6)) + " USDC · " + (n > 1 ? "each person receives " : "They receive ") + nice(s) + " USDC · valid for 30 days");
}
let prevTimer = null;
function updatePreview() {
  clearTimeout(prevTimer);
  prevTimer = setTimeout(() => {
    if (!$("sendForm").hidden) {
      const s = $("amount").value.trim();
      if (validAmount(s)) $("cardPrev").src = "/card.png?amount=" + encodeURIComponent(s);
      const name = $("senderName").value.trim(), msg = $("message").value.trim();
      $("prevMsg").textContent = msg ? "“" + msg + "”" + (name ? " — " + name : "") : "";
    }
  }, 250);
}
$("amount").addEventListener("input", (e) => {
  let v = e.target.value.replace(/,/g, ".").replace(/[^0-9.]/g, "");
  const i = v.indexOf(".");
  if (i !== -1) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, "").slice(0, 6);
  e.target.value = v;
  updateFee(); updatePreview();
});
["message", "senderName"].forEach((id) => $(id).addEventListener("input", updatePreview));
["emails", "qty"].forEach((id) => $(id).addEventListener("input", updateFee));

function setMode(m) {
  mode = m;
  $("modeOne").classList.toggle("on", m === "one");
  $("modeMany").classList.toggle("on", m === "many");
  $("oneFields").hidden = m !== "one";
  $("manyFields").hidden = m !== "many";
  $("createBtn").textContent = m === "one" ? "Create gift" : "Create gifts";
  updateFee();
}
$("modeOne").addEventListener("click", () => setMode("one"));
$("modeMany").addEventListener("click", () => setMode("many"));

/* six icon-only share buttons */
function buildShare(link, code, amount) {
  const intro = "You've received a $" + fmtAmt(amount) + " USDC gift on Cadeau!";
  const enc = encodeURIComponent, bar = $("shareBar");
  bar.replaceChildren();
  const add = (cls, label, icon, href, fn) => {
    const el = document.createElement(href ? "a" : "button");
    el.className = cls; el.title = label; el.setAttribute("aria-label", label);
    const i = document.createElement("i"); i.className = icon; el.append(i);
    if (href) { el.href = href; el.target = "_blank"; el.rel = "noopener"; }
    else { el.type = "button"; el.onclick = fn; }
    bar.append(el);
  };
  add("s-wa", "WhatsApp", "fa-brands fa-whatsapp", "https://wa.me/?text=" + enc(intro + " Claim it here: " + link));
  add("s-tg", "Telegram", "fa-brands fa-telegram", "https://t.me/share/url?url=" + enc(link) + "&text=" + enc(intro));
  add("s-x", "X DM", "fa-brands fa-x-twitter", null, () => {
    copy(link).then((ok) => { if (ok) setText("resultStatus", "Link copied. Paste it into the X DM."); });
    window.open("https://x.com/messages", "_blank");
  });
  add("s-ig", "Instagram", "fa-brands fa-instagram", null, () => {
    copy(link).then((ok) => { if (ok) setText("resultStatus", "Link copied. Paste it into the Instagram DM."); });
    window.open("https://www.instagram.com/direct/inbox/", "_blank");
  });
  add("s-link", "Copy link", "fa-solid fa-link", null, async () => { if (await copy(link)) setText("resultStatus", "Link copied ✓"); });
  add("s-code", "Copy code", "fa-solid fa-key", null, async () => { if (await copy(code)) setText("resultStatus", "Code copied ✓"); });
}

function showResult(o) {
  const link = location.origin + "/g/" + o.code;
  $("sendForm").hidden = true; $("bulkResult").hidden = true; $("sendResult").hidden = false;
  setSteps(1);
  $("linkBox").textContent = link;
  buildShare(link, o.code, o.amount);
  $("txLink").href = cfg.explorerBase + "tx/" + o.txHash;
  $("cardPrev").src = "/card.png?amount=" + encodeURIComponent(o.amount) + "&code=" + encodeURIComponent(o.code);
  $("prevCap").textContent = "Your gift card";
  $("prevMsg").textContent = o.message ? "“" + o.message + "”" : "";
  window.scrollTo({ top: 0 });
}

async function prepareChain() {
  if (!signer) await connect(); else await switchChain();
}

async function onCreate() {
  const btn = $("createBtn");
  btn.disabled = true;
  try {
    const amountStr = $("amount").value.trim();
    const message = $("message").value.trim();
    const toEmail = $("toEmail").value.trim();
    if (!validAmount(amountStr)) throw new Error("Enter an amount of at least 0.01 USDC.");
    if (new TextEncoder().encode(message).length > 140) throw new Error("Message is too long (max 140 bytes).");
    if (toEmail && !EMAIL_RE.test(toEmail)) throw new Error("That email address doesn't look right.");
    await prepareChain();

    const amount = ethers.parseUnits(amountStr, 6);
    const total = amount + BigInt(cfg.relayerFee);
    const usdc = new ethers.Contract(cfg.usdc, USDC_ABI, signer);
    const cadeau = new ethers.Contract(cfg.contract, CADEAU_ABI, signer);
    if ((await usdc.balanceOf(account)) < total) throw new Error("Not enough USDC. You need " + nice(ethers.formatUnits(total, 6)) + ".");
    if ((await usdc.allowance(account, cfg.contract)) < total) {
      setText("sendStatus", "1/2 · Approve USDC in your wallet…");
      await (await usdc.approve(cfg.contract, total)).wait();
    }
    const code = makeCode();
    const codeHash = ethers.keccak256(ethers.toUtf8Bytes(code));
    setText("sendStatus", "2/2 · Confirm the gift in your wallet…");
    const tx = await cadeau.createGift(codeHash, amount, message);
    saveGift({ code: code, amount: amountStr, message: message, time: Date.now() }); // saved right away so the code is never lost
    setText("sendStatus", "Creating your gift on Arc…");
    const receipt = await tx.wait();
    setText("sendStatus", "");
    showResult({ amount: amountStr, message: message, code: code, txHash: receipt.hash });

    if (toEmail) {
      setText("resultStatus", "Sending email…");
      try {
        await api("/api/email", { code: code, to: toEmail, senderName: $("senderName").value.trim() });
        setText("resultStatus", "Email sent to " + toEmail + " ✓");
      } catch (e) { setText("resultStatus", "Gift created, but the email failed: " + e.message, true); }
    }
  } catch (e) {
    setText("sendStatus", e.shortMessage || e.message || "Something went wrong", true);
  } finally {
    btn.disabled = false;
  }
}

function showBulk(rows, note) {
  lastBulk = rows;
  $("sendForm").hidden = true; $("sendResult").hidden = true; $("bulkResult").hidden = false;
  setSteps(1);
  const items = rows.map((r) => {
    const li = document.createElement("li"); li.className = "hrow";
    const code = document.createElement("div"); code.className = "hcode"; code.textContent = r.code;
    const meta = document.createElement("div"); meta.className = "meta";
    meta.textContent = r.email ? r.email + " · email " + r.emailStatus : "No email";
    const btns = document.createElement("div"); btns.className = "hbtns";
    btns.append(
      miniBtn("Copy link", () => copy(location.origin + "/g/" + r.code)),
      miniBtn("Copy code", () => copy(r.code))
    );
    li.append(code, meta, btns);
    return li;
  });
  $("bulkList").replaceChildren.apply($("bulkList"), items);
  setText("bulkStatus", note || "", !!note);
  window.scrollTo({ top: 0 });
}

async function onBulk() {
  const btn = $("createBtn");
  btn.disabled = true;
  const rows = [];
  let note = "";
  try {
    const amountStr = $("amount").value.trim();
    const message = $("message").value.trim();
    const senderName = $("senderName").value.trim();
    if (!validAmount(amountStr)) throw new Error("Enter an amount of at least 0.01 USDC.");
    if (new TextEncoder().encode(message).length > 140) throw new Error("Message is too long (max 140 bytes).");
    const parsed = parseEmails();
    if (parsed.bad.length) throw new Error("These emails look wrong: " + parsed.bad.slice(0, 3).join(", "));
    const count = parsed.good.length || Math.floor(Number($("qty").value) || 0);
    if (count < 1 || count > MAX_BULK) throw new Error("Choose between 1 and " + MAX_BULK + " gifts.");
    await prepareChain();

    const amount = ethers.parseUnits(amountStr, 6);
    const total = (amount + BigInt(cfg.relayerFee)) * BigInt(count);
    const usdc = new ethers.Contract(cfg.usdc, USDC_ABI, signer);
    const cadeau = new ethers.Contract(cfg.contract, CADEAU_ABI, signer);
    if ((await usdc.balanceOf(account)) < total) throw new Error("Not enough USDC. You need " + nice(ethers.formatUnits(total, 6)) + ".");
    if ((await usdc.allowance(account, cfg.contract)) < total) {
      setText("sendStatus", "Approve USDC in your wallet (one time for all gifts)…");
      await (await usdc.approve(cfg.contract, total)).wait();
    }
    for (let i = 0; i < count; i++) {
      const code = makeCode();
      const codeHash = ethers.keccak256(ethers.toUtf8Bytes(code));
      setText("sendStatus", "Gift " + (i + 1) + " of " + count + ": confirm in your wallet…");
      let tx;
      try { tx = await cadeau.createGift(codeHash, amount, message); }
      catch (e) { note = "Stopped at gift " + (i + 1) + ": " + (e.shortMessage || e.message); break; }
      saveGift({ code: code, amount: amountStr, message: message, time: Date.now() });
      const row = { code: code, email: parsed.good[i] || "", emailStatus: "" };
      rows.push(row);
      setText("sendStatus", "Gift " + (i + 1) + " of " + count + ": confirming on Arc…");
      await tx.wait();
      if (row.email) {
        try { await api("/api/email", { code: code, to: row.email, senderName: senderName }); row.emailStatus = "sent ✓"; }
        catch (e) { row.emailStatus = "failed"; }
        await sleep(700); // stays under the email service's 2-per-second limit
      }
    }
    setText("sendStatus", "");
  } catch (e) {
    setText("sendStatus", e.shortMessage || e.message || "Something went wrong", true);
  } finally {
    btn.disabled = false;
    if (rows.length) showBulk(rows, note);
  }
}
$("createBtn").addEventListener("click", () => { if (mode === "one") onCreate(); else onBulk(); });

function resetSend() {
  $("sendResult").hidden = true; $("bulkResult").hidden = true; $("sendForm").hidden = false;
  setSteps(0); setText("resultStatus", ""); setText("sendStatus", "");
  ["amount", "message", "toEmail", "emails", "qty"].forEach((id) => { $(id).value = ""; });
  $("cardPrev").src = "/brand/card-sample.png";
  $("prevCap").textContent = "Preview · updates as you type";
  $("prevMsg").textContent = "";
  updateFee();
  window.scrollTo({ top: 0 });
}
$("againBtn").addEventListener("click", resetSend);
$("bulkAgain").addEventListener("click", resetSend);
$("bulkCopyAll").addEventListener("click", () => copy(lastBulk.map((r) => location.origin + "/g/" + r.code).join("\n")));
$("bulkCsv").addEventListener("click", () => {
  const csv = "code,link,email\n" + lastBulk.map((r) => r.code + "," + location.origin + "/g/" + r.code + "," + r.email).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = "tessera-gifts.csv";
  a.click();
});

/* ---------- CLAIM ---------- */
function fmtCountdown(sec) {
  if (sec <= 0) return "EXPIRED";
  const d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
  const p = (n) => String(n).padStart(2, "0");
  return (d > 0 ? d + "d " : "") + p(h) + ":" + p(m) + ":" + p(s);
}
function startCountdown(expiresAt) {
  clearInterval(cdTimer);
  const tick = () => { $("cd").textContent = fmtCountdown(expiresAt - Math.floor(Date.now() / 1000)); };
  tick();
  cdTimer = setInterval(tick, 1000);
}
async function startClaim(code) {
  claimCode = (code || "").trim().toUpperCase();
  clearInterval(cdTimer);
  ["cdPill", "claimCard", "claimMsg", "claimBox", "receipt"].forEach((id) => { $(id).hidden = true; });
  setText("claimStatus", "");
  $("codeBox").hidden = !!claimCode && CODE_RE.test(claimCode);
  if (!claimCode) return;
  if (!CODE_RE.test(claimCode)) { setText("claimStatus", "That code doesn't look right. Codes look like CDEU-XXXX-XXXX-XXXX-XXXX.", true); return; }
  setText("claimStatus", "Checking your gift…");
  try {
    const g = await api("/api/preview", { code: claimCode });
    setText("claimStatus", "");
    $("claimImg").src = "/card.png?amount=" + encodeURIComponent(g.amount) + "&code=" + encodeURIComponent(claimCode);
    $("claimCard").hidden = false;
    if (g.message) { $("claimMsg").textContent = "“" + g.message + "”"; $("claimMsg").hidden = false; }
    const expired = g.expiresAt <= Math.floor(Date.now() / 1000);
    if (g.status === "active" && !expired) {
      $("cdPill").hidden = false; startCountdown(g.expiresAt);
      $("claimBox").hidden = false;
    } else if (g.status === "redeemed") setText("claimStatus", "This gift has already been claimed.", true);
    else if (g.status === "refunded") setText("claimStatus", "The sender took this gift back.", true);
    else setText("claimStatus", "This gift has expired.", true);
  } catch (e) {
    $("codeBox").hidden = false;
    setText("claimStatus", e.message, true);
  }
}
$("checkBtn").addEventListener("click", () => {
  const c = $("codeInput").value.trim().toUpperCase();
  if (CODE_RE.test(c)) history.replaceState({}, "", "/g/" + c);
  startClaim(c);
});
$("walletBtn").addEventListener("click", async () => {
  try {
    if (!window.ethereum) throw new Error("No wallet found. Paste your address instead.");
    const accts = await window.ethereum.request({ method: "eth_requestAccounts" });
    $("addr").value = accts[0];
  } catch (e) { setText("claimStatus", e.message, true); }
});
function showClaimed(amount) {
  const m = $("claimMsg");
  const img = document.createElement("img");
  img.src = "/brand/usdc.png"; img.alt = "USDC"; img.className = "usdc-inline";
  const num = document.createElement("b");
  num.textContent = fmtAmt(amount) + " USDC";
  m.replaceChildren("Claimed! ", img, " ", num, " is on its way to your wallet");
  m.hidden = false;
}
$("claimBtn").addEventListener("click", async () => {
  const btn = $("claimBtn"), addr = $("addr").value.trim();
  if (!ethers.isAddress(addr)) { setText("claimStatus", "Enter a valid wallet address (it starts with 0x).", true); return; }
  btn.disabled = true;
  setText("claimStatus", "Sending your gift…");
  try {
    const out = await api("/api/claim", { code: claimCode, recipient: addr });
    clearInterval(cdTimer);
    $("cdPill").hidden = true; $("claimBox").hidden = true;
    showClaimed(out.amount);
    $("rcptLink").href = out.explorer;
    $("receipt").hidden = false;
    setText("claimStatus", "");
  } catch (e) {
    setText("claimStatus", e.message, true);
    btn.disabled = false;
  }
});

/* ---------- start ---------- */
(async function init() {
  $("ghLink").href = GITHUB_URL;
  routeFromLocation();
  restoreWallet();
  try {
    cfg = await (await fetch("/api/config")).json();
    if (!cfg.contract) throw new Error("no config");
    $("netName").textContent = cfg.chainName.toUpperCase();
    $("contractLink").href = cfg.explorerBase + "address/" + cfg.contract;
    updateFee();
  } catch (e) {
    setText("feeLine", "The server is not reachable right now. Please refresh in a moment.", true);
  }
})();
