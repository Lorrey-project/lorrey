const multer = require("multer");
const multerS3 = require("multer-s3");
const s3 = require("../config/s3");

const truckContactUpload = multer({
    storage: multerS3({
        s3: s3,
        bucket: "lorreyproject",
        contentType: multerS3.AUTO_CONTENT_TYPE,
        key: function (req, file, cb) {
            cb(null, `truck_contacts/${Date.now()}_${file.originalname || 'document'}`);
        }
    })
});

module.exports = truckContactUpload;
