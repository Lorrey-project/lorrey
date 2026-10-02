const ProjectedDeductionVersion = require('../models/ProjectedDeductionVersion');
const ProjectedDeductionSetting = require('../models/ProjectedDeductionSetting');

// Normalize date to YYYY-MM-DD string
function toDateStr(d) {
  if (!d) return null;
  if (typeof d === 'string') {
    const clean = d.trim();
    // Check if DD-MM-YYYY or DD/MM/YYYY
    const dmy = clean.match(/^(\d{1,2})[\-\/](\d{1,2})[\-\/](\d{4})$/);
    if (dmy) {
      const day = dmy[1].padStart(2, '0');
      const month = dmy[2].padStart(2, '0');
      const year = dmy[3];
      return `${year}-${month}-${day}`;
    }
    // Check if YYYY-MM-DD
    const ymd = clean.match(/^(\d{4})[\-\/](\d{1,2})[\-\/](\d{1,2})/);
    if (ymd) {
      const year = ymd[1];
      const month = ymd[2].padStart(2, '0');
      const day = ymd[3].padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    // Fallback: Date parse
    const dt = new Date(clean);
    if (!isNaN(dt.getTime())) {
      const year = dt.getFullYear();
      const month = String(dt.getMonth() + 1).padStart(2, '0');
      const day = String(dt.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  } else if (d instanceof Date && !isNaN(d.getTime())) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return null;
}

const SETTING_TYPE_KEYS = {
  DAMAGE_DEDUCTION: 'damage',
  GPS_DEVICE_INSTALLATION: 'gpsDeviceInstallation',
  RFID: 'rfid',
  GPS_MONITORING_TRIP_CHARGE: 'gpsTripCharge',
  TRAVELLING_EXPENSE: 'travellingExpense',
};

const KEY_TO_SETTING_TYPE = {
  damage: 'DAMAGE_DEDUCTION',
  DAMAGE_DEDUCTION: 'DAMAGE_DEDUCTION',
  gpsDeviceInstallation: 'GPS_DEVICE_INSTALLATION',
  GPS_DEVICE_INSTALLATION: 'GPS_DEVICE_INSTALLATION',
  rfid: 'RFID',
  RFID: 'RFID',
  gpsTripCharge: 'GPS_MONITORING_TRIP_CHARGE',
  GPS_MONITORING_TRIP_CHARGE: 'GPS_MONITORING_TRIP_CHARGE',
  travellingExpense: 'TRAVELLING_EXPENSE',
  TRAVELLING_EXPENSE: 'TRAVELLING_EXPENSE',
};

const DEFAULT_AMOUNTS = {
  DAMAGE_DEDUCTION: 476,
  GPS_DEVICE_INSTALLATION: 1500,
  RFID: 100,
  GPS_MONITORING_TRIP_CHARGE: 145,
  TRAVELLING_EXPENSE: 0,
};

/**
 * Resolve the applicable deduction amount for a specific setting type and record date.
 * Formula: latest version where effectiveDate <= recordDate
 */
async function getApplicableProjectedDeduction(settingTypeOrKey, recordDate) {
  const normType = KEY_TO_SETTING_TYPE[settingTypeOrKey] || settingTypeOrKey;
  const dateStr = toDateStr(recordDate) || new Date().toISOString().slice(0, 10);

  // 1. Query versions where effectiveDate <= dateStr sorted descending by effectiveDate
  const version = await ProjectedDeductionVersion.findOne({
    settingType: normType,
    effectiveDate: { $lte: dateStr }
  }).sort({ effectiveDate: -1, createdAt: -1 }).lean();

  if (version && typeof version.amount === 'number') {
    return version.amount;
  }

  // 2. Fallback to singleton setting if available
  const singleton = await ProjectedDeductionSetting.findOne().lean();
  const fieldKey = SETTING_TYPE_KEYS[normType];
  if (singleton && fieldKey && singleton[fieldKey] !== undefined) {
    return Number(singleton[fieldKey]);
  }

  return DEFAULT_AMOUNTS[normType] || 0;
}

/**
 * Resolve all 5 applicable deduction settings for a specific record date.
 */
async function getAllApplicableProjectedDeductions(recordDate) {
  const dateStr = toDateStr(recordDate) || new Date().toISOString().slice(0, 10);
  const types = Object.keys(SETTING_TYPE_KEYS);

  const results = {};
  await Promise.all(
    types.map(async (t) => {
      const val = await getApplicableProjectedDeduction(t, dateStr);
      results[SETTING_TYPE_KEYS[t]] = val;
      results[t] = val;
    })
  );
  return results;
}

module.exports = {
  getApplicableProjectedDeduction,
  getAllApplicableProjectedDeductions,
  toDateStr,
  KEY_TO_SETTING_TYPE,
  SETTING_TYPE_KEYS,
  DEFAULT_AMOUNTS
};
