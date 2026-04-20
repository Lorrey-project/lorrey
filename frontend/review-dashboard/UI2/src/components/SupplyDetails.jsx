import React, { useEffect, useState } from 'react';
import {
  Box, TextField, Card, CardHeader, CardContent, Chip, InputAdornment, Typography, CircularProgress,
  FormControl, InputLabel, Select, MenuItem
} from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import StarIcon from '@mui/icons-material/Star';
import axios from 'axios';
import { API_URL } from '../config';

// Gold highlight for critical fields
const highlightSx = {
  '& .MuiOutlinedInput-root': {
    '& fieldset': { borderColor: '#f59e0b', borderWidth: 2 },
    '&:hover fieldset': { borderColor: '#d97706' },
    '&.Mui-focused fieldset': { borderColor: '#d97706', borderWidth: 2 },
  },
  '& .MuiInputLabel-root': { color: '#b45309', fontWeight: 700 },
};

// Frozen transporter field style
const frozenSx = {
  '& .MuiOutlinedInput-root': { bgcolor: '#f1f5f9' },
  '& .MuiInputBase-input': { color: '#475569', cursor: 'not-allowed' },
};

export default function SupplyDetails({ data, errors, onChange }) {
    const [fetchingContact, setFetchingContact] = useState(false);

    // Auto-fetch driver info when vehicle number is present but driver fields are empty
    useEffect(() => {
        const vehicleNo = data?.vehicle_number;
        
        // We consider driver info missing if at least one crucial field is empty
        const missingDriverInfo = !data?.driver_number || !data?.driver_license;
        
        if (vehicleNo && vehicleNo.length >= 4 && missingDriverInfo) {
            const fetchContact = async () => {
                setFetchingContact(true);
                try {
                    const token = localStorage.getItem('token');
                    const res = await axios.get(`${API_URL}/invoice/truck-contact/${encodeURIComponent(vehicleNo)}`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    if (res.data && res.data.found) {
                        const contact = res.data;
                        if (contact.contact_no || contact.contact) {
                            onChange('supply_details', 'driver_number', contact.contact_no || contact.contact);
                        }
                        if (contact.license_no) {
                            onChange('supply_details', 'driver_license', contact.license_no);
                        }
                        if (contact.driver_name && !data?.driver_name) {
                            onChange('supply_details', 'driver_name', contact.driver_name);
                        }
                    }
                } catch (e) {
                    console.error("Error fetching truck contact:", e);
                } finally {
                    setFetchingContact(false);
                }
            };
            
            // Debounce the fetch
            const timer = setTimeout(() => {
                fetchContact();
            }, 600);
            
            return () => clearTimeout(timer);
        }
    }, [data?.vehicle_number]);

    const handleChange = (e) => {
        onChange('supply_details', e.target.name, e.target.value);
    };

    return (
        <Card sx={{ mb: 3 }}>
            <CardHeader
              title={
                <Box display="flex" alignItems="center" gap={1}>
                  Transporter Details
                  <Chip label="Transporter fields frozen" size="small" icon={<LockIcon sx={{ fontSize: 12 }} />}
                    sx={{ fontSize: 10, bgcolor: '#e2e8f0', color: '#475569', fontWeight: 700 }} />
                </Box>
              }
            />
            <CardContent>
                <Box display="flex" flexDirection="column" gap={3}>

                    {/* ── Delivery / Order ── */}
                    <TextField fullWidth label="Delivery Number"   name="delivery_number"          value={data?.delivery_number        || ''} onChange={handleChange} variant="outlined" />
                    <TextField fullWidth label="Order Reference"   name="order_reference_number"    value={data?.order_reference_number || ''} onChange={handleChange} variant="outlined" />

                    {/* ── Destination + State ── */}
                    <TextField
                      fullWidth label="Destination" name="destination"
                      value={data?.destination || ''} onChange={handleChange}
                      variant="outlined" sx={highlightSx}
                    />
                    <FormControl fullWidth variant="outlined">
                      <InputLabel id="dest-state-label">Destination State</InputLabel>
                      <Select
                        labelId="dest-state-label"
                        name="destination_state"
                        value={(() => {
                           const st = data?.destination_state || '';
                           const states = ["Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal"];
                           const matched = states.find(s => s.toLowerCase() === String(st).toLowerCase());
                           return matched || st;
                        })()}
                        onChange={handleChange}
                        label="Destination State"
                      >
                        <MenuItem value=""><em>— Select State —</em></MenuItem>
                        {[
                          "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
                          "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand",
                          "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur",
                          "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab",
                          "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
                          "Uttar Pradesh", "Uttarakhand", "West Bengal"
                        ].map((stateName) => (
                           <MenuItem key={stateName} value={stateName}>{stateName}</MenuItem>
                        ))}
                        {/* Fallback for unknown states returned by AI */}
                        {data?.destination_state && !["Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal"].find(s => s.toLowerCase() === String(data.destination_state).toLowerCase()) && (
                           <MenuItem key="fallback" value={data.destination_state} sx={{ display: 'none' }}>{data.destination_state}</MenuItem>
                        )}
                      </Select>
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, ml: 1 }}>
                        Used to identify NT/NVR route billing state
                      </Typography>
                    </FormControl>

                    {/* ── Mode / Vehicle ── */}
                    <TextField fullWidth label="Mode of Transport" name="mode_of_transport"  value="Road" variant="outlined" InputProps={{ readOnly: true }} sx={frozenSx} />
                    <TextField fullWidth label="Vehicle Number"    name="vehicle_number"      value={data?.vehicle_number      || ''} onChange={handleChange} variant="outlined" />
                    <TextField fullWidth label="Challan Number"    name="challan_number"      value={data?.challan_number      || ''} onChange={handleChange} variant="outlined" />

                    {/* ── Shipment No ── */}
                    <TextField
                      fullWidth label="Shipment Number" name="shipment_number"
                      value={data?.shipment_number || ''} onChange={handleChange}
                      variant="outlined" sx={highlightSx}
                    />

                    <TextField fullWidth label="Lorrey Receipt" name="lorrey_receipt_number" value={data?.lorrey_receipt_number || ''} onChange={handleChange} variant="outlined" />

                    {/* ── Transporter (frozen) ── */}
                    <Box sx={{ p: 2, border: '1.5px dashed #94a3b8', borderRadius: 2, bgcolor: '#f8fafc' }}>
                      <Box display="flex" alignItems="center" gap={1} mb={2}>
                        <LockIcon sx={{ fontSize: 14, color: '#94a3b8' }} />
                        <Box component="span" sx={{ fontSize: 12, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          Transporter Info (Read-only)
                        </Box>
                      </Box>
                      <Box display="flex" flexDirection="column" gap={2}>
                        <TextField fullWidth label="Transporter Name"    name="transporter_name"    value="DIPALI ASSOCIATES & CO." variant="outlined" InputProps={{ readOnly: true }} sx={frozenSx} />
                        <TextField fullWidth label="Transporter Address" name="transporter_address"  value="PANAGARH, PANAGARH INDUSTRIAL PARK, KOTAGRAM, BURDWAN, 19-WEST BENGAL-713148" variant="outlined" InputProps={{ readOnly: true }} sx={frozenSx} />
                        <TextField fullWidth label="Transporter Pincode" name="transporter_pincode"  value="713148" variant="outlined" InputProps={{ readOnly: true }} sx={frozenSx} />
                        <TextField fullWidth label="Transporter GSTIN"   name="transporter_gstin"    value="19AATFD1733C1ZH" variant="outlined" InputProps={{ readOnly: true }} sx={frozenSx} />
                      </Box>
                    </Box>

                    {/* ── Driver Fields ── */}
                    <Box sx={{ p: 2, border: '1.5px solid #e0f2fe', borderRadius: 2, bgcolor: '#f0f9ff', position: 'relative' }}>
                      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                        <Box component="span" sx={{ fontSize: 12, color: '#0369a1', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          Driver Information
                        </Box>
                        {fetchingContact && (
                          <Box display="flex" alignItems="center" gap={1}>
                            <CircularProgress size={14} sx={{ color: '#0284c7' }} />
                            <Typography variant="caption" sx={{ color: '#0284c7', fontWeight: 600 }}>Fetching...</Typography>
                          </Box>
                        )}
                      </Box>
                      <Box display="flex" flexDirection="column" gap={2}>
                        <TextField fullWidth label="Driver Name"             name="driver_name"    value={data?.driver_name    || ''} onChange={handleChange} variant="outlined" disabled={fetchingContact} />
                        <TextField fullWidth label="Driver Number (Contact)" name="driver_number"  value={data?.driver_number  || ''} onChange={handleChange} variant="outlined" disabled={fetchingContact} />
                        <TextField fullWidth label="Driver License No."      name="driver_license" value={data?.driver_license || ''} onChange={handleChange} variant="outlined" disabled={fetchingContact} />
                      </Box>
                    </Box>

                </Box>
            </CardContent>
        </Card>
    );
}
