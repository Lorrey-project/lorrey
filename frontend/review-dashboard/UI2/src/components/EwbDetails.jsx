import React from "react";
import { Box, TextField, Card, CardHeader, CardContent } from "@mui/material";

export default function EwbDetails({ data, errors, onChange }) {
  const handleChange = (e) => {
    onChange("ewb_details", e.target.name, e.target.value);
  };

  const handleDateChange = (name, val) => {
    if (!val) {
      onChange("ewb_details", name, "");
      return;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
      const [year, month, day] = val.split("-");
      onChange("ewb_details", name, `${day}/${month}/${year}`);
    } else {
      onChange("ewb_details", name, val);
    }
  };

  const convertDate = (date) => {
    if (!date) return "";
    if (typeof date !== "string") return "";
    const clean = date.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
    const parts = clean.split(/[\/\-]/);
    if (parts.length === 3) {
      if (parts[2].length === 4) {
        const [day, month, year] = parts;
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
    }
    return clean;
  };

  return (
    <Card sx={{ mb: 3 }}>
      <CardHeader title="EWB Details" />
      <CardContent>
        <Box display="flex" flexDirection="column" gap={3}>
          <TextField
            fullWidth
            label="EWB Number"
            name="ewb_number"
            value={data?.ewb_number || ""}
            onChange={handleChange}
            variant="outlined"
          />
          <TextField
            fullWidth
            label="EWB Create Date"
            name="ewb_create_date"
            type="date"
            InputLabelProps={{ shrink: true }}
            value={convertDate(data?.ewb_create_date)}
            onChange={(e) => handleDateChange("ewb_create_date", e.target.value)}
            error={!!errors?.ewb_create_date}
            helperText={errors?.ewb_create_date}
            variant="outlined"
          />
          <TextField
            fullWidth
            label="EWB Create Time"
            name="ewb_create_time"
            type="time"
            InputLabelProps={{ shrink: true }}
            value={data?.ewb_create_time || ""}
            onChange={handleChange}
            variant="outlined"
          />
          <TextField
            fullWidth
            label="EWB Valid Date"
            name="ewb_valid_date"
            type="date"
            InputLabelProps={{ shrink: true }}
            value={convertDate(data?.ewb_valid_date)}
            onChange={(e) => handleDateChange("ewb_valid_date", e.target.value)}
            error={!!errors?.ewb_valid_date}
            helperText={errors?.ewb_valid_date}
            variant="outlined"
          />
          <TextField
            fullWidth
            label="EWB Valid Time"
            name="ewb_valid_time"
            type="time"
            InputLabelProps={{ shrink: true }}
            value={data?.ewb_valid_time || ""}
            onChange={handleChange}
            variant="outlined"
          />
        </Box>
      </CardContent>
    </Card>
  );
}
