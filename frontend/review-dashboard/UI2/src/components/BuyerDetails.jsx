import React from 'react';
import { Box, TextField, Card, CardHeader, CardContent } from '@mui/material';

// Renamed from "Buyer Details" → "Consignee Details"
export default function BuyerDetails({ data, errors, onChange }) {
    const handleChange = (e) => {
        onChange('buyer_details', e.target.name, e.target.value);
    };

    return (
        <Card sx={{ mb: 3 }}>
            <CardHeader title="Consignee Details" />
            <CardContent>
                <Box display="flex" flexDirection="column" gap={3}>
                    <TextField fullWidth label="Consignee Name"    name="buyer_name"      value={data?.buyer_name      || ''} onChange={handleChange} variant="outlined" />
                    <TextField fullWidth label="Consignee Address" name="buyer_address"   value={data?.buyer_address   || ''} onChange={handleChange} variant="outlined" />
                    <TextField fullWidth label="State"             name="buyer_state"     value={data?.buyer_state     || ''} onChange={handleChange} variant="outlined" />
                    <TextField fullWidth label="State Code"        name="buyer_state_code" value={data?.buyer_state_code || ''} onChange={handleChange} variant="outlined" />
                    <TextField fullWidth label="Pincode"           name="buyer_pincode"   value={data?.buyer_pincode   || ''} onChange={handleChange} error={!!errors?.buyer_pincode}   helperText={errors?.buyer_pincode}   variant="outlined" />
                    <TextField fullWidth label="GSTIN"             name="buyer_gstin"     value={data?.buyer_gstin     || ''} onChange={handleChange} error={!!errors?.buyer_gstin}     helperText={errors?.buyer_gstin}     variant="outlined" />
                    <TextField fullWidth label="PAN"               name="buyer_pan"       value={data?.buyer_pan       || ''} onChange={handleChange} error={!!errors?.buyer_pan}       helperText={errors?.buyer_pan}       variant="outlined" />
                </Box>
            </CardContent>
        </Card>
    );
}
