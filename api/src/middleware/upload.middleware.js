const multer = require("multer");
const path = require("path");
const fs = require("fs");
const sharp = require("sharp");

const baseUploadDir = path.join(__dirname, "../uploads");

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

ensureDir(baseUploadDir);

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|webp/;
  const ext = allowedTypes.test(
    path.extname(file.originalname).toLowerCase()
  );
  const mime = allowedTypes.test(file.mimetype);

  if (ext && mime) {
    cb(null, true);
  } else {
    cb(new Error("Only images are allowed"));
  }
};

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter,
});

const csvFileFilter = (req, file, cb) => {
  const lower = (file.originalname || '').toLowerCase();
  const extOk = lower.endsWith('.csv');
  const mime = (file.mimetype || '').toLowerCase();
  const mimeOk =
    mime === 'text/csv' ||
    mime === 'application/csv' ||
    mime === 'text/plain' ||
    mime === 'application/vnd.ms-excel';
  if (extOk || mimeOk) {
    cb(null, true);
  } else {
    cb(new Error('Only .csv uploads are allowed (field name: file)'));
  }
};

/** CSV uploads for bulk product import (memory only; not converted to WebP). */
const uploadCsv = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: csvFileFilter
});

function uploadTo(destination) {
  return (req, res, next) => {
    req.uploadDestination = destination;
    next();
  };
}

/**
 * Middleware to process (compress and convert) images to webp with 70% quality after multer upload.
 * Expects `upload.single(fieldName)` or `upload.array(fieldName)` before this middleware.
 * The processed file will be written to disk and set as req.file or req.files with `.webp` extension.
 */
async function convertToWebp(req, res, next) {
  // Single file support
  const processFile = async (file) => {
    if (!file) return;
    const subfolder = req.uploadDestination || "";
    const destDir = path.join(baseUploadDir, subfolder);
    ensureDir(destDir);

    const uniqueName = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const fileName = uniqueName + ".webp";
    const filePath = path.join(destDir, fileName);

    // Downscale before encode: large originals dominate CPU time in WebP conversion.
    await sharp(file.buffer)
      .rotate()
      .resize({
        width: 1920,
        height: 1920,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 70, effort: 3 })
      .toFile(filePath);

    // Overwrite the file field properties
    file.filename = fileName;
    file.path = filePath;
    file.mimetype = "image/webp";
    file.destination = destDir;
    file.size = fs.statSync(filePath).size;
    // Remove buffer to avoid accidental leak
    delete file.buffer;
  };

  try {
    if (req.file) {
      await processFile(req.file);
    }
    if (Array.isArray(req.files)) {
      for (const file of req.files) {
        await processFile(file);
      }
    } else if (req.files && typeof req.files === 'object') {
      // Support for .fields([{name}]) upload variant
      for (const filesArr of Object.values(req.files)) {
        for (const file of filesArr) {
          await processFile(file);
        }
      }
    }
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { upload, uploadTo, convertToWebp, uploadCsv };