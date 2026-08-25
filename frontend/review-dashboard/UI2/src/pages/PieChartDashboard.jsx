import React from 'react';
import { Box, Typography, IconButton } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

const PieChartDashboard = ({ onBack }) => {
  return (
    <Box sx={{ p: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <IconButton onClick={onBack} sx={{ mr: 2 }}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h4" fontWeight={900}>
          PIE CHART / Analytics
        </Typography>
      </Box>
      <Box sx={{ p: 4, bgcolor: 'background.paper', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
        <Typography variant="body1">
          Pie chart and analytics dashboard will be implemented here.
        </Typography>
      </Box>
    </Box>
  );
};

export default PieChartDashboard;
