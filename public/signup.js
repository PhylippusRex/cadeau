/* Cadeau: "Sign up" with email (thirdweb in-app wallet). Loaded after site.js. */
(function () {
  "use strict";
  const CLIENT_ID = "de3668743054e99628c34a1a84885899"; // public thirdweb Client ID
  const SDK = "https://esm.sh/thirdweb@5";
  const SESSION_KEY = "cadeau_email_session";
  const byId = (id) => document.getElementById(id);
  let sdk = null, wallet = null, kind = null;

  /* ---------- thirdweb is loaded only when someone needs it ---------- */
  async function loadSdk() {
    if (sdk) return sdk;
    const parts = await Promise.all([
      import(SDK),
      import(SDK + "/wallets/in-app"),
      import(SDK + "/adapters/ethers6?deps=ethers@6.13.4")
    ]);
    const client = parts[0].createThirdwebClient({ clientId: CLIENT_ID });
    wallet = parts[1].inAppWallet();
    sdk = { core: parts[0], inapp: parts[1], adapters: parts[2], client: client };
    return sdk;
  }
  function makeChain(s) {
    if (!cfg) throw new Error("The server is not reachable yet. Please try again.");
    return s.core.defineChain({
      id: cfg.chainId,
      name: cfg.chainName,
      rpc: cfg.rpc,
      nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
      blockExplorers: [{ name: "Arc Explorer", url: cfg.explorerBase }]
    });
  }
  async function useAccount(s, chain, acct) {
    const ethSigner = await s.adapters.ethers6Adapter.signer.toEthers({ client: s.client, chain: chain, account: acct });
    kind = "email";
    setAccount(acct.address, ethSigner);
  }
  async function sendCode(email) {
    const s = await loadSdk();
    await s.inapp.preAuthenticate({ client: s.client, strategy: "email", email: email });
  }
  async function verifyCode(email, code) {
    const s = await loadSdk();
    const chain = makeChain(s);
    const acct = await wallet.connect({ client: s.client, chain: chain, strategy: "email", email: email, verificationCode: code });
    await useAccount(s, chain, acct);
    localStorage.setItem(SESSION_KEY, email);
  }
  async function restore() {
    try {
      if (!localStorage.getItem(SESSION_KEY)) return;
      const s = await loadSdk();
      for (let i = 0; i < 20 && !cfg; i++) await new Promise((r) => setTimeout(r, 250));
      if (!cfg || account) return;
      const chain = makeChain(s);
      const acct = await wallet.autoConnect({ client: s.client, chain: chain });
      if (acct && !account) await useAccount(s, chain, acct);
    } catch (e) { /* they simply sign in again */ }
  }

  /* ---------- the sign-up window ---------- */
  const css =
    ".su-back{position:fixed;inset:0;z-index:100;background:rgba(23,24,28,.55);display:flex;align-items:center;justify-content:center;padding:16px}" +
    ".su-card{position:relative;width:100%;max-width:420px;background:var(--paper);border:1px solid var(--line);border-radius:var(--r-lg);padding:28px;box-shadow:var(--shadow);max-height:90vh;overflow:auto}" +
    ".su-card h3{font-size:26px;margin-bottom:8px}" +
    ".su-card p{font-size:15px;margin-bottom:16px}" +
    ".su-card .input{margin-bottom:12px}" +
    ".su-x{position:absolute;right:14px;top:8px;border:0;background:none;font-size:30px;line-height:1;cursor:pointer;color:var(--muted)}" +
    ".su-link{background:none;border:0;text-decoration:underline;font:inherit;font-size:14px;color:var(--ink);cursor:pointer;display:block;margin:14px auto 0}" +
    ".su-addr{word-break:break-all;font-family:var(--fm);font-weight:600;font-size:14px;background:var(--white);border:1px dashed var(--line);border-radius:var(--r-sm);padding:14px;margin-bottom:10px}" +
    ".su-bal{font-size:14px;color:var(--muted);margin-bottom:14px;min-height:18px}";
  document.head.insertAdjacentHTML("beforeend", "<style>" + css + "</style>");
  document.body.insertAdjacentHTML("beforeend",
    '<div class="su-back" id="suBack" hidden><div class="su-card" role="dialog" aria-modal="true">' +
      '<button class="su-x" id="suClose" type="button" aria-label="Close">&times;</button>' +
      '<div id="suIn">' +
        "<h3>Sign up or log in</h3>" +
        "<p>Enter your email. We send a code and you get your own wallet address. No app needed.</p>" +
        '<div id="suStep1">' +
          '<input class="input" id="suEmail" type="email" placeholder="you@example.com" autocomplete="email">' +
          '<button class="btn btn-ink btn-full" id="suSend" type="button">Send code</button>' +
        "</div>" +
        '<div id="suStep2" hidden>' +
          '<input class="input" id="suCode" inputmode="numeric" autocomplete="one-time-code" placeholder="Code from your email" maxlength="10">' +
          '<button class="btn btn-ink btn-full" id="suVerify" type="button">Verify</button>' +
          '<button class="su-link" id="suChange" type="button">Use a different email</button>' +
        "</div>" +
        '<p class="status" id="suStatus"></p>' +
        '<button class="su-link" id="suExisting" type="button">I already have a wallet</button>' +
      "</div>" +
      '<div id="suOut" hidden>' +
        "<h3>Your wallet</h3>" +
        "<p>This is your address on Arc. To create gifts, send USDC on Arc to it.</p>" +
        '<div class="su-addr" id="suAddr"></div>' +
        '<div class="su-bal" id="suBal"></div>' +
        '<button class="btn btn-lemon btn-full" id="suCopy" type="button">Copy address</button>' +
        '<button class="su-link" id="suSignOut" type="button">Sign out</button>' +
      "</div>" +
    "</div></div>");

  function closeModal() { byId("suBack").hidden = true; }
  function resetIn() {
    byId("suStep1").hidden = false; byId("suStep2").hidden = true;
    byId("suCode").value = ""; setText("suStatus", "");
  }
  async function showWallet() {
    byId("suAddr").textContent = account;
    byId("suSignOut").hidden = kind !== "email";
    byId("suBal").textContent = "Checking balance…";
    try {
      const p = new ethers.JsonRpcProvider(cfg.rpc, cfg.chainId, { staticNetwork: true });
      const usdc = new ethers.Contract(cfg.usdc, ["function balanceOf(address) view returns (uint256)"], p);
      byId("suBal").textContent = "USDC balance: " + nice(ethers.formatUnits(await usdc.balanceOf(account), 6));
    } catch (e) { byId("suBal").textContent = ""; }
  }
  function openModal() {
    const logged = !!account;
    byId("suIn").hidden = logged;
    byId("suOut").hidden = !logged;
    if (logged) showWallet(); else resetIn();
    byId("suBack").hidden = false;
  }
  const why = (e) => String((e && (e.shortMessage || e.message)) || e).slice(0, 220);

  byId("suClose").onclick = closeModal;
  byId("suBack").addEventListener("click", (e) => { if (e.target === byId("suBack")) closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

  byId("suSend").onclick = async () => {
    const email = byId("suEmail").value.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) { setText("suStatus", "Enter a valid email address.", true); return; }
    const b = byId("suSend");
    b.disabled = true;
    setText("suStatus", "Sending… the first time can take a few seconds.");
    try {
      await sendCode(email);
      byId("suStep1").hidden = true; byId("suStep2").hidden = false;
      setText("suStatus", "We sent a code to " + email + ". Check your inbox and spam folder.");
    } catch (e) { setText("suStatus", why(e), true); }
    b.disabled = false;
  };
  byId("suVerify").onclick = async () => {
    const email = byId("suEmail").value.trim().toLowerCase();
    const code = byId("suCode").value.trim();
    if (!code) { setText("suStatus", "Enter the code from your email.", true); return; }
    const b = byId("suVerify");
    b.disabled = true;
    setText("suStatus", "Checking your code…");
    try {
      await verifyCode(email, code);
      closeModal();
    } catch (e) { setText("suStatus", why(e), true); }
    b.disabled = false;
  };
  byId("suChange").onclick = resetIn;
  byId("suExisting").onclick = async () => {
    try { await connect(); kind = "external"; closeModal(); }
    catch (e) { setText("suStatus", why(e), true); }
  };
  byId("suCopy").onclick = async () => {
    try { await navigator.clipboard.writeText(account); byId("suCopy").textContent = "Copied ✓"; }
    catch (e) { window.prompt("Copy your address:", account); }
    setTimeout(() => { byId("suCopy").textContent = "Copy address"; }, 1500);
  };
  byId("suSignOut").onclick = async () => {
    try { await loadSdk(); await wallet.disconnect(); } catch (e) {}
    localStorage.removeItem(SESSION_KEY);
    location.reload();
  };

  /* ---------- replace "Connect wallet" with "Sign up" ---------- */
  function rebind(id, fn) {
    const old = byId(id);
    if (!old) return null;
    const fresh = old.cloneNode(true);
    old.parentNode.replaceChild(fresh, old);
    fresh.addEventListener("click", fn);
    return fresh;
  }
  const headBtn = rebind("connectBtn", openModal);
  if (headBtn && !account) headBtn.textContent = "Sign up";
  const histBtn = rebind("histConnect", openModal);
  if (histBtn) histBtn.textContent = "Sign up";

  // Claim page: "Use my wallet" fills in the signed-in address
  rebind("walletBtn", async () => {
    try {
      if (account) { byId("addr").value = account; return; }
      if (window.ethereum) {
        const a = await window.ethereum.request({ method: "eth_requestAccounts" });
        byId("addr").value = a[0];
        return;
      }
      throw new Error("Paste your wallet address, or sign up (top right) to get one.");
    } catch (e) { setText("claimStatus", e.message, true); }
  });

  // Creating a gift needs a signed-in wallet
  prepareChain = async function () {
    if (!signer) {
      openModal();
      throw new Error("Please sign up or log in first (top right), then tap again.");
    }
    if (kind !== "email") await switchChain();
  };

  // Friendly hint when the wallet has no USDC yet
  const originalSetText = setText;
  setText = function (id, msg, isErr) {
    if (typeof msg === "string" && msg.indexOf("Not enough USDC") === 0 && account) {
      msg += " Tap your address at the top, copy it, and send USDC on Arc to it.";
    }
    return originalSetText(id, msg, isErr);
  };

  restore();
})();
