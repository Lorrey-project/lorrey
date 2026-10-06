const multer = require('multer');
const multerS3 = require('multer-s3');
const s3 = require('../config/s3');

const bucket = s3.BUCKET_NAME || process.env.AWS_S3_BUCKET || process.env.S3_BUCKET || 'lorrey-data-bucket';

const remittanceUpload = multer({
  storage: multerS3({
s3: s3,
    s3: s3,
    bucket: bucket,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: function (req, file, cb) {
      cb(null, `remittances/${Date.now()}_${file.originalname}`);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and image files are allowed for remittance proof!'), false);
    }
  }
});

module.exports = remittanceUpload;
