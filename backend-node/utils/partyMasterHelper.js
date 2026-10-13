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

/**
 * Parses basic freight commission decimal from document or string (e.g. 0.05, 0.04, 0.03, 0.06, 0)
 * Authoritative: Party Master BASIC FREIGHT COMMISSION
 * Formula: Party Rate % = (1 - BASIC FREIGHT COMMISSION) * 100
 */
function parseBasicFreightCommission(doc) {
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
function parseIncentiveCommission(doc) {
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
 * Checks whether a given contact document or update payload represents an ATOA relationship.
 */
function isAtoaRelationship(doc) {
  if (!doc || typeof doc !== 'object') return false;
  const raw = (
    doc["TYPE OF CUSTOMER "] ??
    doc["TYPE OF CUSTOMER"] ??
    doc.custType ??
    doc.type_of_customer ??
    doc.relationshipType ??
    doc.type ??
    doc.RelationshipType ??
    doc["Relationship Type"] ??
    doc["Relationship Type "]
  );
  if (raw === undefined || raw === null) return false;
  const s = String(raw).trim().toUpperCase();
  return s === "ATOA" || s === "ATO";
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
 * Normalizes wheel type labels into standard format: '6WH', '10WH', '12WH', '14WH'
 */
function normalizeWheelType(val) {
  if (!val) return '';
  const str = String(val).trim().toUpperCase();
  if (str.includes('6')) return '6WH';
  if (str.includes('10')) return '10WH';
  if (str.includes('12')) return '12WH';
  if (str.includes('14')) return '14WH';
  return str;
}

function is6Wheel(val) {
  return normalizeWheelType(val) === '6WH';
}

function is10or12or14Wheel(val) {
  const norm = normalizeWheelType(val);
  return norm === '10WH' || norm === '12WH' || norm === '14WH';
}

/**
 * Checks whether a given contact document or update payload represents an MKT relationship.
 */
function isMktRelationship(doc) {
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

  const latestSnapshot = history.length > 0 ? (history[history.length - 1].snapshot || history[history.length - 1]) : existingContact;

  const oldIsAtoa = isAtoaRelationship(latestSnapshot) || isAtoaRelationship(existingContact);
  const newIsAtoa = isAtoaRelationship(updatePayload);
  const oldIsMkt = isMktRelationship(latestSnapshot) || isMktRelationship(existingContact);
  const newIsMkt = isMktRelationship(updatePayload);

  const wheelVal = updatePayload.wheelType || updatePayload["Wheel Type "] || updatePayload.wheel_type || latestSnapshot.wheelType || latestSnapshot["Wheel Type "] || latestSnapshot.wheel_type;

  if (updatePayload.custType || updatePayload["TYPE OF CUSTOMER "] || updatePayload.type_of_customer || updatePayload.relationshipType) {
    const custVal = updatePayload["TYPE OF CUSTOMER "] || updatePayload["TYPE OF CUSTOMER"] || updatePayload.custType || updatePayload.type_of_customer || updatePayload.relationshipType;
    updatePayload["TYPE OF CUSTOMER "] = custVal;
    updatePayload["TYPE OF CUSTOMER"] = custVal;
    updatePayload.custType = custVal;
    updatePayload.type_of_customer = custVal;
    updatePayload.relationshipType = custVal;
  }

  // Extract normalized commissions if present in updatePayload
  let parsedComm = parseBasicFreightCommission(updatePayload);
  let parsedIncentive = parseIncentiveCommission(updatePayload);

  if (newIsAtoa) {
    if (!oldIsAtoa || parsedComm === null || parsedIncentive === null) {
      // Transitioning to ATOA or uninitialized: apply defaults 0.05 and 0.00 if not explicitly supplied
      if (parsedComm === null || parsedComm === undefined) parsedComm = 0.05;
      if (parsedIncentive === null || parsedIncentive === undefined) parsedIncentive = 0.00;
    } else {
      // Already ATOA: keep existing settings unless explicitly supplied
      if (parsedComm === null || parsedComm === undefined) {
        parsedComm = parseBasicFreightCommission(latestSnapshot);
      }
      if (parsedIncentive === null || parsedIncentive === undefined) {
        parsedIncentive = parseIncentiveCommission(latestSnapshot);
      }
    }
  } else if (newIsMkt) {
    if (!oldIsMkt || parsedComm === null || parsedIncentive === null) {
      if (is10or12or14Wheel(wheelVal)) {
        if (parsedComm === null || parsedComm === undefined) parsedComm = 0.05;
        if (parsedIncentive === null || parsedIncentive === undefined) parsedIncentive = 0.05;
      } else if (is6Wheel(wheelVal)) {
        if (parsedIncentive === null || parsedIncentive === undefined) parsedIncentive = 0.07;
        if (parsedComm === null || parsedComm === undefined) {
          const tripCount = updatePayload.tripCount !== undefined ? updatePayload.tripCount : updatePayload.completedTrips;
          parsedComm = (tripCount !== undefined && tripCount >= 6) ? 0.07 : 0.05;
        }
      }
    } else {
      // Already MKT: keep existing settings unless explicitly supplied
      if (parsedComm === null || parsedComm === undefined) {
        parsedComm = parseBasicFreightCommission(latestSnapshot);
      }
      if (parsedIncentive === null || parsedIncentive === undefined) {
        parsedIncentive = parseIncentiveCommission(latestSnapshot);
      }
    }
  }

  if (parsedComm !== null && parsedComm !== undefined) {
    updatePayload.basic_freight_commission = parsedComm;
    updatePayload.basicFreightCommission = parsedComm;
    updatePayload["BASIC FREIGHT COMMISSION"] = parsedComm;
    updatePayload["Basic Freight Commission"] = parsedComm;
    updatePayload["Basic Freight Commission "] = parsedComm;
    updatePayload["Basic Freight Comission Applicability "] = parsedComm;
    updatePayload["Basic Freight Comission Applicability"] = parsedComm;
    updatePayload["Basic Freight Commission Applicability "] = parsedComm;
    updatePayload["Basic Freight Commission Applicability"] = parsedComm;
    updatePayload["Basic Freight Comission Appliciability"] = parsedComm;
    updatePayload["Basic Freight Comission Appliciability "] = parsedComm;
    updatePayload["basic_freight_commission_applicability"] = parsedComm;
  }

  if (parsedIncentive !== null && parsedIncentive !== undefined) {
    updatePayload.incentive_commission = parsedIncentive;
    updatePayload.incentiveCommission = parsedIncentive;
    updatePayload["INCENTIVE COMMISSION"] = parsedIncentive;
    updatePayload["Incentive Commission"] = parsedIncentive;
    updatePayload["Incentive Commission "] = parsedIncentive;
    updatePayload["Incentive Comission Applicability "] = parsedIncentive;
    updatePayload["Incentive Comission Applicability"] = parsedIncentive;
    updatePayload["Incentive Commission Applicability "] = parsedIncentive;
    updatePayload["Incentive Commission Applicability"] = parsedIncentive;
    updatePayload["Incentive Comission Appliciability"] = parsedIncentive;
    updatePayload["Incentive Comission Appliciability "] = parsedIncentive;
    updatePayload["incentive_commission_applicability"] = parsedIncentive;
  }

  // Build full merged snapshot for this effective date
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
    { key: "incentive_commission", label: "Incentive Commission", altKeys: ["incentiveCommission", "INCENTIVE COMMISSION", "Incentive Commission", "Incentive Commission ", "Incentive Comission Applicability ", "Incentive Comission Applicability", "incentiveCommVal"] },
    { key: "TYPE OF CUSTOMER ", label: "Relationship Type", altKeys: ["custType", "relationshipType", "type", "type_of_customer"] },
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
    ...newSnapshot,
    effective_date: normEffectiveDate,
    effectiveDate: normEffectiveDate,
    history
  };
}

/**
 * Finds the effective Party Master contact for a given Owner + Vehicle + Record Date.
 * Authoritative: Owner ID + Vehicle ID / Exact Vehicle No
 */
function findContactForRecord(ownerName, vehicleNo, contactsList = [], recordDate = null, contactId = null) {
  if (!contactsList || contactsList.length === 0) return null;
  const cleanVeh = String(vehicleNo || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const cleanOwner = String(ownerName || '').trim().toLowerCase();
  const targetId = contactId ? String(contactId) : null;

  let matched = null;

  // 1. Direct ID match (highest authority)
  if (targetId) {
    matched = contactsList.find(c => c && (String(c._id) === targetId || String(c.id) === targetId));
  }

  // 2. Exact Owner Name + Vehicle Number
  if (!matched && cleanOwner && cleanVeh) {
    matched = contactsList.find(c => {
      if (!c) return false;
      const cVeh = String(c["Truck No "] || c["Truck No"] || c.truck_no || c.vehicleNo || c["Vehicle No"] || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      const cOwner = String(c["Owner Name "] || c["Owner Name"] || c.owner_name || c.ownerName || '').trim().toLowerCase();
      return cVeh === cleanVeh && cOwner === cleanOwner;
    });
  }

  // 3. Vehicle Number alone (unique vehicle registration)
  if (!matched && cleanVeh) {
    matched = contactsList.find(c => {
      if (!c) return false;
      const cVeh = String(c["Truck No "] || c["Truck No"] || c.truck_no || c.vehicleNo || c["Vehicle No"] || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      return cVeh === cleanVeh;
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

function parseContactCommission(contact, recordDate = null) {
  if (!contact) return null;
  const effective = getEffectivePartyMaster(contact, recordDate);
  if (!effective) return null;
  return parseBasicFreightCommission(effective);
}

module.exports = {
  normalizeDate,
  parseBasicFreightCommission,
  parseIncentiveCommission,
  isAtoaRelationship,
  isMktRelationship,
  normalizeWheelType,
  is6Wheel,
  is10or12or14Wheel,
  getEffectivePartyMaster,
  applyEffectiveEdit,
  findContactForRecord,
  parseContactCommission,
};
