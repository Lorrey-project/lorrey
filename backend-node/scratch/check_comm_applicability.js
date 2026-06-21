const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    const db = mongoose.connection.useDb('invoice_system');
    const col = db.collection('Truck Contact Number');
    const contacts = await col.find({}).toArray();
    
    let count = 0;
    contacts.forEach((c) => {
      const val = c['Basic Freight Comission Applicability '] || c.basic_freight_commission_applicability || '';
      if (String(val).toUpperCase().includes('YES')) {
        count++;
        console.log(`Truck ${c.truck_no || c['Truck No']} has applicability set:`, val);
      }
    });
    console.log(`Total contacts with basic freight commission applicability = YES: ${count}`);
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
