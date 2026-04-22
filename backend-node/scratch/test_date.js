const val = "13-04-2026";
const iso = new Date(val);
console.log("new Date:", iso.toString());
console.log("isNaN(iso.getTime()):", isNaN(iso.getTime()));

// Current logic in partyPaymentRoutes.js
function currentParseDate(val) {
  if (!val) return null;
  const iso = new Date(val);
  if (!isNaN(iso.getTime())) {
    const str = String(val);
    const parts = str.split(/[-\/]/);
    if (parts.length === 3 && parts[2].length === 4) {
      const d = parseInt(parts[0]), m = parseInt(parts[1]), y = parseInt(parts[2]);
      if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
        return new Date(y, m - 1, d);
      }
    }
    return iso;
  }
  return null;
}

console.log("Result of currentParseDate:", currentParseDate(val));
