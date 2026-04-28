const mongoose = require('mongoose');
require('dotenv').config();

async function check() {
    await mongoose.connect(process.env.MONGO_URI);
    const db = mongoose.connection.useDb('invoice_system');
    const cols = await db.db.listCollections().toArray();
    console.log('Collections in invoice_system:', cols.map(c => c.name));
    
    const freightCol = db.db.collection('freight_data');
    console.log('Searching for Suri in freight_data...');
    const suriEntries = await freightCol.find({
        "DEST ZONE DESC": { $regex: /suri/i }
    }).toArray();
    
    suriEntries.forEach(s => {
        console.log(`Found: ${s["DEST ZONE DESC"]} | Rate: ${s.Rate} | Distance: ${s.Distance}`);
    });

    console.log('\nSearching for 731101 in freight_data...');
    const pinEntries = await freightCol.find({
        $or: [
            { "DEST ZONE DESC": { $regex: /731101/ } },
            { "PINCODE": { $regex: /731101/ } },
            { "Pincode": { $regex: /731101/ } }
        ]
    }).toArray();
    
    pinEntries.forEach(p => {
        console.log(`Found by PIN: ${p["DEST ZONE DESC"]} | Rate: ${p.Rate}`);
    });
    
    process.exit(0);
}

check();
