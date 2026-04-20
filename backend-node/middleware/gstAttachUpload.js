const multer = require("multer");
const multerS3 = require("multer-s3");
const s3 = require("../config/s3");

// Upload GST Portal attachments (gst file proof)
// to S3 bucket: lorreyproject/gst_portal_attachments/
const gstAttachUpload = multer({
  storage: multerS3({
    s3,
    bucket: "lorreyproject",
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: function (req, file, cb) {
      const folder = req.params.attachType || "gst_file"; 
      const rowId  = req.params.rowId || "unknown";
      const ts     = Date.now();
      const safe   = (file.originalname || "file").replace(/[^a-zA-Z0-9._-]/g, "_");
      cb(null, `gst_portal_attachments/${folder}/${rowId}_${ts}_${safe}`);
    }
  }),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB max
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    cb(null, allowed.includes(file.mimetype));
  }
});

module.exports = gstAttachUpload;
