const mongoose = require('mongoose');
mongoose.connect('mongodb+srv://lorrey0004:lorrey0004@cluster0.pqbigfd.mongodb.net/invoiceAI?retryWrites=true&w=majority').then(async () => {
  const users = await mongoose.connection.db.collection('users').find({}).toArray();
  console.log(users.map(u => ({ email: u.email, role: u.role })));
  process.exit();
}).catch(console.error);
