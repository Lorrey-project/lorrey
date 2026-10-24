const multer = require('multer');
const multerS3 = require('multer-s3');
const path = require('path');
const fs = require('fs');
const s3 = require('../config/s3');

const bucket = s3.BUCKET_NAME || process.env.AWS_S3_BUCKET || process.env.S3_BUCKET || 'lorrey-data-bucket';

// Ensure local uploads/check_books exists for fallback
const localUploadDir = path.join(__dirname, '../uploads/check_books');
if (!fs.existsSync(localUploadDir)) {
  fs.mkdirSync(localUploadDir, { recursive: true });
}

const hasAwsCredentials = Boolean(
  (process.env.AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY) &&
  (process.env.AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_KEY)
);

let storage;
if (hasAwsCredentials) {
  try {
    storage = multerS3({
      s3,
      bucket,
      contentType: multerS3.AUTO_CONTENT_TYPE,
      key: function (req, file, cb) {
        const ts = Date.now();
        const safe = (file.originalname || 'check_document').replace(/[^a-zA-Z0-9._-]/g, '_');
        cb(null, `check_books/${ts}_${safe}`);
      }
    });
  } catch (err) {
    console.warn('[checkBookUpload] Falling back to local disk storage:', err.message);
    storage = multer.diskStorage({
      destination: function (req, file, cb) {
        cb(null, localUploadDir);
      },
      filename: function (req, file, cb) {
        const ts = Date.now();
        const safe = (file.originalname || 'check_document').replace(/[^a-zA-Z0-9._-]/g, '_');
        cb(null, `${ts}_${safe}`);
      }
    });
  }
} else {
  storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, localUploadDir);
    },
    filename: function (req, file, cb) {
      const ts = Date.now();
      const safe = (file.originalname || 'check_document').replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `${ts}_${safe}`);
    }
  });
}

const allowedMimes = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/pdf'
];

const checkBookUpload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB max per check
  fileFilter: (req, file, cb) => {
    if (allowedMimes.includes(file.mimetype) || file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, JPG, PNG, and PDF files are allowed for check documents!'), false);
    }
  }
});

module.exports = checkBookUpload;
