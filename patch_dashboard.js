const fs = require('fs');
let code = fs.readFileSync('frontend/review-dashboard/UI2/src/components/Dashboard.jsx', 'utf8');

const targetFunctionStart = "const handleOpenCreateAdvanceFuelSlip = (inv) => {";
const replacementStart = `const handleOpenCreateAdvanceFuelSlip = async (inv) => {`;

if (code.includes(targetFunctionStart)) {
    code = code.replace(targetFunctionStart, replacementStart);
    
    // Now replace the extraction logic
    const oldExtraction = `
        const vehicleNo = inv.lorry_hire_slip_data?.vehicleNumber || inv.lorry_hire_slip_data?.vehicle_number || supplyDetails.vehicle_number || '';
        const driverName = inv.lorry_hire_slip_data?.driverName || inv.lorry_hire_slip_data?.driver_name || inv.driverName || driverDetails.driver_name || '';
        
        console.log('[ADVANCE_FUEL_SLIP FRONTEND] Extracted values:', { vehicleNo, driverName });

        const randomSlipNo = 'ADV-' + Math.floor(100000 + Math.random() * 900000);

        const hasFuelSlip = !!(inv.lorry_hire_slip_data?.fuel_slip_url && inv.lorry_hire_slip_data?.fuel_slip_no);
        const fuelSlipNoVal = inv.lorry_hire_slip_data?.fuel_slip_url
            ? (inv.lorry_hire_slip_data?.fuel_slip_no || 'Not Available')
            : 'Fuel Slip Not Generated';

        const isDriverNameFetched = !!driverName && 
            !['not available', 'n/a', 'not found', '---'].includes(driverName.toLowerCase().trim()) &&
            !driverName.toLowerCase().includes('missing in') &&
            !driverName.toLowerCase().includes('collection');
        const driverNameVal = isDriverNameFetched ? driverName : '';
`;

    const newExtraction = `
        const vehicleNo = inv.lorry_hire_slip_data?.vehicleNumber || inv.lorry_hire_slip_data?.vehicle_number || supplyDetails.vehicle_number || '';
        let driverName = inv.lorry_hire_slip_data?.driverName || inv.lorry_hire_slip_data?.driver_name || inv.driverName || driverDetails.driver_name || '';
        
        console.log('[ADVANCE_FUEL_SLIP FRONTEND] Initial Extracted values:', { vehicleNo, driverName });

        // Auto-fetch Driver Name from Owner Details (TruckContacts)
        if (vehicleNo) {
            try {
                const token = localStorage.getItem('token');
                const res = await axios.get(\`\${API_URL}/truck-contacts/search/\${encodeURIComponent(vehicleNo)}\`, {
                    headers: { Authorization: \`Bearer \${token}\` }
                });
                if (res.data && res.data.success && res.data.contact) {
                    const fetchedDriverName = res.data.contact["Driver Name "] || res.data.contact.driver_name;
                    if (fetchedDriverName) {
                        driverName = fetchedDriverName;
                        console.log('[ADVANCE_FUEL_SLIP FRONTEND] Successfully fetched Driver Name from Owner Details:', driverName);
                    }
                }
            } catch (err) {
                console.error('[ADVANCE_FUEL_SLIP FRONTEND] Error fetching driver details:', err);
            }
        }

        const randomSlipNo = 'ADV-' + Math.floor(100000 + Math.random() * 900000);

        const hasFuelSlip = !!(inv.lorry_hire_slip_data?.fuel_slip_url && inv.lorry_hire_slip_data?.fuel_slip_no);
        const fuelSlipNoVal = inv.lorry_hire_slip_data?.fuel_slip_url
            ? (inv.lorry_hire_slip_data?.fuel_slip_no || 'Not Available')
            : 'Fuel Slip Not Generated';

        const isDriverNameFetched = !!driverName && 
            !['not available', 'n/a', 'not found', '---'].includes(driverName.toLowerCase().trim()) &&
            !driverName.toLowerCase().includes('missing in') &&
            !driverName.toLowerCase().includes('collection');
        const driverNameVal = isDriverNameFetched ? driverName : '';
`;
    // We will do a regex replace from `const vehicleNo` up to `const driverNameVal`
    const regex = /const vehicleNo = inv\.lorry_hire_slip_data\?\.vehicleNumber[\s\S]*?const driverNameVal = isDriverNameFetched \? driverName : '';/;
    code = code.replace(regex, newExtraction.trim());
    
    fs.writeFileSync('frontend/review-dashboard/UI2/src/components/Dashboard.jsx', code);
    console.log('Dashboard.jsx patched successfully');
} else {
    console.log('Function handleOpenCreateAdvanceFuelSlip not found');
}
