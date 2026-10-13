// Cadeau card pictures.
// The card artwork is a picture (public/brand/card-base.png). The amount and the
// code are written on top of it, so they can change for every gift.
const fs = require("fs");
const path = require("path");
const { Resvg } = require("@resvg/resvg-js");

const BRAND_DIR = path.join(__dirname, "..", "public", "brand");
const FONT_DIR = path.join(__dirname, "fonts");
const FONT_FILES = ["Manrope-Regular.ttf", "Manrope-Medium.ttf", "Manrope-Bold.ttf"]
  .map((f) => path.join(FONT_DIR, f))
  .filter((f) => fs.existsSync(f));

const LIME = "#CFDE24";
const MASK = "CDEU-XXXX-XXXX-XXXX-XXXX";
const CARD_W = 1200;
const CARD_H = 744;

// Pictures are read once and kept in memory
const uris = {};
function pictureUri(file) {
  if (uris[file] === undefined) {
    try {
      uris[file] = "data:image/png;base64," + fs.readFileSync(path.join(BRAND_DIR, file)).toString("base64");
    } catch (e) {
      uris[file] = "";
    }
  }
  return uris[file];
}

// Amount text for the card: 10 -> "10", 0.05 -> "0.05", 12.5 -> "12.50", 1000 -> "1,000"
function fmtCardAmount(a) {
  const n = Number(a);
  if (!isFinite(n) || n <= 0) return "0";
  let s = n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 6 });
  const dot = s.indexOf(".");
  if (dot !== -1 && s.length - dot - 1 < 2) s += "0";
  return s;
}

// The gift card (1200 x 744)
function cardSvg(amount = "10", code = MASK) {
  const txt = fmtCardAmount(amount);
  const size = txt.length <= 6 ? 82 : Math.max(40, (82 * 6) / txt.length);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">` +
    `<image href="${pictureUri("card-base.png")}" x="0" y="0" width="${CARD_W}" height="${CARD_H}"/>` +
    `<text x="38" y="91" font-family="Manrope" font-weight="400" font-size="42" fill="#fff">$</text>` +
    `<text x="64" y="114" font-family="Manrope" font-weight="700" font-size="${size}" fill="${LIME}">${txt}</text>` +
    `<text x="1154" y="683" text-anchor="end" font-family="Manrope" font-weight="500" font-size="36" fill="#fff">${code}</text>` +
    `</svg>`
  );
}

// Link-preview picture (1200 x 630): the card centred on white
function ogSvg(amount = "10", code = MASK) {
  const ch = 520;
  const cw = (CARD_W * ch) / CARD_H;
  const x = ((1200 - cw) / 2).toFixed(1);
  const y = ((630 - ch) / 2).toFixed(1);
  const card = cardSvg(amount, code).replace("<svg ", `<svg x="${x}" y="${y}" width="${cw.toFixed(1)}" height="${ch}" `);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#FFFFFF"/>${card}</svg>`;
}

// Generic preview (no amount): the standalone logo centred on white
function ogDefaultSvg() {
  const logo = pictureUri("logo-standalone.png");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#FFFFFF"/>` +
    (logo ? `<image href="${logo}" x="300" y="95" width="600" height="440" preserveAspectRatio="xMidYMid meet"/>` : "") +
    `</svg>`
  );
}

function png(svg, width, background) {
  return new Resvg(svg, {
    background,
    font: { fontFiles: FONT_FILES, loadSystemFonts: FONT_FILES.length === 0 },
    fitTo: { mode: "width", value: width },
  })
    .render()
    .asPng();
}

module.exports = { fmtCardAmount, cardSvg, ogSvg, ogDefaultSvg, png };
