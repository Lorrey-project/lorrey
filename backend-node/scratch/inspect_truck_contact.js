const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

function makeSpaceAgnosticRegex(str) {
  if (!str) return /^$/;
  const stripped = str.replace(/[^a-zA-Z0-9]/g, '');
  const regexStr = stripped.split('').join('[^a-zA-Z0-9]*');
  return new RegExp(`^[^a-zA-Z0-9]*${regexStr}[^a-zA-Z0-9]*$`, 'i');
}

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    const db = mongoose.connection.useDb('invoice_system');
    const col = db.collection('Truck Contact Number');
    const reg = makeSpaceAgnosticRegex('WB39A5858');
    const contact = await col.findOne({
      $or: [
        { "Truck No": { $regex: reg } },
        { "Truck No ": { $regex: reg } },
        { truck_no: { $regex: reg } },
        { "Contact No.(Truck No.)": { $regex: reg } },
        { "Contact No\\.(Truck No\\.)": { $regex: reg } }
      ]
    });
    console.log("Contact found:", contact);
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
