const fs = require('fs');

let content = fs.readFileSync('src/pages/CementRegister.jsx', 'utf8');
const searchMatch = content.match(/const localVal = localData\[row\._id\]\?\.\[col\.key\];/);
if(searchMatch) {
    console.log("Found where it renders main table!");
}
