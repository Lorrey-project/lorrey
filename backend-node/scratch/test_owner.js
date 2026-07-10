const mongoose = require('mongoose');
mongoose.connect('mongodb://localhost:27017/invoice_system').then(async () => {
  const col = mongoose.connection.collection('Truck Contact Number');
  const contacts = await col.find({}).toArray();
  const ownerMap = {};
  contacts.forEach(c => {
    const owner = c['Owner Name '] || c['Owner Name'] || c.owner_name;
    const truck = c['Truck No '] || c['Truck No'] || c.truck_no;
    if (owner && truck) {
      if (!ownerMap[String(owner).trim()]) ownerMap[String(owner).trim()] = [];
      ownerMap[String(owner).trim()].push(String(truck).trim());
    }
  });
  console.log('Animesh Banerje:', ownerMap['Animesh Banerje']);
  console.log('Sourav Ghosh:', ownerMap['Sourav Ghosh']);
  console.log('TUSHAR Kanti Mo:', ownerMap['TUSHAR Kanti Mo']);
  process.exit();
});
