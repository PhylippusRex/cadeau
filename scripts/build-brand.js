const fs = require("fs");
const path = require("path");
const b = require("../server/brand");

const dir = path.join(__dirname, "..", "public", "brand");
fs.mkdirSync(dir, { recursive: true });
const write = (name, data) => {
  fs.writeFileSync(path.join(dir, name), data);
  console.log("Wrote public/brand/" + name);
};

write("logo-header.svg", b.headerSvg("#000000"));
write("logo-header-light.svg", b.headerSvg("#FFFFFF"));
write("logo-standalone.svg", b.standaloneSvg());
write("favicon.svg", b.faviconSvg());
write("logo-header.png", b.png(b.headerSvg("#000000"), 480));
write("logo-standalone.png", b.png(b.standaloneSvg(), 512));
write("favicon.png", b.png(b.faviconSvg(), 180));
write("card-sample.png", b.png(b.cardSvg("10"), 1200));
