const mongoose = require('mongoose');
async function clearJanuary() {
  await mongoose.connect('mongodb://127.0.0.1:27017/cement_register');
  const db = mongoose.connection;
  const col = db.collection('entries');
  const count = await col.countDocuments({ month: 1, year: 2026 });
  console.log(`Found ${count} documents for January 2026.`);
  const result = await col.deleteMany({ month: 1, year: 2026 });
  console.log(`Deleted ${result.deletedCount} documents.`);
  await mongoose.disconnect();
}
clearJanuary().catch(console.error);
