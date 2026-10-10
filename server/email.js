const { fmtCardAmount } = require("./brand");

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function giftEmailHtml({ amount, message, link, code, senderName, baseUrl }) {
  const amt = fmtCardAmount(amount);
  const headline = senderName ? `${esc(senderName)} sent you a gift` : "You've received a gift";
  const cardUrl = `${baseUrl}/card.png?amount=${encodeURIComponent(amount)}`;
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f2ec;font-family:Arial,Helvetica,sans-serif;color:#17181c;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f2ec;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:20px;">
  <tr><td style="padding:32px 28px 8px 28px;text-align:center;">
    <div style="font-size:26px;font-weight:bold;line-height:1.2;">${headline}</div>
    <div style="font-size:15px;color:#5c5e66;margin-top:8px;">Here is your Tessera USDC gift card.</div>
  </td></tr>
  <tr><td style="padding:16px 28px;text-align:center;">
    <img src="${esc(cardUrl)}" width="504" alt="$${esc(amt)} USDC gift card" style="display:block;width:100%;max-width:504px;height:auto;border-radius:16px;margin:0 auto;">
  </td></tr>
  ${message ? `<tr><td style="padding:4px 28px 8px 28px;"><div style="border-left:4px solid #cfde24;background:#f4f2ec;padding:12px 16px;font-size:15px;font-style:italic;color:#17181c;">“${esc(message)}”</div></td></tr>` : ""}
  <tr><td style="padding:16px 28px;text-align:center;">
    <a href="${esc(link)}" style="display:inline-block;background:#cfde24;color:#17181c;text-decoration:none;font-weight:bold;font-size:16px;padding:16px 40px;border-radius:999px;border:1.5px solid #17181c;">Claim your gift</a>
  </td></tr>
  <tr><td style="padding:8px 28px 4px 28px;text-align:center;font-size:13px;color:#5c5e66;">Or go to ${esc(baseUrl)}/claim and enter this code:</td></tr>
  <tr><td style="padding:6px 28px 20px 28px;text-align:center;">
    <span style="display:inline-block;background:#f4f2ec;border-radius:10px;padding:10px 16px;font-family:'Courier New',monospace;font-size:18px;letter-spacing:1px;font-weight:bold;">${esc(code)}</span>
  </td></tr>
  <tr><td style="padding:0 28px 24px 28px;font-size:13px;color:#5c5e66;line-height:1.6;text-align:center;">
    1. Tap <b>Claim your gift</b> &nbsp;2. Paste a wallet address that can receive USDC on Arc &nbsp;3. Done. Tessera pays the gas.
  </td></tr>
  <tr><td style="border-top:1px solid #e5e3dc;padding:20px 28px;text-align:center;">
    <img src="${esc(baseUrl)}/brand/logo-header.png" width="150" alt="Tessera" style="display:inline-block;height:auto;">
    <div style="font-size:12px;color:#8a8c94;margin-top:12px;line-height:1.5;">Single-use gift. Anyone with this link can claim it, so keep it private.</div>
  </td></tr>
</table></td></tr></table></body></html>`;
}

async function sendGiftEmail({ to, amount, message, link, code, senderName, baseUrl }) {
  if (!process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY missing");
  const amt = fmtCardAmount(amount);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: [to],
      subject: senderName ? `${senderName} sent you a $${amt} USDC gift` : `You received a $${amt} USDC gift`,
      html: giftEmailHtml({ amount, message, link, code, senderName, baseUrl }),
      text: `You've received a $${amt} USDC gift.\nClaim: ${link}\nCode: ${code}`,
    }),
  });
  if (!res.ok) throw new Error(`Resend error: ${await res.text()}`);
}

module.exports = { esc, sendGiftEmail };
