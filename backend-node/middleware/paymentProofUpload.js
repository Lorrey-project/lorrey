const multer = require("multer");
const multerS3 = require("multer-s3");
const s3 = require("../config/s3");

const paymentProofUpload = multer({
    storage: multerS3({
        s3: s3,
        bucket: "lorreyproject",
        contentType: multerS3.AUTO_CONTENT_TYPE,
        key: function (req, file, cb) {
            cb(null, `payment_proof/${Date.now()}_${file.originalname || 'proof'}`);
        }
    })
});

module.exports = paymentProofUpload;
