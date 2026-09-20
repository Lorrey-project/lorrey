const User = require('../models/User');

const SEED_ACCOUNTS = [
  {
    email: 'office@dac.com',
    password: 'officedac@713201',
    role: 'OFFICE',
    name: 'Office Panel',
    status: 'active'
  },
  {
    email: 'site@nuvoco.com',
    password: 'nuvoco@713148',
    role: 'SITE',
    name: 'Site Panel',
    status: 'active'
  },
  {
    email: 'sas1@sas.com',
    password: 'sas1@0001',
    role: 'PETROL PUMP',
    pumpName: 'SAS-1',
    name: 'Pump SAS1 Panel',
    status: 'active'
  },
  {
    email: 'sas2@sas.com',
    password: 'sas2@0002',
    role: 'PETROL PUMP',
    pumpName: 'SAS-2',
    name: 'Pump SAS2 Panel',
    status: 'active'
  },
  {
    email: 'brindashyam@dac.com',
    password: 'brinda@713201',
    role: 'BRINDA SHYAM',
    name: 'Brinda Shyam Panel',
    status: 'active'
  },
  {
    email: 'jeetpanja@dac.com',
    password: 'jeetpanja@713201',
    role: 'JEET PANJA',
    name: 'Jeet Panja Panel',
    status: 'active'
  }
];

const seedUsers = async () => {
  try {
    for (const acc of SEED_ACCOUNTS) {
      let user = await User.findOne({ email: acc.email });
      if (!user) {
        user = new User(acc);
        await user.save();
        console.log(`[SEED] Created default account: ${acc.email}`);
      } else {
        let modified = false;
        if (user.role !== acc.role) { user.role = acc.role; modified = true; }
        if (user.status !== 'active') { user.status = 'active'; modified = true; }
        if (acc.pumpName && user.pumpName !== acc.pumpName) { user.pumpName = acc.pumpName; modified = true; }
        
        const isPassMatch = await user.comparePassword(acc.password);
        if (!isPassMatch) {
          user.password = acc.password; // pre('save') hook will hash it
          modified = true;
        }

        if (modified) {
          await user.save();
          console.log(`[SEED] Updated account credentials/status for: ${acc.email}`);
        }
      }
    }
  } catch (err) {
    console.error('[SEED] Error seeding default accounts:', err);
  }
};

module.exports = seedUsers;
