const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    const db = mongoose.connection.useDb('invoice_system');
    const col = db.collection('Truck Contact Number');
    const contacts = await col.find({}).toArray();
    
    console.log(`Total contacts: ${contacts.length}`);
    contacts.slice(0, 15).forEach((c, idx) => {
      console.log(`Contact ${idx} (${c.truck_no || c['Truck No '] || c['Truck No']}):`, {
        basic_freight_commission: c.basic_freight_commission,
        basic_freight_commission_applicability: c['Basic Freight Comission Applicability '] || c.basic_freight_commission_applicability,
        incentive_commission: c.incentive_commission || c['Incentive Comission Appliciability '] || c['incentive_comm']
      });
    });
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
