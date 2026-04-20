const multer = require("multer");
const multerS3 = require("multer-s3");
const s3 = require("../config/s3");

// Upload cement register attachments (challan proof, site cash voucher)
// to S3 bucket: lorreyproject/cement_attachments/
const cementAttachUpload = multer({
  storage: multerS3({
    s3,
    bucket: "lorreyproject",
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: function (req, file, cb) {
      const folder = req.params.attachType || "misc"; // e.g. "challan_proof" or "site_cash"
      const rowId  = req.params.rowId || "unknown";
      const ts     = Date.now();
      const safe   = (file.originalname || "file").replace(/[^a-zA-Z0-9._-]/g, "_");
      cb(null, `cement_attachments/${folder}/${rowId}_${ts}_${safe}`);
    }
  }),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB max
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    cb(null, allowed.includes(file.mimetype));
  }
});

module.exports = cementAttachUpload;
