const fs = require('fs');
let code = fs.readFileSync('backend-node/routes/invoiceRoutes.js', 'utf8');

const target1 = "const { invoice_id, driver_name } = req.body;";
const replace1 = "const { invoice_id, driver_name, date } = req.body;";

const target2 = "if (driver_name) {\n        updatePayload[\"lorry_hire_slip_data.driver_name\"] = driver_name;\n    }";
const replace2 = `if (driver_name) {
        updatePayload["lorry_hire_slip_data.driver_name"] = driver_name;
    }
    if (date) {
        updatePayload["lorry_hire_slip_data.advance_fuel_slip_date"] = date;
    }`;

if (code.includes(target1)) {
    code = code.replace(target1, replace1).replace(target2, replace2);
    fs.writeFileSync('backend-node/routes/invoiceRoutes.js', code);
    console.log("Backend patched");
} else {
    console.log("Could not find target strings in backend");
}
