const QRCode = require("qrcode");

const url = process.argv[2] || "https://hostel-administration-1432a.web.app";
const outFile = "hostel-application-qr.png";

QRCode.toFile(outFile, url, { width: 800, margin: 2 }, (err) => {
  if (err) throw err;
  console.log(`QR code for ${url} saved to ${outFile}`);
});
