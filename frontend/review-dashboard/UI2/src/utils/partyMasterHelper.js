// ─── Centralized Frontend Party Master Date-Versioned / Effective-Date Helper ───

/**
 * Normalizes any date string or Date object into a clean 'YYYY-MM-DD' string.
 * Strictly date-only, immune to timezone / UTC off-by-one shifts.
 */
export function normalizeDate(val) {
  if (!val || val === '-' || val === 'null' || val === 'undefined') return null;
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const str = String(val).trim();
  if (!str) return null;

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  // DD.MM.YYYY or DD/MM/YYYY or DD-MM-YYYY or DD.MM.YY etc.
  let m = str.match(/^(\d{1,2})[\.\/\-](\d{1,2})[\.\/\-](\d{2,4})$/);
  if (m) {
    const day = m[1].padStart(2, '0');
    const month = m[2].padStart(2, '0');
    let year = m[3];
    if (year.length === 2) {
      const yNum = parseInt(year, 10);
      year = yNum >= 70 ? `19${year}` : `20${year}`;
    }
    return `${year}-${month}-${day}`;
  }

  // YYYY/MM/DD or YYYY.MM.DD
  m = str.match(/^(\d{4})[\.\/\-](\d{1,2})[\.\/\-](\d{1,2})$/);
  if (m) {
    const year = m[1];
    const month = m[2].padStart(2, '0');
    const day = m[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // DD-Mon-YYYY (e.g. 04-Oct-2026, 4-Oct-2026)
  const monMatch = str.match(/^(\d{1,2})[-/\. ]([a-zA-Z]{3,})[-/\. ](\d{2,4})$/);
  if (monMatch) {
    const day = monMatch[1].padStart(2, '0');
    const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const monthIdx = monthNames.indexOf(monMatch[2].toLowerCase().slice(0, 3));
    let year = parseInt(monMatch[3], 10);
    if (year < 100) year += 2000;
    if (monthIdx >= 0) {
      const month = String(monthIdx + 1).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  }

  // ISO string with T
  if (str.includes('T')) {
    const parts = str.split('T')[0].split('-');
    if (parts.length === 3) {
      return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    }
  }

  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const mo = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${mo}-${d}`;
  }

  return null;
}

export function formatDateToDDMMYYYY(val) {
  const norm = normalizeDate(val);
  if (!norm) return '';
  const [y, m, d] = norm.split('-');
  return `${d}.${m}.${y}`;
}

/**
 * Parses basic freight commission decimal from document or string (e.g. 0.05, 0.04, 0.03, 0.06, 0)
 * Authoritative: Party Master BASIC FREIGHT COMMISSION
 * Formula: Party Rate % = (1 - BASIC FREIGHT COMMISSION) * 100
 */
export function parseBasicFreightCommission(doc) {
  if (doc === null || doc === undefined) return null;
  const raw = (typeof doc === "object") ? (
    doc.basic_freight_commission ??
    doc.basicFreightCommission ??
    doc["BASIC FREIGHT COMMISSION"] ??
    doc["Basic Freight Commission"] ??
    doc["Basic Freight Commission "] ??
    doc["Basic Freight Comission Applicability "] ??
    doc["Basic Freight Comission Applicability"] ??
    doc["Basic Freight Commission Applicability "] ??
    doc["Basic Freight Commission Applicability"] ??
    doc["Basic Freight Comission Appliciability"] ??
    doc["Basic Freight Comission Appliciability "] ??
    doc["basic_freight_commission_applicability"] ??
    doc["basic_freight_commission "] ??
    doc["basicFreightComm"]
  ) : doc;

  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw === "number") {
    if (isNaN(raw)) return null;
    if (raw === 0) return 0;
    if (raw > 0 && raw < 1) return raw; // e.g. 0.03, 0.04, 0.05, 0.06, 0.07
    if (raw >= 1 && raw <= 20) return Math.round((raw / 100) * 1000) / 1000; // e.g. 3..7 -> 0.03..0.07
    if (raw >= 80 && raw <= 100) return Math.round(((100 - raw) / 100) * 1000) / 1000; // e.g. 95 -> 0.05, 94 -> 0.06
    return raw;
  }

  const str = String(raw).trim();
  if (str === "" || str === "-" || str === "—" || str === "N/A" || str === "NA") return null;

  const pctMatch = str.match(/(\d+(\.\d+)?)%/);
  if (pctMatch) {
    const p = parseFloat(pctMatch[1]);
    if (p === 0) return 0;
    if (p >= 80 && p <= 100) return Math.round(((100 - p) / 100) * 1000) / 1000;
    if (p >= 1 && p <= 20) return Math.round((p / 100) * 1000) / 1000;
    if (p > 0 && p < 1) return p;
    return p;
  }

  const val = parseFloat(str.replace(/,/g, ""));
  if (isNaN(val)) return null;
  if (val === 0) return 0;
  if (val > 0 && val < 1) return val;
  if (val >= 1 && val <= 20) return Math.round((val / 100) * 1000) / 1000;
  if (val >= 80 && val <= 100) return Math.round(((100 - val) / 100) * 1000) / 1000;
  return val;
}

/**
 * Parses incentive commission decimal from document or string (e.g. 0.00, 0.05, 0)
 * Authoritative: Party Master INCENTIVE COMMISSION
 * Stored as commission decimal rate (0.00 = 0% commission deduction, 100% retained by party)
 */
export function parseIncentiveCommission(doc) {
  if (doc === null || doc === undefined) return null;
  const raw = (typeof doc === "object") ? (
    doc.incentiveCommission ??
    doc.incentive_commission ??
    doc["INCENTIVE COMMISSION"] ??
    doc["Incentive Commission"] ??
    doc["Incentive Commission "] ??
    doc["Incentive Comission Applicability "] ??
    doc["Incentive Comission Applicability"] ??
    doc["Incentive Commission Applicability "] ??
    doc["Incentive Commission Applicability"] ??
    doc["Incentive Comission Appliciability"] ??
    doc["Incentive Comission Appliciability "] ??
    doc["incentive_commission_applicability"] ??
    doc["incentive_commission "] ??
    doc.incentiveCommVal ??
    doc.incentiveComm
  ) : doc;

  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw === "number") {
    if (isNaN(raw)) return null;
    if (raw === 0) return 0;
    if (raw > 0 && raw < 1) return raw; // e.g. 0.05
    if (raw >= 1 && raw <= 20) return Math.round((raw / 100) * 1000) / 1000; // e.g. 5 -> 0.05
    if (raw >= 80 && raw <= 100) return Math.round(((100 - raw) / 100) * 1000) / 1000; // e.g. 100 -> 0.00, 95 -> 0.05
    return raw;
  }

  const str = String(raw).trim();
  if (str === "" || str === "-" || str === "—" || str === "N/A" || str === "NA") return null;

  const pctMatch = str.match(/(\d+(\.\d+)?)%/);
  if (pctMatch) {
    const p = parseFloat(pctMatch[1]);
    if (p === 0) return 0;
    if (p >= 80 && p <= 100) return Math.round(((100 - p) / 100) * 1000) / 1000;
    if (p >= 1 && p <= 20) return Math.round((p / 100) * 1000) / 1000;
    if (p > 0 && p < 1) return p;
    return p;
  }

  const val = parseFloat(str.replace(/,/g, ""));
  if (isNaN(val)) return null;
  if (val === 0) return 0;
  if (val > 0 && val < 1) return val;
  if (val >= 1 && val <= 20) return Math.round((val / 100) * 1000) / 1000;
  if (val >= 80 && val <= 100) return Math.round(((100 - val) / 100) * 1000) / 1000;
  return val;
}

/**
 * Checks whether a given contact document or form state represents an ATOA relationship.
 */
export function isAtoaRelationship(doc) {
  if (!doc) return false;
  const raw = (typeof doc === 'object') ? (
    doc["TYPE OF CUSTOMER "] ??
    doc["TYPE OF CUSTOMER"] ??
    doc.custType ??
    doc.type_of_customer ??
    doc.relationshipType ??
    doc.type ??
    doc.RelationshipType ??
    doc["Relationship Type"] ??
    doc["Relationship Type "]
  ) : doc;
  if (raw === undefined || raw === null) return false;
  const s = String(raw).trim().toUpperCase();
  return s === "ATOA" || s === "ATO";
}

/**
 * Normalizes wheel type labels into standard format: '6WH', '10WH', '12WH', '14WH'
 */
export function normalizeWheelType(val) {
  if (!val) return '';
  const str = String(val).trim().toUpperCase();
  if (str.includes('6')) return '6WH';
  if (str.includes('10')) return '10WH';
  if (str.includes('12')) return '12WH';
  if (str.includes('14')) return '14WH';
  return str;
}

export function is6Wheel(val) {
  return normalizeWheelType(val) === '6WH';
}

export function is10or12or14Wheel(val) {
  const norm = normalizeWheelType(val);
  return norm === '10WH' || norm === '12WH' || norm === '14WH';
}

/**
 * Checks whether a given contact document or form state represents an MKT relationship.
 */
export function isMktRelationship(doc) {
  if (!doc) return false;
  const raw = (typeof doc === 'object') ? (
    doc["TYPE OF CUSTOMER "] ??
    doc["TYPE OF CUSTOMER"] ??
    doc.custType ??
    doc.type_of_customer ??
    doc.relationshipType ??
    doc.type ??
    doc.RelationshipType ??
    doc["Relationship Type"] ??
    doc["Relationship Type "]
  ) : doc;
  if (raw === undefined || raw === null) return false;
  const s = String(raw).trim().toUpperCase();
  return s === 'MKT' || s.startsWith('MKT');
}

/**
 * Resolves the effective Party Master snapshot for a given contact document on a specific recordDate.
 *
 * Rule:
 * VALUE USED FOR A RECORD DATE D = the latest Party Master version whose effectiveDate <= D
 *
 * If recordDate < registrationDate (and no earlier version exists), this profile was not active on that date -> returns null.
 */
export function getEffectivePartyMaster(contact, recordDate = null) {
  if (!contact) return null;

  const targetDate = recordDate ? normalizeDate(recordDate) : null;
  const history = Array.isArray(contact.history) ? contact.history : [];

  if (history.length > 0) {
    // Sort versions ascending by effectiveDate
    const sorted = [...history]
      .filter(v => v && v.effectiveDate)
      .map(v => ({ ...v, normDate: normalizeDate(v.effectiveDate) }))
      .filter(v => !!v.normDate)
      .sort((a, b) => a.normDate.localeCompare(b.normDate));

    if (sorted.length > 0) {
      if (targetDate) {
        const applicableVersions = sorted.filter(v => v.normDate <= targetDate);
        if (applicableVersions.length === 0) {
          // Record date is before the earliest recorded version -> use earliest version or contact baseline
          const earliestVersion = sorted[0];
          const snapshot = earliestVersion.snapshot || earliestVersion;
          return {
            ...contact,
            ...snapshot,
            _id: contact._id,
            effectiveDate: earliestVersion.effectiveDate,
            isEffectiveVersion: true,
            basicFreightCommission: parseBasicFreightCommission(snapshot) ?? parseBasicFreightCommission(contact),
            incentiveCommission: parseIncentiveCommission(snapshot) ?? parseIncentiveCommission(contact),
          };
        }
        const activeVersion = applicableVersions[applicableVersions.length - 1];
        const snapshot = activeVersion.snapshot || activeVersion;
        return {
          ...contact,
          ...snapshot,
          _id: contact._id,
          effectiveDate: activeVersion.effectiveDate,
          isEffectiveVersion: true,
          basicFreightCommission: parseBasicFreightCommission(snapshot) ?? parseBasicFreightCommission(contact),
          incentiveCommission: parseIncentiveCommission(snapshot) ?? parseIncentiveCommission(contact),
        };
      } else {
        // No recordDate provided -> use the latest version overall
        const latestVersion = sorted[sorted.length - 1];
        const snapshot = latestVersion.snapshot || latestVersion;
        return {
          ...contact,
          ...snapshot,
          _id: contact._id,
          effectiveDate: latestVersion.effectiveDate,
          isEffectiveVersion: true,
          basicFreightCommission: parseBasicFreightCommission(snapshot) ?? parseBasicFreightCommission(contact),
          incentiveCommission: parseIncentiveCommission(snapshot) ?? parseIncentiveCommission(contact),
        };
      }
    }
  }

  // Legacy contact with no history array
  return {
    ...contact,
    basicFreightCommission: parseBasicFreightCommission(contact),
    incentiveCommission: parseIncentiveCommission(contact),
    isEffectiveVersion: true,
  };
}

/**
 * Finds the effective Party Master contact for a given Owner + Vehicle + Record Date.
 * Authoritative: Owner ID + Vehicle ID / Exact Vehicle No
 */
export function findContactForRecord(ownerName, vehicleNo, contactsList = [], recordDate = null, contactId = null) {
  if (!contactsList || contactsList.length === 0) return null;
  const cleanVeh = String(vehicleNo || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const cleanOwner = String(ownerName || '').trim().toLowerCase();
  const targetId = contactId ? String(contactId) : null;

  let matched = null;

  // 1. Direct ID match (highest authority)
  if (targetId) {
    matched = contactsList.find(c => c && (String(c._id) === targetId || String(c.id) === targetId));
  }

  // 2. Exact Owner Name + Vehicle Number (supports full registration and 4-digit suffix)
  if (!matched && cleanOwner && cleanVeh) {
    matched = contactsList.find(c => {
      if (!c) return false;
      const cVeh = String(c["Truck No "] || c["Truck No"] || c["Truck No."] || c["Truck No. "] || c.truck_no || c.truckNo || c.vehicleNo || c["Vehicle No"] || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      const cOwner = String(c["Owner Name "] || c["Owner Name"] || c.owner_name || c.ownerName || '').trim().toLowerCase();
      const vehMatches = cVeh === cleanVeh || (cleanVeh.length >= 4 && cVeh.length >= 4 && (cVeh.endsWith(cleanVeh) || cleanVeh.endsWith(cVeh)));
      return vehMatches && (cOwner === cleanOwner || cOwner.includes(cleanOwner) || cleanOwner.includes(cOwner));
    });
  }

  // 3. Vehicle Number alone (unique vehicle registration, exact or 4-digit suffix)
  if (!matched && cleanVeh) {
    matched = contactsList.find(c => {
      if (!c) return false;
      const cVeh = String(c["Truck No "] || c["Truck No"] || c["Truck No."] || c["Truck No. "] || c.truck_no || c.truckNo || c.vehicleNo || c["Vehicle No"] || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      return cVeh === cleanVeh || (cleanVeh.length >= 4 && cVeh.length >= 4 && (cVeh.endsWith(cleanVeh) || cleanVeh.endsWith(cVeh)));
    });
  }

  // 4. Owner Name alone (fallback)
  if (!matched && cleanOwner) {
    matched = contactsList.find(c => {
      if (!c) return false;
      const cOwner = String(c["Owner Name "] || c["Owner Name"] || c.owner_name || c.ownerName || '').trim().toLowerCase();
      return cOwner === cleanOwner;
    });
  }

  if (!matched) return null;
  return getEffectivePartyMaster(matched, recordDate);
}

export function parseContactCommission(contact, recordDate = null) {
  if (!contact) return null;
  const effective = getEffectivePartyMaster(contact, recordDate);
  if (!effective) return null;
  return parseBasicFreightCommission(effective);
}
