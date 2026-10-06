const { S3Client } = require("@aws-sdk/client-s3");

const region = (process.env.AWS_REGION || "eu-north-1").trim();
const accessKeyId = (process.env.AWS_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID || "").trim();
const secretAccessKey = (process.env.AWS_SECRET_KEY || process.env.AWS_SECRET_ACCESS_KEY || "").trim();

const s3 = new S3Client({
  region,
  credentials: {
    accessKeyId,
    secretAccessKey
  }
});

const BUCKET_NAME = (process.env.AWS_S3_BUCKET || process.env.S3_BUCKET || process.env.AWS_BUCKET_NAME || "lorrey-data-bucket").trim();
s3.BUCKET_NAME = BUCKET_NAME;
s3.bucketName = BUCKET_NAME;

module.exports = s3;