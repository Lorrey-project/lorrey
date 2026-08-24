const bcrypt = require('bcryptjs');
const hash = '$2b$10$S/za8x0sfBrXdeJVVFHhzOqnkD5WZ/KlVonc1/urDUnSLUNT/7d6i';
bcrypt.compare("anything", hash).then(res => console.log(res)).catch(err => console.error("Error:", err));
