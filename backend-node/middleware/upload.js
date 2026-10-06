const multer = require("multer");
const multerS3 = require("multer-s3");
const s3 = require("../config/s3");

const bucket = process.env.AWS_S3_BUCKET || process.env.S3_BUCKET || process.env.AWS_BUCKET_NAME || "lorrey-data-bucket";

const upload = multer({
  storage: multerS3({
    s3: s3,
bucket: bucket,

    contentType: multerS3.AUTO_CONTENT_TYPE,

    key: function (req, file, cb) {
      cb(null, `upload-invoice/${Date.now()}_${file.originalname}`);
    }
  })
});

module.exports = upload;