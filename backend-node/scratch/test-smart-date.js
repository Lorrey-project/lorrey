function normalizeDateStr(str, expectedMonth, expectedYear) {
  if (!str) return str;
  const s = String(str).trim();
  if (/^\d{2}-\d{2}-\d{4}$/.test(s)) return s;

  // Excel Serial Date
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const excelDays = parseFloat(s);
    const date = new Date(Math.round((excelDays - 25569) * 86400 * 1000));
    return `${String(date.getUTCDate()).padStart(2, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${date.getUTCFullYear()}`;
  }

  // Parse p1/p2/p3 or p1-p2-p3
  const m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (m) {
    let year = parseInt(m[3], 10);
    if (year < 100) year += 2000;
    let p1 = parseInt(m[1], 10);
    let p2 = parseInt(m[2], 10);

    let d = p1, month = p2;
    if (expectedMonth) {
      if (p1 === expectedMonth && p2 !== expectedMonth) {
        d = p2;
        month = p1;
      } else if (p2 === expectedMonth && p1 !== expectedMonth) {
        d = p1;
        month = p2;
      } else if (p2 > 12) {
        d = p2;
        month = p1;
      }
    } else {
      if (p2 > 12) {
        d = p2;
        month = p1;
      }
    }
    return `${String(d).padStart(2, '0')}-${String(month).padStart(2, '0')}-${year}`;
  }

  // yyyy-mm-dd
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[3]}-${iso[2]}-${iso[1]}`;

  // dd-Mon-yyyy
  const monMatch = s.match(/^(\d{1,2})[\/-](\w+)[\/-](\d{2,4})$/);
  if (monMatch) {
    const monthIdx = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(monMatch[2].toLowerCase().slice(0, 3));
    if (monthIdx >= 0) {
      let year = parseInt(monMatch[3], 10);
      if (year < 100) year += 2000;
      return `${monMatch[1].padStart(2, '0')}-${String(monthIdx + 1).padStart(2, '0')}-${year}`;
    }
  }

  return s;
}

console.log("3/6/26 with expectedMonth=3:", normalizeDateStr("3/6/26", 3, 2026));
console.log("6/3/26 with expectedMonth=3:", normalizeDateStr("6/3/26", 3, 2026));
console.log("3/16/26 with expectedMonth=3:", normalizeDateStr("3/16/26", 3, 2026));
console.log("16/3/26 with expectedMonth=3:", normalizeDateStr("16/3/26", 3, 2026));
