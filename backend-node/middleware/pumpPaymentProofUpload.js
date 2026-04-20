const multer = require("multer");
const multerS3 = require("multer-s3");
const s3 = require("../config/s3");

const pumpPaymentProofUpload = multer({
  storage: multerS3({
    s3: s3,
    bucket: "lorreyproject",
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: function (req, file, cb) {
      // Avoid spaces or weird characters in the filename prefix
      cb(null, `pump-payment-proof/${Date.now()}_${file.originalname.replace(/\\s+/g, '_')}`);
    }
  })
});

module.exports = pumpPaymentProofUpload;
