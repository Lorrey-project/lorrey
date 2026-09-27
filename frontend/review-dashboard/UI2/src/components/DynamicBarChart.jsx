import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts';
import { Box, Typography } from '@mui/material';

const COOL_COLORS = [
  '#10b981', '#06b6d4', '#3b82f6', '#14b8a6',
  '#0ea5e9', '#059669', '#34d399', '#0284c7',
  '#38bdf8', '#0f766e', '#6ee7b7', '#047857'
];

const WARM_COLORS = [
  '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
  '#f43f5e', '#6366f1', '#c026d3', '#a78bfa',
  '#f472b6', '#9333ea', '#7c3aed', '#e879f9'
];

const formatCurrency = (val) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(val || 0);
};

const formatCompactCurrency = (val) => {
  if (!val || isNaN(val)) return '₹0';
  const num = Math.abs(val);
  if (num >= 10000000) {
    return `₹${(val / 10000000).toFixed(2)}Cr`;
  }
  if (num >= 100000) {
    return `₹${(val / 100000).toFixed(2)}L`;
  }
  if (num >= 1000) {
    return `₹${(val / 1000).toFixed(1)}k`;
  }
  return `₹${val}`;
};

const CustomTooltip = ({ active, payload, ledgerName }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <Box
        sx={{
          bgcolor: 'rgba(17, 20, 24, 0.95)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          backdropFilter: 'blur(12px)',
          p: 2,
          borderRadius: '8px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)',
          minWidth: '220px',
          zIndex: 100
        }}
      >
        <Typography sx={{ color: '#F5F7FA', fontWeight: 700, fontSize: '0.95rem', mb: 0.5 }}>
          {data.name}
        </Typography>
        <Typography sx={{ color: '#60a5fa', fontSize: '0.75rem', fontWeight: 700, mb: 1, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {ledgerName}
        </Typography>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
          <Typography sx={{ color: '#AAB4C0', fontSize: '0.85rem' }}>Amount:</Typography>
          <Typography sx={{ color: '#10b981', fontWeight: 800, fontSize: '0.95rem' }}>
            {formatCurrency(data.value)}
          </Typography>
        </Box>
        {data.percentage !== undefined && (
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
            <Typography sx={{ color: '#AAB4C0', fontSize: '0.85rem' }}>Share:</Typography>
            <Typography sx={{ color: '#F5F7FA', fontWeight: 700 }}>
              {data.percentage}%
            </Typography>
          </Box>
        )}
        {data.count !== undefined && (
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography sx={{ color: '#AAB4C0', fontSize: '0.85rem' }}>Transactions:</Typography>
            <Typography sx={{ color: '#F5F7FA', fontWeight: 600 }}>
              {data.count}
            </Typography>
          </Box>
        )}
        <Typography sx={{ color: '#93c5fd', fontSize: '0.7rem', mt: 1.5, pt: 1, borderTop: '1px solid rgba(255,255,255,0.1)', fontWeight: 600 }}>
          💡 Click bar to view detailed records
        </Typography>
      </Box>
    );
  }
  return null;
};

const DynamicBarChart = ({ data, ledgerName, palette = 'cool', totalAmount, onSliceClick }) => {
  const activeColors = palette === 'cool' ? COOL_COLORS : WARM_COLORS;
  const primaryBarColor = palette === 'cool' ? '#10b981' : '#8b5cf6';

  if (!data || data.length === 0) {
    return (
      <Box sx={{ display: 'flex', height: '100%', minHeight: 280, alignItems: 'center', justifyContent: 'center' }}>
        <Typography sx={{ color: '#7F8A96', fontSize: '0.9rem' }}>
          No data available for the selected period.
        </Typography>
      </Box>
    );
  }

  const total = totalAmount !== undefined ? totalAmount : data.reduce((sum, item) => sum + (item.value || 0), 0);
  const dataWithPercentages = data.map((item, idx) => ({
    ...item,
    percentage: total > 0 ? ((item.value / total) * 100).toFixed(1) : 0,
    color: activeColors[idx % activeColors.length]
  }));

  // Ensure scrollability and readable labels for dense datasets
  const isDense = dataWithPercentages.length > 7;
  const chartMinWidth = Math.max(100, dataWithPercentages.length * 52);

  return (
    <Box sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box
        sx={{
          flex: 1,
          width: '100%',
          minHeight: 300,
          overflowX: isDense ? 'auto' : 'hidden',
          overflowY: 'hidden',
          pb: 1,
          '&::-webkit-scrollbar': { height: '6px' },
          '&::-webkit-scrollbar-thumb': {
            bgcolor: 'rgba(255, 255, 255, 0.2)',
            borderRadius: '4px',
            '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.35)' }
          },
          '&::-webkit-scrollbar-track': {
            bgcolor: 'rgba(0, 0, 0, 0.2)',
            borderRadius: '4px'
          }
        }}
      >
        <Box sx={{ width: isDense ? `${chartMinWidth}px` : '100%', minWidth: '100%', height: '100%', minHeight: 290 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={dataWithPercentages}
              margin={{ top: 20, right: 25, left: 10, bottom: 45 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.07)" vertical={false} />
              <XAxis
                dataKey="name"
                stroke="#64748b"
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                angle={isDense ? -35 : 0}
                textAnchor={isDense ? 'end' : 'middle'}
                interval={0}
                height={isDense ? 50 : 30}
                tickLine={{ stroke: 'rgba(255, 255, 255, 0.15)' }}
              />
              <YAxis
                stroke="#64748b"
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                tickFormatter={formatCompactCurrency}
                tickLine={{ stroke: 'rgba(255, 255, 255, 0.15)' }}
                width={65}
              />
              <Tooltip
                content={<CustomTooltip ledgerName={ledgerName} />}
                cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }}
              />
              <Bar
                dataKey="value"
                radius={[6, 6, 0, 0]}
                maxBarSize={48}
                animationDuration={800}
                cursor={onSliceClick ? 'pointer' : 'default'}
                onClick={(entry) => onSliceClick && onSliceClick(entry)}
              >
                {dataWithPercentages.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.color || primaryBarColor}
                    opacity={0.9}
                    cursor={onSliceClick ? 'pointer' : 'default'}
                    onClick={() => onSliceClick && onSliceClick(entry)}
                    style={{
                      transition: 'all 0.2s ease',
                      filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))'
                    }}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Box>
      </Box>
    </Box>
  );
};

export default DynamicBarChart;
