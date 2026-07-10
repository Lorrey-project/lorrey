const regex = /^([a-zA-Z]+)\s*-\s*([A-Z0-9]+)\s*-\s*Trip No\.\s*(\d+)\s*\(([\d\-\.\/]+)\)\s*-\s*(.*?)\s*-\s*₹([\d,\.]+)/i;
const testStr = 'January-WB41H1234-Trip No. 5 (18-01-2026)-Damage/Shortage-₹820';
console.log(testStr.match(regex));
