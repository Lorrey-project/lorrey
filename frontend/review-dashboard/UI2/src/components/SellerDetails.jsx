import React from 'react';
import { Box, TextField, Card, CardHeader, CardContent, Chip, MenuItem, Select, InputLabel, FormControl } from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';

export default function SellerDetails({ data, errors, onChange }) {
  // We keep the data passed in, but allow overriding the seller_name to NVL/NVCL
  const handleChange = (e) => {
      onChange('seller_details', e.target.name, e.target.value);
  };

  return (
    <Card sx={{ mb: 3, border: '1.5px solid #94a3b8', bgcolor: '#f8fafc' }}>
      <CardHeader
        title={
          <Box display="flex" alignItems="center" gap={1}>
            <LockIcon sx={{ fontSize: 16, color: '#64748b' }} />
            Seller Details
            <Chip label="Seller Name Editable · Others Fixed" size="small" sx={{ fontSize: 10, bgcolor: '#e2e8f0', color: '#475569', fontWeight: 700 }} />
          </Box>
        }
        sx={{ bgcolor: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}
      />
      <CardContent>
        <Box display="flex" flexDirection="column" gap={3}>
          
          <FormControl fullWidth variant="outlined">
            <InputLabel shrink id="seller-name-label">Seller Name</InputLabel>
            <Select
              labelId="seller-name-label"
              name="seller_name"
              value={data?.seller_name === 'NVL' || data?.seller_name === 'NVCL' ? data.seller_name : ''}
              onChange={handleChange}
              label="Seller Name"
              displayEmpty
              sx={{ bgcolor: '#fff' }}
            >
              <MenuItem value="" disabled><em>— Select Seller Name —</em></MenuItem>
              <MenuItem value="NVL">NVL</MenuItem>
              <MenuItem value="NVCL">NVCL</MenuItem>
            </Select>
          </FormControl>

          <TextField fullWidth label="Seller Address" name="seller_address" value="PANAGARH INDUSTRIAL PARK, KOTAGRAM, BURDWAN" variant="outlined" InputProps={{ readOnly: true }} sx={{ '& .MuiOutlinedInput-root': { bgcolor: '#f1f5f9' }, '& .MuiInputBase-input': { color: '#475569', cursor: 'not-allowed' } }} />
          <TextField fullWidth label="State" name="seller_state" value="WEST BENGAL" variant="outlined" InputProps={{ readOnly: true }} sx={{ '& .MuiOutlinedInput-root': { bgcolor: '#f1f5f9' }, '& .MuiInputBase-input': { color: '#475569', cursor: 'not-allowed' } }} />
          <TextField fullWidth label="State Code" name="seller_state_code" value="19" variant="outlined" InputProps={{ readOnly: true }} sx={{ '& .MuiOutlinedInput-root': { bgcolor: '#f1f5f9' }, '& .MuiInputBase-input': { color: '#475569', cursor: 'not-allowed' } }} />
          <TextField fullWidth label="Pincode" name="seller_pincode" value="713148" variant="outlined" InputProps={{ readOnly: true }} sx={{ '& .MuiOutlinedInput-root': { bgcolor: '#f1f5f9' }, '& .MuiInputBase-input': { color: '#475569', cursor: 'not-allowed' } }} />
          <TextField fullWidth label="GSTIN" name="seller_gstin" value="19AAACN8008H1ZX" variant="outlined" InputProps={{ readOnly: true }} sx={{ '& .MuiOutlinedInput-root': { bgcolor: '#f1f5f9' }, '& .MuiInputBase-input': { color: '#475569', cursor: 'not-allowed' } }} />
          <TextField fullWidth label="PAN" name="seller_pan" value="AAACN8008H" variant="outlined" InputProps={{ readOnly: true }} sx={{ '& .MuiOutlinedInput-root': { bgcolor: '#f1f5f9' }, '& .MuiInputBase-input': { color: '#475569', cursor: 'not-allowed' } }} />
        </Box>
      </CardContent>
    </Card>
  );
}
