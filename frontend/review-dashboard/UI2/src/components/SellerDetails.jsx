import React, { useEffect } from 'react';
import SearchableSelect from './SearchableSelect';
import { Box, TextField, Card, CardHeader, CardContent, Chip, MenuItem } from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';

export const FIXED_SELLER_FIELDS = {
  seller_address: "PANAGARH INDUSTRIAL PARK, KOTAGRAM, BURDWAN",
  seller_state: "WEST BENGAL",
  seller_state_code: "19",
  seller_pincode: "713148",
  seller_gstin: "19AAACL4159L1Z5",
  seller_pan: "AAACL4159L",
};

export default function SellerDetails({ data, errors, onChange }) {
  // Ensure the fixed seller fields are synchronized to parent formData
  useEffect(() => {
    Object.entries(FIXED_SELLER_FIELDS).forEach(([key, val]) => {
      if (data?.[key] !== val) {
        onChange('seller_details', key, val);
      }
    });
    if (!data?.seller_name) {
      onChange('seller_details', 'seller_name', 'NVCL');
    }
  }, [data?.seller_name, data?.seller_gstin]);

  const handleChange = (e) => {
    onChange('seller_details', e.target.name, e.target.value);
  };

  return (
    <Card sx={{ mb: 3, border: '1.5px solid #94a3b8', bgcolor: 'background.default' }}>
      <CardHeader
        title={
          <Box display="flex" alignItems="center" gap={1}>
            <LockIcon sx={{ fontSize: 16, color: '#64748b' }} />
            Seller Details
            <Chip label="Seller Name Editable · Others Fixed" size="small" sx={{ fontSize: 10, bgcolor: '#e2e8f0', color: '#475569', fontWeight: 700 }} />
          </Box>
        }
        sx={{ bgcolor: 'background.default', borderBottom: '1px solid #e2e8f0' }}
      />
      <CardContent>
        <Box display="flex" flexDirection="column" gap={3}>
          
          <SearchableSelect
            name="seller_name"
            value={data?.seller_name === 'NVL' || data?.seller_name === 'NVCL' ? data.seller_name : 'NVCL'}
            onChange={handleChange}
            label="Seller Name"
            sx={{ bgcolor: 'background.paper' }}
            size="medium"
          >
            <MenuItem value="NVCL">NUVOCO VISTAS CORP. LTD</MenuItem>
            <MenuItem value="NVL">NU VISTA LTD</MenuItem>
          </SearchableSelect>

          <TextField 
            fullWidth 
            label="Seller Address" 
            name="seller_address" 
            value={data?.seller_address || FIXED_SELLER_FIELDS.seller_address} 
            variant="outlined" 
            InputProps={{ readOnly: true }} 
            error={Boolean(errors?.seller_address)}
            helperText={errors?.seller_address}
            sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'background.default' }, '& .MuiInputBase-input': { color: '#475569', cursor: 'not-allowed' } }} 
          />
          <TextField 
            fullWidth 
            label="State" 
            name="seller_state" 
            value={data?.seller_state || FIXED_SELLER_FIELDS.seller_state} 
            variant="outlined" 
            InputProps={{ readOnly: true }} 
            error={Boolean(errors?.seller_state)}
            helperText={errors?.seller_state}
            sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'background.default' }, '& .MuiInputBase-input': { color: '#475569', cursor: 'not-allowed' } }} 
          />
          <TextField 
            fullWidth 
            label="State Code" 
            name="seller_state_code" 
            value={data?.seller_state_code || FIXED_SELLER_FIELDS.seller_state_code} 
            variant="outlined" 
            InputProps={{ readOnly: true }} 
            error={Boolean(errors?.seller_state_code)}
            helperText={errors?.seller_state_code}
            sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'background.default' }, '& .MuiInputBase-input': { color: '#475569', cursor: 'not-allowed' } }} 
          />
          <TextField 
            fullWidth 
            label="Pincode" 
            name="seller_pincode" 
            value={data?.seller_pincode || FIXED_SELLER_FIELDS.seller_pincode} 
            variant="outlined" 
            InputProps={{ readOnly: true }} 
            error={Boolean(errors?.seller_pincode)}
            helperText={errors?.seller_pincode}
            sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'background.default' }, '& .MuiInputBase-input': { color: '#475569', cursor: 'not-allowed' } }} 
          />
          <TextField 
            fullWidth 
            label="GSTIN" 
            name="seller_gstin" 
            value={data?.seller_gstin || FIXED_SELLER_FIELDS.seller_gstin} 
            variant="outlined" 
            InputProps={{ readOnly: true }} 
            error={Boolean(errors?.seller_gstin)}
            helperText={errors?.seller_gstin}
            sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'background.default' }, '& .MuiInputBase-input': { color: '#475569', cursor: 'not-allowed' } }} 
          />
          <TextField 
            fullWidth 
            label="PAN" 
            name="seller_pan" 
            value={data?.seller_pan || FIXED_SELLER_FIELDS.seller_pan} 
            variant="outlined" 
            InputProps={{ readOnly: true }} 
            error={Boolean(errors?.seller_pan)}
            helperText={errors?.seller_pan}
            sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'background.default' }, '& .MuiInputBase-input': { color: '#475569', cursor: 'not-allowed' } }} 
          />
        </Box>
      </CardContent>
    </Card>
  );
}
