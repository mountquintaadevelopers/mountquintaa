const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');

const qrCodeDir = path.join(__dirname, '../uploads/qrcodes');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

ensureDir(qrCodeDir);

/**
 * Generates (or reuses a previously generated) QR code PNG encoding `text`.
 * Returns the path relative to the /uploads static mount, e.g. "qrcodes/BK-0001.png".
 */
async function generateQrCodeFile(text, fileBaseName) {
  ensureDir(qrCodeDir);
  const safeName = String(fileBaseName).replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName = `${safeName}.png`;
  const filePath = path.join(qrCodeDir, fileName);

  if (!fs.existsSync(filePath)) {
    await QRCode.toFile(filePath, String(text), {
      type: 'png',
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 400
    });
  }

  return `qrcodes/${fileName}`;
}

module.exports = { generateQrCodeFile };
