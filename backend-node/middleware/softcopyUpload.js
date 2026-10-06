const multer = require("multer");
const multerS3 = require("multer-s3");
const s3 = require("../config/s3");

const bucket = s3.BUCKET_NAME || process.env.AWS_S3_BUCKET || process.env.S3_BUCKET || "lorrey-data-bucket";

const softcopyUpload = multer({
    storage: multerS3({
        s3: s3,
bucket: bucket,
        contentType: multerS3.AUTO_CONTENT_TYPE,
        key: function (req, file, cb) {
            cb(null, `softcopy_invoice/${Date.now()}_${file.originalname}`);
        }
    })
});

module.exports = softcopyUpload;
