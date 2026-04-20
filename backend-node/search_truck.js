require('dotenv').config();
const mongoose = require('mongoose');

async function search() {
    await mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/lorreyproject");
    const db = mongoose.connection.useDb("invoice_system");
    const truckCol = db.collection("Truck Contact Number");
    
    // Find any document that matches WB14F4393
    // Since we don't know the exact field name or spacing/hyphens, let's fetch all and filter in JS
    console.log("Fetching all trucks...");
    const all = await truckCol.find({}).toArray();
    
    const target = "WB14F4393".toLowerCase().replace(/[^a-z0-9]/g, '');
    let found = [];
    
    for(let doc of all) {
        for(let key in doc) {
            const val = String(doc[key] || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            if(val === target) {
                found.push({ matchedKey: key, originalValue: doc[key], _id: doc._id });
            }
        }
    }
    
    console.log(`Found ${found.length} matches:`, found);
    
    // If mostly empty, try a subset search like "4393"
    if(found.length === 0) {
        console.log("Fallback: searching for anything ending in 4393");
        for(let doc of all) {
             for(let key in doc) {
                 if(String(doc[key]).includes("4393")) {
                     console.log("Found 4393 in doc:", doc);
                 }
             }
        }
    }
    
    process.exit(0);
}
search().catch(console.error);
