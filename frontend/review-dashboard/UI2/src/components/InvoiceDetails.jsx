import React from "react";
import {
  Box, TextField, Card, CardHeader, CardContent,
  MenuItem, Select, InputLabel, FormControl, InputAdornment
} from "@mui/material";
import StarIcon from "@mui/icons-material/Star";

// Gold highlight style for critical fields
const highlightSx = {
  '& .MuiOutlinedInput-root': {
    '& fieldset': { borderColor: '#f59e0b', borderWidth: 2 },
    '&:hover fieldset': { borderColor: '#d97706' },
    '&.Mui-focused fieldset': { borderColor: '#d97706', borderWidth: 2 },
  },
  '& .MuiInputLabel-root': { color: '#b45309', fontWeight: 700 },
};

export default function InvoiceDetails({ data, errors, onChange }) {
  const handleChange = (e) => {
    onChange("invoice_details", e.target.name, e.target.value);
  };

  return (
    <Card sx={{ mb: 3, border: '2px solid #fbbf24', borderRadius: 2 }}>
      <CardHeader
        title="Invoice Details"
        sx={{ bgcolor: '#fffbeb', borderBottom: '1px solid #fde68a' }}
        titleTypographyProps={{ fontWeight: 900, color: '#92400e' }}
      />
      <CardContent>
        <Box display="flex" flexDirection="column" gap={3}>

          {/* Invoice Number */}
          <TextField
            fullWidth
            label="Invoice Number"
            name="invoice_number"
            value={data?.invoice_number || ""}
            onChange={handleChange}
            error={!!errors?.invoice_number}
            helperText={errors?.invoice_number}
            variant="outlined"
            sx={highlightSx}
          />

          {/* Invoice Date */}
          <TextField
            fullWidth
            label="Invoice Date"
            name="invoice_date"
            type="text"
            placeholder="e.g. 10/01/2026"
            InputLabelProps={{ shrink: true }}
            value={data?.invoice_date || ""}
            onChange={handleChange}
            error={!!errors?.invoice_date}
            helperText={errors?.invoice_date}
            variant="outlined"
            sx={highlightSx}
          />

          {/* Invoice Type — SO / STO / NT */}
          <FormControl fullWidth variant="outlined">
            <InputLabel>Invoice Type</InputLabel>
            <Select
              name="invoice_type"
              value={data?.invoice_type || ""}
              onChange={(e) => onChange("invoice_details", "invoice_type", e.target.value)}
              label="Invoice Type"
            >
              <MenuItem value="">— Select —</MenuItem>
              <MenuItem value="SO">SO</MenuItem>
              <MenuItem value="STO">STO</MenuItem>
              <MenuItem value="NT">NT</MenuItem>
            </Select>
          </FormControl>

          {/* Reference Number */}
          <TextField
            fullWidth
            label="Reference Number"
            name="reference_number"
            value={data?.reference_number || ""}
            onChange={handleChange}
            variant="outlined"
            sx={highlightSx}
          />

        </Box>
      </CardContent>
    </Card>
  );
}
