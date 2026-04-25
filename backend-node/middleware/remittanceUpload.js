const multer = require('multer');
const multerS3 = require('multer-s3');
const s3 = require('../config/s3');

const ALLOWED_MIME = [
  'application/pdf',
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'
];

const remittanceUpload = multer({
  storage: multerS3({
    s3,
    bucket: 'lorreyproject',
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: (req, file, cb) => {
      const safeName = file.originalname.replace(/\s+/g, '_');
      cb(null, `remittance_advise/${Date.now()}_${safeName}`);
    }
  }),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and image files (JPG, PNG, WEBP, GIF) are allowed.'));
    }
  }
});

module.exports = remittanceUpload;
