const mongoose = require('mongoose');
require('dotenv').config();

async function backfill() {
    await mongoose.connect(process.env.MONGO_URI);
    const cementDb = mongoose.connection.useDb('cement_register');
    const invoiceDb = mongoose.connection.useDb('invoice_system');
    
    const cementCol = cementDb.collection('entries');
    const truckCol = invoiceDb.collection('Truck Contact Number');
    
    const entries = await cementCol.find({ 
        $or: [
            { WHEEL: { $exists: false } },
            { WHEEL: "" },
            { WHEEL: null }
        ],
        "VEHICLE NUMBER": { $exists: true, $ne: "" }
    }).toArray();
    
    console.log(`Found ${entries.length} entries with missing WHEEL count.`);
    
    let updated = 0;
    for (const entry of entries) {
        const vno = entry["VEHICLE NUMBER"];
        if (!vno) continue;
        
        // Use space-agnostic matching
        const stripped = vno.replace(/[^a-zA-Z0-9]/g, '');
        const regexStr = stripped.split('').join('[^a-zA-Z0-9]*');
        const truckRegex = new RegExp(`^[^a-zA-Z0-9]*${regexStr}[^a-zA-Z0-9]*$`, 'i');
        
        const truck = await truckCol.findOne({
            $or: [
                { truck_no: { $regex: truckRegex } },
                { "Truck No": { $regex: truckRegex } },
                { "Contact No.(Truck No.)": { $regex: truckRegex } }
            ]
        });
        
        if (truck) {
            let vType = truck.type_of_vehicle || truck["Type of vehicle"] || truck.type || truck["Vehicle Type"] || "";
            if (!vType) {
                for (let key in truck) {
                    const lk = key.toLowerCase();
                    if (lk.includes("type") || lk.includes("wheel")) {
                        vType = truck[key];
                        break;
                    }
                }
            }
            
            const wheelMatch = vType ? String(vType).match(/(\d+)/) : null;
            const wheelCount = wheelMatch ? `${wheelMatch[1]}W` : String(vType);
            
            if (wheelCount) {
                await cementCol.updateOne(
                    { _id: entry._id },
                    { $set: { WHEEL: wheelCount } }
                );
                updated++;
                if (updated % 10 === 0) console.log(`Updated ${updated} entries...`);
            }
        }
    }
    
    console.log(`Successfully backfilled ${updated} entries.`);
    process.exit(0);
}

backfill();
