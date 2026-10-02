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

  // DD.MM.YYYY or DD/MM/YYYY or DD-MM-YYYY
  let m = str.match(/^(\d{1,2})[\.\/\-](\d{1,2})[\.\/\-](\d{4})$/);
  if (m) {
    const day = m[1].padStart(2, '0');
    const month = m[2].padStart(2, '0');
    const year = m[3];
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
 * Parses basic freight commission decimal from document or string (e.g. 0.05, 0.04, 0.03, 0)
 */
export function parseBasicFreightCommission(doc) {
  if (!doc) return null;
  const raw = doc.basic_freight_commission ??
    doc.basicFreightCommission ??
    doc["Basic Freight Comission Applicability "] ??
    doc["Basic Freight Comission Applicability"] ??
    doc["Basic Freight Commission Applicability "] ??
    doc["Basic Freight Commission Applicability"] ??
    doc["basic_freight_commission_applicability"] ??
    doc["BASIC FREIGHT COMMISSION"];

  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw === "number") return isNaN(raw) ? null : raw;

  const str = String(raw).trim();
  if (str === "") return null;

  const pctMatch = str.match(/(\d+(\.\d+)?)%/);
  if (pctMatch) {
    const p = parseFloat(pctMatch[1]);
    if (p > 1) {
      if (p >= 90 && p <= 100) return Math.round((1 - (p / 100)) * 1000) / 1000;
      return Math.round((p / 100) * 1000) / 1000;
    }
    return p;
  }

  const val = parseFloat(str);
  if (isNaN(val)) return null;
  if (val > 1) {
    if (val >= 90 && val <= 100) return Math.round((1 - (val / 100)) * 1000) / 1000;
    return Math.round((val / 100) * 1000) / 1000;
  }
  return val;
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
          // Record date is strictly before the earliest effective / registration date
          return null;
        }
        const activeVersion = applicableVersions[applicableVersions.length - 1];
        const snapshot = activeVersion.snapshot || activeVersion;
        return {
          ...contact,
          ...snapshot,
          _id: contact._id,
          effectiveDate: activeVersion.effectiveDate,
          isEffectiveVersion: true,
          basicFreightCommission: parseBasicFreightCommission(snapshot),
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
          basicFreightCommission: parseBasicFreightCommission(snapshot),
        };
      }
    }
  }

  // Legacy contact with no history array
  const regDate = normalizeDate(contact.registration_date || contact.registrationDate || contact.effective_date || contact.effectiveDate);
  if (targetDate && regDate && targetDate < regDate) {
    // Vehicle was registered strictly after the recordDate
    return null;
  }

  return {
    ...contact,
    basicFreightCommission: parseBasicFreightCommission(contact),
    isEffectiveVersion: true,
  };
}

/**
 * Finds the effective Party Master contact for a given Owner + Vehicle + Record Date.
 */
export function findContactForRecord(ownerName, vehicleNo, contactsList = [], recordDate = null) {
  if (!contactsList || contactsList.length === 0) return null;
  const cleanVeh = String(vehicleNo || '').replace(/\s+/g, '').toUpperCase();
  const cleanOwner = String(ownerName || '').trim().toLowerCase();

  let matched = null;

  // 1. Exact Owner Name + Vehicle Number
  if (cleanOwner && cleanVeh) {
    matched = contactsList.find(c => {
      const cVeh = String(c["Truck No "] || c["Truck No"] || c.truck_no || '').replace(/\s+/g, '').toUpperCase();
      const cOwner = String(c["Owner Name "] || c["Owner Name"] || c.owner_name || '').trim().toLowerCase();
      return cVeh === cleanVeh && cOwner === cleanOwner;
    });
  }

  // 2. Vehicle Number alone
  if (!matched && cleanVeh) {
    matched = contactsList.find(c => {
      const cVeh = String(c["Truck No "] || c["Truck No"] || c.truck_no || '').replace(/\s+/g, '').toUpperCase();
      return cVeh === cleanVeh;
    });
  }

  // 3. Owner Name alone
  if (!matched && cleanOwner) {
    matched = contactsList.find(c => {
      const cOwner = String(c["Owner Name "] || c["Owner Name"] || c.owner_name || '').trim().toLowerCase();
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
