const fs = require('fs');
let code = fs.readFileSync('frontend/review-dashboard/UI2/src/components/Dashboard.jsx', 'utf8');

// 1. Initial State
const initSearch = `setAdvanceFuelFormData({
            stationName: inv.lorry_hire_slip_data?.station_name || 'SAS-1',
            stationAddress: inv.lorry_hire_slip_data?.station_address || 'Panagarh',`;
const initReplace = `setAdvanceFuelFormData({
            stationName: inv.lorry_hire_slip_data?.station_name || 'SAS-1',
            stationAddress: 'Panagarh',
            date: inv.lorry_hire_slip_data?.advance_fuel_slip_date || new Date().toISOString().split('T')[0],`;

// 2. FormData
const formDataSearch = `formData.append('invoice_id', advanceFuelSlipTarget._id);
            formData.append('softcopy', blob, \`advance_fuel_slip_\${advanceFuelSlipTarget._id}.pdf\`);
            formData.append('driver_name', advanceFuelFormData.driverName);`;
const formDataReplace = `formData.append('invoice_id', advanceFuelSlipTarget._id);
            formData.append('softcopy', blob, \`advance_fuel_slip_\${advanceFuelSlipTarget._id}.pdf\`);
            formData.append('driver_name', advanceFuelFormData.driverName);
            formData.append('date', advanceFuelFormData.date);`;

// 3. Local State Update
const localStateSearch = `advance_fuel_slip_url: res.data.url,
                            driver_name: advanceFuelFormData.driverName`;
const localStateReplace = `advance_fuel_slip_url: res.data.url,
                            driver_name: advanceFuelFormData.driverName,
                            advance_fuel_slip_date: advanceFuelFormData.date`;

// 4. JSX Layout
const jsxSearch = `<Grid item xs={12}>
                            <Typography variant="subtitle2" color="text.secondary" gutterBottom>Manual Entry Details</Typography>
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField
                                label="Address"
                                fullWidth
                                variant="outlined"
                                InputProps={{ readOnly: true }}
                                value={advanceFuelFormData.stationAddress}
                            />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            {/* Empty Grid item to preserve layout spacing */}
                        </Grid>`;
const jsxReplace = `<Grid item xs={12} sm={6}>
                            <TextField
                                label="Address"
                                fullWidth
                                variant="outlined"
                                InputProps={{ readOnly: true }}
                                value="Panagarh"
                            />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField
                                label="Date"
                                type="date"
                                fullWidth
                                variant="outlined"
                                InputLabelProps={{ shrink: true }}
                                value={advanceFuelFormData.date || ''}
                                onChange={(e) => setAdvanceFuelFormData(prev => ({ ...prev, date: e.target.value }))}
                            />
                        </Grid>`;

code = code.replace(initSearch, initReplace);
code = code.replace(formDataSearch, formDataReplace);
code = code.replace(localStateSearch, localStateReplace);
code = code.replace(jsxSearch, jsxReplace);

fs.writeFileSync('frontend/review-dashboard/UI2/src/components/Dashboard.jsx', code);
console.log('Frontend patched!');
