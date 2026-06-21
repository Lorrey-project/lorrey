const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

function num(val, fb = 0) {
  if (val === undefined || val === null || val === '') return fb;
  const cleaned = String(val).replace(/,/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? fb : n;
}

function parseLoadingDate(str) {
  if (!str) return null;
  const clean = String(str).trim();
  const parts = clean.split(/[-\/\.]/);
  if (parts.length === 3) {
    const a = parseInt(parts[0], 10);
    const b = parseInt(parts[1], 10);
    const c = parseInt(parts[2], 10);
    
    // Check if it's YYYY-MM-DD
    if (a > 1000 && b >= 1 && b <= 12 && c >= 1 && c <= 31) {
      const date = new Date(a, b - 1, c);
      if (!isNaN(date.getTime())) return date;
    }
    
    // Check if it's DD-MM-YYYY or DD-MM-YY
    const day = a;
    const month = b - 1;
    let year = c;
    if (parts[2].length === 2) {
      year += (year >= 70 ? 1900 : 2000);
    }
    if (day >= 1 && day <= 31 && month >= 0 && month <= 11) {
      const date = new Date(year, month, day);
      if (!isNaN(date.getTime())) return date;
    }
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

function classifyRow(row) {
  const site = (row['SITE'] || '').toUpperCase().trim();
  if (site === 'NVL') return 'NVL';
  if (site === 'NVCL') return 'NVCL';
  if (row._is_ato === true || row._is_ato === 'true') return 'NVL';
  if (row._is_ato === false || row._is_ato === 'false') return 'NVCL';
  const billType = (row['Bill Type'] || '').toUpperCase();
  if (billType === 'NT') return 'NVL';
  if (billType === 'STO' || billType === 'SO') return 'NVCL';
  const type = (row['TYPE'] || '').toUpperCase();
  if (type === 'ATOA' || type === 'ATO') return 'NVL';
  if (type === 'MKT') return 'NVCL';
  return 'NVL';
}

function truckDisplayType(row) {
  const cat = classifyRow(row);
  if (row['TYPE']) return row['TYPE'];
  return cat === 'NVL' ? 'ATOA' : 'MKT';
}

function buildIncentiveData(rows, year, month, truckContacts = []) {
  const filtered = rows.filter(row => {
    const ld = row['LOADING DT'];
    const d = parseLoadingDate(ld);
    if (!d) return false;
    return d.getFullYear() === year && d.getMonth() === month;
  });

  const byTruck = {};
  for (const row of filtered) {
    const truck = (row['VEHICLE NUMBER'] || '').trim().toUpperCase();
    if (!truck) continue;

    if (!byTruck[truck]) {
      const contact = truckContacts.find(c => {
        const dbNo = (c['Truck No '] || c['Truck No'] || c.truck_no || '').trim().toUpperCase();
        return dbNo === truck;
      });

      const dbWheel = contact ? (
        contact['Type of vehicle '] ||
        contact['Type of vehicle'] ||
        contact['type_of_vehicle'] ||
        contact.veh_type ||
        ''
      ) : '';

      const owner = contact ? (contact['Owner Name '] || contact['Owner Name'] || contact.owner_name || '') : '';

      const dbCustType = contact ? (
        contact['TYPE OF CUSTOMER '] ||
        contact['type_of_customer'] ||
        contact['type_of_customers'] ||
        contact.cust_type ||
        contact.type ||
        ''
      ) : '';
      let displayType = truckDisplayType(row);
      if (dbCustType) {
        const upper = String(dbCustType).toUpperCase().trim();
        if (upper === 'ATOA' || upper === 'ATO') displayType = 'ATOA';
        else if (upper === 'MKT') displayType = 'MKT';
      }

      const commApp = contact ? (contact['Basic Freight Comission Applicability '] || contact.basic_freight_commission_applicability || '') : '';
      const commValue = contact ? (contact.basic_freight_commission || contact['basic_freight_commission '] || 0.05) : 0.05;

      byTruck[truck] = {
        type: displayType,
        ownerName: row['OWNER NAME'] || owner || '',
        truckNo: truck,
        wheel: row['WHEEL'] || dbWheel || '',
        tripsCount: 0,
        nvl: { invQty: 0, orgFreight: 0, amt: 0 },
        nvcl: { invQty: 0, orgFreight: 0, amt: 0 },
        extra10W: 0,
        extra6W: 0,
        commission: 0,
        hasComm: String(commApp).toUpperCase().includes('YES'),
        commRate: num(commValue, 0.05)
      };
    }

    const entry = byTruck[truck];
    const cat = classifyRow(row);
    const mt = num(row['MT']);
    const billing = num(row['BILLING']);
    const orgFreight = billing * mt;

    entry.tripsCount += 1;
    const baseIncentive = orgFreight * 0.095;

    if (cat === 'NVL') {
      entry.nvl.invQty = Math.round(entry.nvl.invQty + mt);
      entry.nvl.orgFreight += orgFreight;
      entry.nvl.amt += baseIncentive;
    } else {
      entry.nvcl.invQty = Math.round(entry.nvcl.invQty + mt);
      entry.nvcl.orgFreight += orgFreight;
      entry.nvcl.amt += baseIncentive;
    }

    const bType = (row['Bill Type'] || '').toUpperCase();
    const isSoOrNt = bType === 'SO' || bType === 'NT';

    const manualW10 = num(row['10W EXTRA 8.5%']);
    if (manualW10 > 0) {
      entry.extra10W += manualW10;
    } else if (isSoOrNt) {
      const wheelStr = String(entry.wheel).toLowerCase();
      if (wheelStr.includes('10')) {
        entry.extra10W += orgFreight * 0.085;
      }
    }

    if (isSoOrNt) {
      const wheelStr = String(entry.wheel).toLowerCase();
      if (wheelStr.includes('6')) {
        entry.extra6W += orgFreight * 0.15;
      }
    }

    if (entry.hasComm) {
      const commRate = num(entry.commRate, 0.05);
      entry.commission += orgFreight * commRate;
    }
  }

  return Object.values(byTruck).map(t => {
    const metCriteria = t.tripsCount > 6;

    if (!metCriteria) {
      t.extra10W = 0;
      t.extra6W = 0;
    }

    t.nvl.amt = Math.round(t.nvl.amt);
    t.nvcl.amt = Math.round(t.nvcl.amt);
    t.extra10W = Math.round(t.extra10W);
    t.extra6W = Math.round(t.extra6W);

    const nvlNvclTotal = t.nvl.amt + t.nvcl.amt;
    const totalIncentiveWithBonus = nvlNvclTotal + t.extra10W + t.extra6W;
    const totalFinal = totalIncentiveWithBonus - Math.round(t.commission);

    return { ...t, total: nvlNvclTotal, totalFinal };
  });
}

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    const db = mongoose.connection.useDb('cement_register');
    const entries = await db.collection('entries').find({}).toArray();
    const contacts = await mongoose.connection.useDb('invoice_system').collection('Truck Contact Number').find({}).toArray();
    
    console.log(`Loaded ${entries.length} entries, ${contacts.length} contacts.`);
    const result = buildIncentiveData(entries, 2026, 0, contacts); // January 2026 is month index 0
    
    console.log(`Calculated results: ${result.length} trucks found.`);
    console.log("Calculated results for top trucks:");
    result.slice(0, 10).forEach(r => {
      console.log(r.truckNo, {
        type: r.type,
        trips: r.tripsCount,
        nvlQty: r.nvl.invQty,
        nvlAmt: r.nvl.amt,
        nvclQty: r.nvcl.invQty,
        nvclAmt: r.nvcl.amt,
        total: r.total,
        extra10W: r.extra10W,
        extra6W: r.extra6W,
        totalFinal: r.totalFinal,
        commission: Math.round(r.commission)
      });
    });
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
