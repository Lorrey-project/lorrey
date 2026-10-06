const multer = require("multer");
const multerS3 = require("multer-s3");
const s3 = require("../config/s3");

const bucket = s3.BUCKET_NAME || process.env.AWS_S3_BUCKET || process.env.S3_BUCKET || "lorrey-data-bucket";

// Upload GST Portal attachments (Challan, PDF, etc.)
const gstAttachUpload = multer({
  storage: multerS3({
    s3,
bucket: bucket,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: function (req, file, cb) {
      const gstrType = req.params.gstrType || "gstr_other"; // e.g. "gstr3b" or "gstr1"
      const rowId    = req.params.rowId || "unknown";
      const ts       = Date.now();
      const safe     = (file.originalname || "file").replace(/[^a-zA-Z0-9._-]/g, "_");
      cb(null, `gst_portal_attachments/${gstrType}/${rowId}_${ts}_${safe}`);
    }
  }),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB max
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    cb(null, allowed.includes(file.mimetype));
  }
});

module.exports = gstAttachUpload;
