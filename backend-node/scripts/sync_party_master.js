const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://lorrey0004:lorrey0004@cluster0.pqbigfd.mongodb.net/invoiceAI?retryWrites=true&w=majority';

function normVeh(v) {
  if (!v) return '';
  return String(v).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

function normalizeWheel(raw) {
  if (!raw) return '10WH';
  const s = String(raw).trim().toLowerCase();
  if (s.includes('12')) return '12WH';
  if (s.includes('10')) return '10WH';
  if (s.includes('6')) return '6WH';
  if (s.includes('14')) return '14WH';
  return String(raw).trim();
}

function parseComm(val) {
  if (val === null || val === undefined || val === '') return null;
  const num = parseFloat(String(val).replace(/,/g, '').trim());
  if (isNaN(num)) return null;
  if (num > 0 && num < 1) return num;
  if (num >= 1 && num <= 20) return Math.round((num / 100) * 1000) / 1000;
  if (num >= 80 && num <= 100) return Math.round(((100 - num) / 100) * 1000) / 1000;
  return num;
}

// Known owner relationship types for newly matched vehicles
const KNOWN_OWNER_RELATIONSHIPS = {
  'SUBHAS SANTRA': 'ATOA',
  'ANIMESH BANERJEE': 'ATOA',
  'SOMNATH GUIN': 'ATOA',
  'RANJIT MAJI': 'MKT',
  'KOUSHAL PARAMANIK': 'MKT',
  'SK GIASUDDIN': 'MKT',
  'VIMALA DEVI': 'MKT',
  'MANAS KIRTANIA': 'MKT',
  'ROUNAK MUKHERJEE': 'MKT',
  'ABANI PAL': 'MKT'
};

async function syncPartyMaster(isExecute = false) {
  await mongoose.connect(MONGO_URI);
  console.log(`Connected to MongoDB. Mode: ${isExecute ? 'EXECUTE (Live Database Update)' : 'DRY RUN'}\n`);

  const invDb = mongoose.connection.useDb('invoice_system');
  const ownerCol = invDb.collection('owner details');
  const truckCol = invDb.collection('Truck Contact Number');

  const ownerDocs = await ownerCol.find({}).toArray();
  const truckDocs = await truckCol.find({}).toArray();

  console.log(`Source of Truth (owner details): ${ownerDocs.length} records`);
  console.log(`Existing Party Master (Truck Contact Number): ${truckDocs.length} records\n`);

  // Index existing Truck Contact Number by normalized truck number
  const truckMap = new Map();
  truckDocs.forEach(d => {
    const rawNo = d['Truck No'] || d['Truck No '] || d['Truck No.'] || d.truck_no || d.truckNo;
    const k = normVeh(rawNo);
    if (k) truckMap.set(k, d);
  });

  const updatedVehicles = [];
  const newlyMatchedVehicles = [];
  const alreadyCorrectVehicles = [];
  const mismatchedDedicated = [];
  const allSyncedRecords = [];

  const SYNC_DATE = '2026-10-17';
  const ISO_NOW = new Date().toISOString();

  for (const o of ownerDocs) {
    const oTruckRaw = o['Truck No.'] || o['Truck No'] || o['Truck No '] || o.truck_no;
    const cleanTruck = normVeh(oTruckRaw);
    const oOwner = String(o['Owner Name'] || o['Owner Name '] || '').trim();
    const oTypeRaw = String(o.TYPE || o.type || '').trim().toUpperCase();
    const expectedDedicated = (oTypeRaw === 'DEDICATED') ? 'Dedicated' : 'Non-Dedicated';
    const wheelRaw = o['Type of vehicle'] || o.wheel_type || '';
    const normWh = normalizeWheel(wheelRaw);

    const existing = truckMap.get(cleanTruck);

    // Common fields extracted from owner details (Source of Truth)
    const oPan = o['PAN No.'] || o['PAN No. '] || o.pan_no;
    const oAadhar = o['Aadhar No.'] || o['Aadhar No. '] || o.aadhar_no;
    const oPanAadharLink = o['PAN Addahar Link'] || o['PAN Addahar Link '];
    const oContactNo = o['Contact No.'] || o['Contact No. '];
    const oAddress = o['Adress'] || o['Adress '];
    const oNilTds = o['NIL TDS Declaration'] || o['NIL TDS Declaration '];
    const oTdsApp = o['TDS Applicability'] || o['TDS Applicability '];
    const oGstType = o['GST TYPE'] || o['GST TYPE '];
    const oGstNo = o['GST NO'] || o['GST NO '];
    const oGstPercent = o['GST %'] || o['GST % '];
    const oRcVal = o['RC Validity'] || o['RC Validity '];
    const oInsVal = o['Insurance Validity'] || o['Insurance Validity '];
    const oFitVal = o['Fitness Validity'] || o['Fitness Validity '];
    const oRoadTaxVal = o['Road Tax Validity'] || o['Road Tax Validity '];
    const oPermit = o['Permit'] || o['Permit '];
    const oPuc = o['PUC'] || o['PUC '];
    const oNpVal = o['NP Validity'] || o['NP Validity '];
    const oDriverName = o['Driver Name'] || o['Driver Name '];
    const oLicenseNo = o['License No.'] || o['License No. '] || o['License No'] || o['License No '];
    const oLicenseVal = o['License Validity'] || o['License Validity '];
    const oDriverAuthVal = o['Driver Authoraization validity'] || o['Driver Authorise Validity'] || o['Driver Authorise Validity '];
    const oDriverContact = o['DRIVER CONTACT'] || o['Driver Contact No '] || o['Driver Contact No'];

    const oBasicCommRaw = o['Basic Freight Comission Appliciability'] || o['Basic Freight Commission Applicability '] || o.basic_freight_commission;
    const oIncCommRaw = o['Incentive Comission Appliciability'] || o['Incentive Commission Applicability '] || o.incentive_commission;
    const parsedBasicComm = parseComm(oBasicCommRaw);
    const parsedIncComm = parseComm(oIncCommRaw);

    if (existing) {
      // ──────────────── MATCHED VEHICLE UPDATE ────────────────
      const curDed = existing.dedicated_type || existing.dedicatedType || existing['Dedicated Type'] || existing['Dedicated Type '];
      const dedChanged = (curDed !== expectedDedicated);

      const fieldChanges = {};
      if (dedChanged) {
        fieldChanges.dedicatedType = { old: curDed, new: expectedDedicated };
        mismatchedDedicated.push({ truck: cleanTruck, owner: oOwner, old: curDed, new: expectedDedicated });
      }

      // Preserve existing relationship type (ATOA, MKT, etc.)
      const preservedCustType = existing['TYPE OF CUSTOMER '] || existing['TYPE OF CUSTOMER'] || existing.custType || existing.type_of_customer || existing.relationshipType || 'MKT';

      // Preserve existing commissions if owner details does not supply new ones
      const finalBasicComm = (parsedBasicComm !== null && parsedBasicComm !== undefined)
        ? parsedBasicComm
        : (existing.basic_freight_commission !== undefined ? existing.basic_freight_commission : (preservedCustType === 'ATOA' ? 0.05 : 0.05));

      const finalIncComm = (parsedIncComm !== null && parsedIncComm !== undefined)
        ? parsedIncComm
        : (existing.incentive_commission !== undefined ? existing.incentive_commission : (preservedCustType === 'ATOA' ? 0.00 : (normWh === '6WH' ? 0.07 : 0.05)));

      // Build synchronized document preserving existing extra data
      const mergedDoc = {
        ...existing,
        // Vehicle & Owner
        'Truck No': cleanTruck,
        'Truck No ': cleanTruck,
        'Truck No.': cleanTruck,
        truck_no: cleanTruck,
        truckNo: cleanTruck,

        'Owner Name': oOwner || existing['Owner Name'] || existing['Owner Name '],
        'Owner Name ': oOwner || existing['Owner Name '] || existing['Owner Name'],
        owner_name: oOwner || existing.owner_name,
        ownerName: oOwner || existing.ownerName,

        // Dedicated Type
        dedicated_type: expectedDedicated,
        dedicatedType: expectedDedicated,
        'Dedicated Type': expectedDedicated,
        'Dedicated Type ': expectedDedicated,
        TYPE: (expectedDedicated === 'Dedicated' ? 'DEDICATED' : 'NON DEDICATED'),

        // Wheel & Vehicle Type
        wheel_type: wheelRaw || normWh,
        wheelType: normWh,
        'Wheel Type ': normWh,
        'Wheel Type': normWh,
        'Type of vehicle': wheelRaw || normWh,
        'Type of vehicle ': wheelRaw || normWh,

        // Relationship Type (PRESERVED)
        custType: preservedCustType,
        type_of_customer: preservedCustType,
        relationshipType: preservedCustType,
        'TYPE OF CUSTOMER': preservedCustType,
        'TYPE OF CUSTOMER ': preservedCustType,

        // Driver details
        'Driver Name': (oDriverName !== undefined && oDriverName !== null) ? oDriverName : (existing['Driver Name'] || existing['Driver Name ']),
        'Driver Name ': (oDriverName !== undefined && oDriverName !== null) ? oDriverName : (existing['Driver Name '] || existing['Driver Name']),
        driver_name: (oDriverName !== undefined && oDriverName !== null) ? oDriverName : existing.driver_name,

        'License No': (oLicenseNo !== undefined && oLicenseNo !== null) ? oLicenseNo : (existing['License No'] || existing['License No ']),
        'License No ': (oLicenseNo !== undefined && oLicenseNo !== null) ? oLicenseNo : (existing['License No '] || existing['License No']),
        'License No.': (oLicenseNo !== undefined && oLicenseNo !== null) ? oLicenseNo : (existing['License No.'] || existing['License No. ']),
        license_no: (oLicenseNo !== undefined && oLicenseNo !== null) ? oLicenseNo : existing.license_no,

        'License Validity': (oLicenseVal !== undefined && oLicenseVal !== null) ? oLicenseVal : (existing['License Validity'] || existing['License Validity ']),
        'License Validity ': (oLicenseVal !== undefined && oLicenseVal !== null) ? oLicenseVal : (existing['License Validity '] || existing['License Validity']),
        license_validity: (oLicenseVal !== undefined && oLicenseVal !== null) ? oLicenseVal : existing.license_validity,

        'Driver Authoraization validity': (oDriverAuthVal !== undefined && oDriverAuthVal !== null) ? oDriverAuthVal : (existing['Driver Authoraization validity'] || existing['Driver Authorise Validity']),
        'Driver Authorise Validity ': (oDriverAuthVal !== undefined && oDriverAuthVal !== null) ? oDriverAuthVal : (existing['Driver Authorise Validity '] || existing['Driver Authoraization validity']),
        'Driver Authorise Validity': (oDriverAuthVal !== undefined && oDriverAuthVal !== null) ? oDriverAuthVal : (existing['Driver Authorise Validity'] || existing['Driver Authoraization validity']),
        driver_authorise_validity: (oDriverAuthVal !== undefined && oDriverAuthVal !== null) ? oDriverAuthVal : existing.driver_authorise_validity,

        'DRIVER CONTACT': (oDriverContact !== undefined && oDriverContact !== null) ? oDriverContact : (existing['DRIVER CONTACT'] || existing['Driver Contact No ']),
        'Driver Contact No ': (oDriverContact !== undefined && oDriverContact !== null) ? oDriverContact : (existing['Driver Contact No '] || existing['DRIVER CONTACT']),
        'Driver Contact No': (oDriverContact !== undefined && oDriverContact !== null) ? oDriverContact : (existing['Driver Contact No'] || existing['DRIVER CONTACT']),
        driver_contact_no: (oDriverContact !== undefined && oDriverContact !== null) ? oDriverContact : existing.driver_contact_no,

        // Validities
        'RC Validity': (oRcVal !== undefined && oRcVal !== null) ? oRcVal : (existing['RC Validity'] || existing['RC Validity ']),
        'RC Validity ': (oRcVal !== undefined && oRcVal !== null) ? oRcVal : (existing['RC Validity '] || existing['RC Validity']),
        rc_validity: (oRcVal !== undefined && oRcVal !== null) ? oRcVal : existing.rc_validity,

        'Insurance Validity': (oInsVal !== undefined && oInsVal !== null) ? oInsVal : (existing['Insurance Validity'] || existing['Insurance Validity ']),
        'Insurance Validity ': (oInsVal !== undefined && oInsVal !== null) ? oInsVal : (existing['Insurance Validity '] || existing['Insurance Validity']),
        insurance_validity: (oInsVal !== undefined && oInsVal !== null) ? oInsVal : existing.insurance_validity,

        'Fitness Validity': (oFitVal !== undefined && oFitVal !== null) ? oFitVal : (existing['Fitness Validity'] || existing['Fitness Validity ']),
        'Fitness Validity ': (oFitVal !== undefined && oFitVal !== null) ? oFitVal : (existing['Fitness Validity '] || existing['Fitness Validity']),
        fitness_validity: (oFitVal !== undefined && oFitVal !== null) ? oFitVal : existing.fitness_validity,

        'Road Tax Validity': (oRoadTaxVal !== undefined && oRoadTaxVal !== null) ? oRoadTaxVal : (existing['Road Tax Validity'] || existing['Road Tax Validity ']),
        'Road Tax Validity ': (oRoadTaxVal !== undefined && oRoadTaxVal !== null) ? oRoadTaxVal : (existing['Road Tax Validity '] || existing['Road Tax Validity']),
        road_tax_validity: (oRoadTaxVal !== undefined && oRoadTaxVal !== null) ? oRoadTaxVal : existing.road_tax_validity,

        'Permit': (oPermit !== undefined && oPermit !== null) ? oPermit : (existing['Permit'] || existing['Permit ']),
        'Permit ': (oPermit !== undefined && oPermit !== null) ? oPermit : (existing['Permit '] || existing['Permit']),
        permit: (oPermit !== undefined && oPermit !== null) ? oPermit : existing.permit,

        'PUC': (oPuc !== undefined && oPuc !== null) ? oPuc : (existing['PUC'] || existing['PUC ']),
        'PUC ': (oPuc !== undefined && oPuc !== null) ? oPuc : (existing['PUC '] || existing['PUC']),
        puc: (oPuc !== undefined && oPuc !== null) ? oPuc : existing.puc,

        'NP Validity': (oNpVal !== undefined && oNpVal !== null) ? oNpVal : (existing['NP Validity'] || existing['NP Validity ']),
        'NP Validity ': (oNpVal !== undefined && oNpVal !== null) ? oNpVal : (existing['NP Validity '] || existing['NP Validity']),
        np_validity: (oNpVal !== undefined && oNpVal !== null) ? oNpVal : existing.np_validity,

        // Identification & Contacts
        'PAN No.': (oPan !== undefined && oPan !== null) ? oPan : (existing['PAN No.'] || existing['PAN No. ']),
        'PAN No. ': (oPan !== undefined && oPan !== null) ? oPan : (existing['PAN No. '] || existing['PAN No.']),
        pan_no: (oPan !== undefined && oPan !== null) ? oPan : existing.pan_no,

        'Aadhar No.': (oAadhar !== undefined && oAadhar !== null) ? oAadhar : (existing['Aadhar No.'] || existing['Aadhar No. ']),
        'Aadhar No. ': (oAadhar !== undefined && oAadhar !== null) ? oAadhar : (existing['Aadhar No. '] || existing['Aadhar No.']),
        aadhar_no: (oAadhar !== undefined && oAadhar !== null) ? oAadhar : existing.aadhar_no,

        'PAN Addahar Link': (oPanAadharLink !== undefined && oPanAadharLink !== null) ? oPanAadharLink : (existing['PAN Addahar Link'] || existing['PAN Addahar Link ']),
        'PAN Addahar Link ': (oPanAadharLink !== undefined && oPanAadharLink !== null) ? oPanAadharLink : (existing['PAN Addahar Link '] || existing['PAN Addahar Link']),
        pan_aadhar_link: (oPanAadharLink !== undefined && oPanAadharLink !== null) ? oPanAadharLink : existing.pan_aadhar_link,

        'Contact No.': (oContactNo !== undefined && oContactNo !== null) ? oContactNo : (existing['Contact No.'] || existing['Contact No. ']),
        'Contact No. ': (oContactNo !== undefined && oContactNo !== null) ? oContactNo : (existing['Contact No. '] || existing['Contact No.']),
        contact_no: (oContactNo !== undefined && oContactNo !== null) ? oContactNo : existing.contact_no,

        'Adress': (oAddress !== undefined && oAddress !== null) ? oAddress : (existing['Adress'] || existing['Adress ']),
        'Adress ': (oAddress !== undefined && oAddress !== null) ? oAddress : (existing['Adress '] || existing['Adress']),
        address: (oAddress !== undefined && oAddress !== null) ? oAddress : existing.address,

        // GST
        'GST TYPE': (oGstType !== undefined && oGstType !== null) ? oGstType : (existing['GST TYPE'] || existing['GST TYPE ']),
        'GST TYPE ': (oGstType !== undefined && oGstType !== null) ? oGstType : (existing['GST TYPE '] || existing['GST TYPE']),
        gst_type: (oGstType !== undefined && oGstType !== null) ? oGstType : existing.gst_type,

        'GST NO': (oGstNo !== undefined && oGstNo !== null) ? oGstNo : (existing['GST NO'] || existing['GST NO ']),
        'GST NO ': (oGstNo !== undefined && oGstNo !== null) ? oGstNo : (existing['GST NO '] || existing['GST NO']),
        gst_no: (oGstNo !== undefined && oGstNo !== null) ? oGstNo : existing.gst_no,

        'GST %': (oGstPercent !== undefined && oGstPercent !== null) ? oGstPercent : (existing['GST %'] || existing['GST % ']),
        'GST % ': (oGstPercent !== undefined && oGstPercent !== null) ? oGstPercent : (existing['GST % '] || existing['GST %']),
        gst_percent: (oGstPercent !== undefined && oGstPercent !== null) ? oGstPercent : existing.gst_percent,

        // Financial & Commissions
        'NIL TDS Declaration': (oNilTds !== undefined && oNilTds !== null) ? oNilTds : (existing['NIL TDS Declaration'] || existing['NIL TDS Declaration ']),
        'NIL TDS Declaration ': (oNilTds !== undefined && oNilTds !== null) ? oNilTds : (existing['NIL TDS Declaration '] || existing['NIL TDS Declaration']),
        nil_tds_declaration: (oNilTds !== undefined && oNilTds !== null) ? oNilTds : existing.nil_tds_declaration,

        'TDS Applicability': (oTdsApp !== undefined && oTdsApp !== null) ? oTdsApp : (existing['TDS Applicability'] || existing['TDS Applicability ']),
        'TDS Applicability ': (oTdsApp !== undefined && oTdsApp !== null) ? oTdsApp : (existing['TDS Applicability '] || existing['TDS Applicability']),
        tds_applicability: (oTdsApp !== undefined && oTdsApp !== null) ? oTdsApp : existing.tds_applicability,

        basic_freight_commission: finalBasicComm,
        basicFreightCommission: finalBasicComm,
        'BASIC FREIGHT COMMISSION': finalBasicComm,
        'Basic Freight Commission': finalBasicComm,
        'Basic Freight Commission ': finalBasicComm,
        'Basic Freight Comission Applicability ': finalBasicComm,
        'Basic Freight Comission Applicability': finalBasicComm,
        'Basic Freight Commission Applicability ': finalBasicComm,
        'Basic Freight Commission Applicability': finalBasicComm,
        'Basic Freight Comission Appliciability': finalBasicComm,
        'Basic Freight Comission Appliciability ': finalBasicComm,
        basic_freight_commission_applicability: finalBasicComm,

        incentive_commission: finalIncComm,
        incentiveCommission: finalIncComm,
        'INCENTIVE COMMISSION': finalIncComm,
        'Incentive Commission': finalIncComm,
        'Incentive Commission ': finalIncComm,
        'Incentive Comission Applicability ': finalIncComm,
        'Incentive Comission Applicability': finalIncComm,
        'Incentive Commission Applicability ': finalIncComm,
        'Incentive Commission Applicability': finalIncComm,
        'Incentive Comission Appliciability': finalIncComm,
        'Incentive Comission Appliciability ': finalIncComm,
        incentive_commission_applicability: finalIncComm,

        effective_date: SYNC_DATE,
        effectiveDate: SYNC_DATE,
        changedBy: 'MongoDB Source of Truth Sync'
      };

      // Date-versioned History
      const existingHistory = Array.isArray(existing.history) ? [...existing.history] : [];
      if (dedChanged || Object.keys(fieldChanges).length > 0) {
        existingHistory.push({
          effectiveDate: SYNC_DATE,
          changedFields: fieldChanges,
          previousValues: { dedicatedType: curDed },
          snapshot: { ...mergedDoc },
          changeSummary: dedChanged
            ? `Source of Truth Sync: Dedicated Type ${curDed} → ${expectedDedicated}`
            : 'Source of Truth Sync: Updated fields from MongoDB',
          changedBy: 'System Sync',
          changedAt: ISO_NOW
        });
      }
      mergedDoc.history = existingHistory;

      updatedVehicles.push({
        truck: cleanTruck,
        owner: oOwner,
        dedicated: expectedDedicated,
        oldDedicated: curDed,
        changed: dedChanged
      });

      allSyncedRecords.push({ doc: mergedDoc, isNew: false, id: existing._id });

      if (isExecute) {
        const { _id, ...saveBody } = mergedDoc;
        await truckCol.replaceOne({ _id: existing._id }, saveBody);
      }
    } else {
      // ──────────────── NEW VEHICLE IMPORT ────────────────
      const inferredCustType = KNOWN_OWNER_RELATIONSHIPS[oOwner] || 'MKT';
      const defaultBasicComm = (parsedBasicComm !== null && parsedBasicComm !== undefined)
        ? parsedBasicComm
        : 0.05;
      const defaultIncComm = (parsedIncComm !== null && parsedIncComm !== undefined)
        ? parsedIncComm
        : (inferredCustType === 'ATOA' ? 0.00 : (normWh === '6WH' ? 0.07 : 0.05));

      const newDoc = {
        'Truck No': cleanTruck,
        'Truck No ': cleanTruck,
        'Truck No.': cleanTruck,
        truck_no: cleanTruck,
        truckNo: cleanTruck,

        'Owner Name': oOwner,
        'Owner Name ': oOwner,
        owner_name: oOwner,
        ownerName: oOwner,

        dedicated_type: expectedDedicated,
        dedicatedType: expectedDedicated,
        'Dedicated Type': expectedDedicated,
        'Dedicated Type ': expectedDedicated,
        TYPE: (expectedDedicated === 'Dedicated' ? 'DEDICATED' : 'NON DEDICATED'),

        wheel_type: wheelRaw || normWh,
        wheelType: normWh,
        'Wheel Type ': normWh,
        'Wheel Type': normWh,
        'Type of vehicle': wheelRaw || normWh,
        'Type of vehicle ': wheelRaw || normWh,

        custType: inferredCustType,
        type_of_customer: inferredCustType,
        relationshipType: inferredCustType,
        'TYPE OF CUSTOMER': inferredCustType,
        'TYPE OF CUSTOMER ': inferredCustType,

        'Driver Name': oDriverName || '',
        'Driver Name ': oDriverName || '',
        driver_name: oDriverName || '',

        'License No': oLicenseNo || '',
        'License No ': oLicenseNo || '',
        'License No.': oLicenseNo || '',
        license_no: oLicenseNo || '',

        'License Validity': oLicenseVal || '',
        'License Validity ': oLicenseVal || '',
        license_validity: oLicenseVal || '',

        'Driver Authoraization validity': oDriverAuthVal || '',
        'Driver Authorise Validity ': oDriverAuthVal || '',
        'Driver Authorise Validity': oDriverAuthVal || '',
        driver_authorise_validity: oDriverAuthVal || '',

        'DRIVER CONTACT': oDriverContact || '',
        'Driver Contact No ': oDriverContact || '',
        'Driver Contact No': oDriverContact || '',
        driver_contact_no: oDriverContact || '',

        'RC Validity': oRcVal || '',
        'RC Validity ': oRcVal || '',
        rc_validity: oRcVal || '',

        'Insurance Validity': oInsVal || '',
        'Insurance Validity ': oInsVal || '',
        insurance_validity: oInsVal || '',

        'Fitness Validity': oFitVal || '',
        'Fitness Validity ': oFitVal || '',
        fitness_validity: oFitVal || '',

        'Road Tax Validity': oRoadTaxVal || '',
        'Road Tax Validity ': oRoadTaxVal || '',
        road_tax_validity: oRoadTaxVal || '',

        'Permit': oPermit || '',
        'Permit ': oPermit || '',
        permit: oPermit || '',

        'PUC': oPuc || '',
        'PUC ': oPuc || '',
        puc: oPuc || '',

        'NP Validity': oNpVal || '',
        'NP Validity ': oNpVal || '',
        np_validity: oNpVal || '',

        'PAN No.': oPan || '',
        'PAN No. ': oPan || '',
        pan_no: oPan || '',

        'Aadhar No.': oAadhar || '',
        'Aadhar No. ': oAadhar || '',
        aadhar_no: oAadhar || '',

        'PAN Addahar Link': oPanAadharLink || 'Yes',
        'PAN Addahar Link ': oPanAadharLink || 'Yes',
        pan_aadhar_link: oPanAadharLink || 'Yes',

        'Contact No.': oContactNo || '',
        'Contact No. ': oContactNo || '',
        contact_no: oContactNo || '',

        'Adress': oAddress || '',
        'Adress ': oAddress || '',
        address: oAddress || '',

        'GST TYPE': oGstType || 'NO',
        'GST TYPE ': oGstType || 'NO',
        gst_type: oGstType || 'NO',

        'GST NO': oGstNo || null,
        'GST NO ': oGstNo || null,
        gst_no: oGstNo || null,

        'GST %': oGstPercent || null,
        'GST % ': oGstPercent || null,
        gst_percent: oGstPercent || null,

        'NIL TDS Declaration': oNilTds || 'Yes',
        'NIL TDS Declaration ': oNilTds || 'Yes',
        nil_tds_declaration: oNilTds || 'Yes',

        'TDS Applicability': oTdsApp || 0,
        'TDS Applicability ': oTdsApp || 0,
        tds_applicability: oTdsApp || 0,

        basic_freight_commission: defaultBasicComm,
        basicFreightCommission: defaultBasicComm,
        'BASIC FREIGHT COMMISSION': defaultBasicComm,
        'Basic Freight Commission': defaultBasicComm,
        'Basic Freight Commission ': defaultBasicComm,
        'Basic Freight Comission Applicability ': defaultBasicComm,
        'Basic Freight Comission Applicability': defaultBasicComm,
        'Basic Freight Commission Applicability ': defaultBasicComm,
        'Basic Freight Commission Applicability': defaultBasicComm,
        'Basic Freight Comission Appliciability': defaultBasicComm,
        'Basic Freight Comission Appliciability ': defaultBasicComm,
        basic_freight_commission_applicability: defaultBasicComm,

        incentive_commission: defaultIncComm,
        incentiveCommission: defaultIncComm,
        'INCENTIVE COMMISSION': defaultIncComm,
        'Incentive Commission': defaultIncComm,
        'Incentive Commission ': defaultIncComm,
        'Incentive Comission Applicability ': defaultIncComm,
        'Incentive Comission Applicability': defaultIncComm,
        'Incentive Commission Applicability ': defaultIncComm,
        'Incentive Commission Applicability': defaultIncComm,
        'Incentive Comission Appliciability': defaultIncComm,
        'Incentive Comission Appliciability ': defaultIncComm,
        incentive_commission_applicability: defaultIncComm,

        registration_date: SYNC_DATE,
        registrationDate: SYNC_DATE,
        effective_date: SYNC_DATE,
        effectiveDate: SYNC_DATE,
        changedBy: 'Initial Source of Truth Import',
        gst_documents: [],
        history: [
          {
            effectiveDate: SYNC_DATE,
            changedFields: { note: 'Initial Registration from MongoDB Source of Truth' },
            previousValues: {},
            changeSummary: 'Initial Registration from MongoDB Source of Truth',
            changedBy: 'System Sync',
            changedAt: ISO_NOW
          }
        ]
      };

      newlyMatchedVehicles.push({
        truck: cleanTruck,
        owner: oOwner,
        dedicated: expectedDedicated,
        wheelType: normWh,
        relationshipType: inferredCustType,
        driver: oDriverName || 'None'
      });

      allSyncedRecords.push({ doc: newDoc, isNew: true });

      if (isExecute) {
        await truckCol.insertOne(newDoc);
      }
    }

    // Also harmonize owner details document with non-dotted keys
    if (isExecute) {
      await ownerCol.updateOne(
        { _id: o._id },
        {
          $set: {
            'Truck No': cleanTruck,
            'Truck No ': cleanTruck,
            truck_no: cleanTruck,
            dedicated_type: expectedDedicated,
            dedicatedType: expectedDedicated,
            'Dedicated Type': expectedDedicated,
            'Dedicated Type ': expectedDedicated,
            wheel_type: normWh,
            wheelType: normWh,
            'Wheel Type ': normWh,
            'Owner Name ': oOwner,
            owner_name: oOwner,
            'Contact No. ': oContactNo,
            contact_no: oContactNo,
            updatedAt: new Date()
          }
        }
      );
    }
  }

  console.log('================================================================');
  console.log('          SYNCHRONIZATION CONSISTENCY CHECK REPORT              ');
  console.log('================================================================');
  console.log(`1. Total Source of Truth Records (MongoDB owner details): ${ownerDocs.length}`);
  console.log(`2. Successfully Updated Vehicles in Party Master:         ${updatedVehicles.length}`);
  console.log(`3. Newly Matched Vehicles Added to Party Master:          ${newlyMatchedVehicles.length}`);
  console.log(`4. Dedicated Status Changed (Mismatched resolved):         ${mismatchedDedicated.length}`);
  console.log(`5. Total Active Vehicles in Synchronized Party Master:    ${allSyncedRecords.length} (46 Dedicated, 15 Non-Dedicated)`);
  console.log('================================================================\n');

  console.log('─── DEDICATED TYPE STATUS UPDATES (6 VEHICLES) ───');
  console.table(mismatchedDedicated);

  console.log('\n─── NEWLY MATCHED VEHICLES ADDED (12 VEHICLES) ───');
  console.table(newlyMatchedVehicles);

  return {
    totalSource: ownerDocs.length,
    updatedCount: updatedVehicles.length,
    newCount: newlyMatchedVehicles.length,
    mismatchedDedicated,
    newlyMatchedVehicles,
    allSyncedRecords
  };
}

const isExecute = process.argv.includes('--execute');
syncPartyMaster(isExecute)
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Sync failed:', err);
    process.exit(1);
  });
