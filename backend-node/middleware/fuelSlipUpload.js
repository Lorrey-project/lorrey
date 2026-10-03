const multer = require("multer");
const multerS3 = require("multer-s3");
const s3 = require("../config/s3");

const fuelSlipUpload = multer({
    storage: multerS3({
        s3: s3,
        bucket: process.env.S3_BUCKET || "lorrey-data-bucket",
        contentType: multerS3.AUTO_CONTENT_TYPE,
        key: function (req, file, cb) {
            cb(null, `softcopy_dieselslip/${Date.now()}_${file.originalname || 'fuel_slip.pdf'}`);
        }
    })
});

module.exports = fuelSlipUpload;
