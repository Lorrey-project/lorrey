const multer = require("multer");
const multerS3 = require("multer-s3");
const s3 = require("../config/s3");

const bucket = s3.BUCKET_NAME || process.env.AWS_S3_BUCKET || process.env.S3_BUCKET || "lorrey-data-bucket";

const pumpPaymentProofUpload = multer({
bucket: bucket,
});

module.exports = pumpPaymentProofUpload;
