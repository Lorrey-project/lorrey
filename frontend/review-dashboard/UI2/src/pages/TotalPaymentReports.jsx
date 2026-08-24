import React, { useState } from 'react';
import { Box, Typography, Button, Paper, Tabs, Tab } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import CallReceivedIcon from '@mui/icons-material/CallReceived';
import CallMadeIcon from '@mui/icons-material/CallMade';

export default function TotalPaymentReports({ onBack }) {
  const [activeTab, setActiveTab] = useState(0);

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  return (
    <Box sx={{ p: 3, height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: '#f1f5f9' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button
            variant="text"
            startIcon={<ArrowBackIcon />}
            onClick={onBack}
            sx={{
              color: '#64748b',
              fontWeight: 600,
              '&:hover': { color: '#0f172a', bgcolor: 'rgba(0,0,0,0.04)' }
            }}
          >
            Back to Home
          </Button>
          <Typography variant="h5" sx={{ fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 1 }}>
            <AccountBalanceWalletIcon sx={{ color: '#0284c7' }} />
            Total Incoming & Outgoing Payment Reports
          </Typography>
        </Box>
      </Box>

      {/* Main Content Area */}
      <Paper sx={{ flex: 1, display: 'flex', flexDirection: 'column', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)' }}>
        
        {/* Tabs */}
        <Box sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: '#fff' }}>
          <Tabs 
            value={activeTab} 
            onChange={handleTabChange} 
            sx={{
              '& .MuiTab-root': { fontWeight: 600, textTransform: 'none', fontSize: '15px' },
              '& .Mui-selected': { color: '#0284c7' },
              '& .MuiTabs-indicator': { backgroundColor: '#0284c7', height: '3px', borderTopLeftRadius: '3px', borderTopRightRadius: '3px' }
            }}
          >
            <Tab icon={<CallReceivedIcon fontSize="small" />} iconPosition="start" label="Incoming Payments" />
            <Tab icon={<CallMadeIcon fontSize="small" />} iconPosition="start" label="Outgoing Payments" />
          </Tabs>
        </Box>

        {/* Tab Panels */}
        <Box sx={{ flex: 1, bgcolor: '#f8fafc', p: 4, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          {activeTab === 0 && (
            <Box sx={{ textAlign: 'center', color: '#64748b' }}>
              <CallReceivedIcon sx={{ fontSize: 64, color: '#cbd5e1', mb: 2 }} />
              <Typography variant="h6" fontWeight={700} color="#334155" mb={1}>
                Incoming Payments Module
              </Typography>
              <Typography variant="body2" maxWidth={400} mx="auto">
                This section will integrate with Party Payments and Main Cashbook to display all funds received.
              </Typography>
            </Box>
          )}

          {activeTab === 1 && (
            <Box sx={{ textAlign: 'center', color: '#64748b' }}>
              <CallMadeIcon sx={{ fontSize: 64, color: '#cbd5e1', mb: 2 }} />
              <Typography variant="h6" fontWeight={700} color="#334155" mb={1}>
                Outgoing Payments Module
              </Typography>
              <Typography variant="body2" maxWidth={400} mx="auto">
                This section will integrate with Pump Payments, Vouchers, and Remittance to display all outgoing funds.
              </Typography>
            </Box>
          )}
        </Box>

      </Paper>
    </Box>
  );
}
