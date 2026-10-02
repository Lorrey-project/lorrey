// ─── Centralized Party Master Date-Versioned / Effective-Date Helper ─────────
// Authoritative resolution for Party Master / Truck Contact Number based on record date.

/**
 * Normalizes any date string or Date object into a clean 'YYYY-MM-DD' string.
 * Strictly date-only, immune to timezone / UTC off-by-one shifts.
 */
function normalizeDate(val) {
  if (!val || val === "-" || val === "null" || val === "undefined") return null;
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

/**
 * Parses basic freight commission decimal from document or string (e.g. 0.05, 0.04, 0.03, 0)
 */
function parseBasicFreightCommission(doc) {
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
function getEffectivePartyMaster(contact, recordDate = null) {
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
 * Creates or updates an effective-dated history entry on a Party Master contact document.
 */
function applyEffectiveEdit(existingContact, updatePayload, effectiveDateStr, changedBy = "System") {
  const normEffectiveDate = normalizeDate(effectiveDateStr) || normalizeDate(new Date());
  const history = Array.isArray(existingContact.history) ? [...existingContact.history] : [];

  // If no history exists, create baseline version using existing contact
  if (history.length === 0) {
    const baseDate = normalizeDate(existingContact.registration_date || existingContact.registrationDate || existingContact.effective_date || "2020-01-01");
    history.push({
      effectiveDate: baseDate,
      changedFields: { note: "Initial Baseline" },
      previousValues: {},
      snapshot: { ...existingContact },
      changeSummary: "Initial Baseline Profile",
      changedBy: "System",
      changedAt: new Date().toISOString()
    });
  }

  // Build full merged snapshot for this effective date
  const latestSnapshot = history.length > 0 ? (history[history.length - 1].snapshot || history[history.length - 1]) : existingContact;
  const newSnapshot = {
    ...latestSnapshot,
    ...updatePayload,
    effective_date: normEffectiveDate,
    effectiveDate: normEffectiveDate,
  };

  // Identify changed business fields
  const changedFields = {};
  const previousValues = {};
  const changeSummaryList = [];

  const fieldsToCheck = [
    { key: "basic_freight_commission", label: "Basic Freight Commission", altKeys: ["basicFreightCommission", "Basic Freight Comission Applicability "] },
    { key: "TYPE OF CUSTOMER ", label: "Relationship Type", altKeys: ["custType", "relationshipType", "type"] },
    { key: "dedicated_type", label: "Dedicated Type", altKeys: ["dedicatedType", "Dedicated Type"] },
    { key: "wheel_type", label: "Wheel Type", altKeys: ["wheelType", "Type of vehicle ", "Type of vehicle"] },
    { key: "TDS Applicability ", label: "TDS Applicability", altKeys: ["tdsApp", "nilTds", "nil_tds_declaration"] },
    { key: "Owner Name ", label: "Owner Name", altKeys: ["ownerName", "Owner Name"] },
    { key: "Driver Name ", label: "Driver Name", altKeys: ["driverName", "Driver Name"] },
    { key: "Contact No. ", label: "Contact No", altKeys: ["contactNo", "Contact No."] },
    { key: "RC Validity ", label: "RC Validity", altKeys: ["rcValidity", "RC Validity"] },
    { key: "Insurance Validity ", label: "Insurance Validity", altKeys: ["insuranceValidity", "Insurance Validity"] },
    { key: "Fitness Validity ", label: "Fitness Validity", altKeys: ["fitnessValidity", "Fitness Validity"] },
    { key: "Road Tax Validity ", label: "Road Tax Validity", altKeys: ["roadTaxValidity", "Road Tax Validity"] },
    { key: "Permit ", label: "Permit", altKeys: ["permit", "Permit"] },
    { key: "PUC ", label: "PUC", altKeys: ["puc", "PUC"] },
    { key: "NP Validity ", label: "NP Validity", altKeys: ["npValidity", "NP Validity"] },
    { key: "License Validity ", label: "License Validity", altKeys: ["licenseValidity", "License Validity"] },
    { key: "Driver Authorise Validity ", label: "Driver Authorise Validity", altKeys: ["driverAuthoriseValidity"] },
  ];

  fieldsToCheck.forEach(({ key, label, altKeys = [] }) => {
    const allKeys = [key, ...altKeys];
    let oldVal = undefined;
    let newVal = undefined;

    for (const k of allKeys) {
      if (latestSnapshot[k] !== undefined) { oldVal = latestSnapshot[k]; break; }
    }
    for (const k of allKeys) {
      if (updatePayload[k] !== undefined) { newVal = updatePayload[k]; break; }
    }

    if (newVal !== undefined && String(newVal).trim() !== String(oldVal ?? "").trim()) {
      changedFields[label] = newVal;
      previousValues[label] = oldVal ?? "";
      changeSummaryList.push(`${label}: ${oldVal || "(none)"} → ${newVal}`);
    }
  });

  const changeSummary = changeSummaryList.length > 0 ? changeSummaryList.join(", ") : "Profile Updated";

  // Check if an entry with the exact same effectiveDate already exists (same-date edit handling)
  const existingIdx = history.findIndex(h => normalizeDate(h.effectiveDate) === normEffectiveDate);
  const newHistoryEntry = {
    effectiveDate: normEffectiveDate,
    changedFields,
    previousValues,
    snapshot: newSnapshot,
    changeSummary,
    changedBy: changedBy || "User",
    changedAt: new Date().toISOString()
  };

  if (existingIdx >= 0) {
    // Deterministically update the existing version on the same date
    history[existingIdx] = {
      ...history[existingIdx],
      ...newHistoryEntry,
      changedFields: { ...history[existingIdx].changedFields, ...changedFields },
      snapshot: newSnapshot
    };
  } else {
    history.push(newHistoryEntry);
  }

  // Sort history by effectiveDate ascending
  history.sort((a, b) => (normalizeDate(a.effectiveDate) || "").localeCompare(normalizeDate(b.effectiveDate) || ""));

  return {
    ...existingContact,
    ...updatePayload,
    effective_date: normEffectiveDate,
    effectiveDate: normEffectiveDate,
    history
  };
}

module.exports = {
  normalizeDate,
  parseBasicFreightCommission,
  getEffectivePartyMaster,
  applyEffectiveEdit,
};
