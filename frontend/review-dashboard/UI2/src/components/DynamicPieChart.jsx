import React from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { Box, Typography, Grid } from '@mui/material';

const DEFAULT_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', 
  '#8b5cf6', '#ec4899', '#06b6d4', '#6366f1',
  '#14b8a6', '#f43f5e', '#84cc16', '#64748b'
];

const COOL_COLORS = [
  '#3b82f6', '#10b981', '#0ea5e9', '#06b6d4',
  '#14b8a6', '#0f766e', '#0369a1', '#0284c7',
  '#059669', '#34d399', '#38bdf8', '#047857'
];

const WARM_COLORS = [
  '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
  '#f43f5e', '#f472b6', '#c026d3', '#9333ea',
  '#7c3aed', '#6366f1', '#a78bfa', '#e879f9'
];

const formatCurrency = (val) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(val || 0);
};

const CustomTooltip = ({ active, payload, ledgerName }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <Box
        sx={{
          bgcolor: 'rgba(20, 24, 28, 0.95)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(10px)',
          p: 2,
          borderRadius: '8px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
          minWidth: '200px'
        }}
      >
        <Typography sx={{ color: '#F5F7FA', fontWeight: 600, mb: 1 }}>
          {data.name}
        </Typography>
        <Typography sx={{ color: '#3b82f6', fontSize: '0.8rem', fontWeight: 700, mb: 1, textTransform: 'uppercase' }}>
          {ledgerName}
        </Typography>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography sx={{ color: '#AAB4C0', fontSize: '0.9rem' }}>Amount:</Typography>
          <Typography sx={{ color: '#F5F7FA', fontWeight: 700 }}>{formatCurrency(data.value)}</Typography>
        </Box>
        {data.percentage !== undefined && (
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 0.5 }}>
            <Typography sx={{ color: '#AAB4C0', fontSize: '0.9rem' }}>Share:</Typography>
            <Typography sx={{ color: '#F5F7FA', fontWeight: 700 }}>{data.percentage}%</Typography>
          </Box>
        )}
      </Box>
    );
  }
  return null;
};

const DynamicPieChart = ({ data, ledgerName, palette, totalAmount }) => {
  const activeColors = palette === 'cool' ? COOL_COLORS : palette === 'warm' ? WARM_COLORS : DEFAULT_COLORS;

  if (!data || data.length === 0) {
    return (
      <Box sx={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
        <Typography sx={{ color: '#7F8A96' }}>No data available for the selected period.</Typography>
      </Box>
    );
  }

  const total = data.reduce((sum, item) => sum + item.value, 0);
  const dataWithPercentages = data.map(item => ({
    ...item,
    percentage: total > 0 ? ((item.value / total) * 100).toFixed(1) : 0
  }));

  // Render Custom Legend
  const renderLegend = () => {
    return (
      <Box sx={{ height: '100%', overflowY: 'auto', pr: 1, '&::-webkit-scrollbar': { width: '4px' }, '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(255,255,255,0.2)', borderRadius: '4px' } }}>
        <Grid container spacing={1}>
          {dataWithPercentages.map((entry, index) => (
            <Grid item xs={12} sm={6} key={`legend-${index}`} sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
              <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: activeColors[index % activeColors.length], mr: 1, flexShrink: 0 }} />
              <Typography sx={{ color: '#AAB4C0', fontSize: '0.75rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '90px' }}>
                {entry.name}
              </Typography>
              <Typography sx={{ color: '#FFF', fontSize: '0.75rem', fontWeight: 600, ml: 'auto', whiteSpace: 'nowrap' }}>
                {formatCurrency(entry.value)} ({entry.percentage}%)
              </Typography>
            </Grid>
          ))}
        </Grid>
      </Box>
    );
  };

  return (
    <Box sx={{ display: 'flex', height: '100%', width: '100%', alignItems: 'center' }}>
      {/* Chart Area */}
      <Box sx={{ width: { xs: '100%', md: '45%' }, height: '100%', position: 'relative' }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={dataWithPercentages}
              cx="50%"
              cy="50%"
              innerRadius="65%"
              outerRadius="90%"
              paddingAngle={2}
              dataKey="value"
              stroke="none"
              animationBegin={0}
              animationDuration={800}
            >
              {dataWithPercentages.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={activeColors[index % activeColors.length]} 
                  style={{ transition: 'all 0.3s ease' }}
                />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip ledgerName={ledgerName} />} />
          </PieChart>
        </ResponsiveContainer>
        
        {/* Center Text */}
        <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <Typography variant="h6" fontWeight={800} sx={{ color: '#FFF', fontSize: '1.1rem' }}>
            {formatCurrency(totalAmount || total)}
          </Typography>
          <Typography variant="caption" sx={{ color: '#AAB4C0', fontSize: '0.65rem' }}>
            Total Amount
          </Typography>
        </Box>
      </Box>

      {/* Legend Area */}
      <Box sx={{ width: { xs: '100%', md: '55%' }, height: '80%', pl: 2, display: { xs: 'none', md: 'block' } }}>
        {renderLegend()}
      </Box>
    </Box>
  );
};

export default DynamicPieChart;
