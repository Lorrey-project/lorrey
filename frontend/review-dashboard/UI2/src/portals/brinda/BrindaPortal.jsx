import React from 'react';
import { Box, Typography, Button, IconButton, Chip, Paper } from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import PersonIcon from '@mui/icons-material/Person';
import TableChartIcon from '@mui/icons-material/TableChart';
import DashboardIcon from '@mui/icons-material/Dashboard';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import { useAuth } from '../../context/AuthContext';
import { CreditorVehicleLedgerSection } from '../../pages/OthersCreditor';

const BrindaPortal = ({
  onLogout,
  onOpenCementRegister,
  onOpenMainCashbook,
  onOpenDailySummaryReport,
  onOpenDashboard
}) => {
  const { user, logout } = useAuth();

  const handleLogout = () => {
    if (onLogout) {
      onLogout();
    } else if (logout) {
      logout();
    } else {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.reload();
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#0f172a', color: '#f8fafc', p: { xs: 2, md: 4 }, display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
      {/* ── TOP HEADER BAR ────────────────────────────────────────── */}
      <Paper elevation={0} sx={{ p: 2.5, mb: 3, bgcolor: '#1e293b', borderRadius: 3, border: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Box display="flex" alignItems="center" gap={2}>
          <Box sx={{ width: 46, height: 46, borderRadius: '14px', bgcolor: 'rgba(192, 132, 252, 0.15)', border: '1px solid rgba(192, 132, 252, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#c084fc' }}>
            <PersonIcon sx={{ fontSize: 28 }} />
          </Box>
          <Box>
            <Box display="flex" alignItems="center" gap={1.5}>
              <Typography variant="h5" fontWeight={900} sx={{ color: '#f8fafc', letterSpacing: '-0.5px' }}>
                BRINDA SHYAM PANEL
              </Typography>
              <Chip label="PORT 5177" size="small" sx={{ bgcolor: 'rgba(192, 132, 252, 0.2)', color: '#e9d5ff', fontWeight: 800, fontSize: '0.7rem', border: '1px solid rgba(192, 132, 252, 0.4)' }} />
            </Box>
            <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 600 }}>
              Dipali Associates & Co. &bull; Creditor Account & Vehicle Ledger
            </Typography>
          </Box>
        </Box>

        <Box display="flex" alignItems="center" gap={1.5} flexWrap="wrap">
          {onOpenCementRegister && (
            <Button
              variant="outlined"
              size="small"
              onClick={onOpenCementRegister}
              startIcon={<TableChartIcon />}
              sx={{ color: '#e2e8f0', borderColor: '#475569', borderRadius: '8px', textTransform: 'none', fontWeight: 700, '&:hover': { borderColor: '#94a3b8', bgcolor: 'rgba(255,255,255,0.05)' } }}
            >
              Cement Register
            </Button>
          )}

          {onOpenMainCashbook && (
            <Button
              variant="outlined"
              size="small"
              onClick={onOpenMainCashbook}
              startIcon={<AccountBalanceWalletIcon />}
              sx={{ color: '#e2e8f0', borderColor: '#475569', borderRadius: '8px', textTransform: 'none', fontWeight: 700, '&:hover': { borderColor: '#94a3b8', bgcolor: 'rgba(255,255,255,0.05)' } }}
            >
              Main Cashbook
            </Button>
          )}

          {onOpenDailySummaryReport && (
            <Button
              variant="outlined"
              size="small"
              onClick={onOpenDailySummaryReport}
              startIcon={<DashboardIcon />}
              sx={{ color: '#e2e8f0', borderColor: '#475569', borderRadius: '8px', textTransform: 'none', fontWeight: 700, '&:hover': { borderColor: '#94a3b8', bgcolor: 'rgba(255,255,255,0.05)' } }}
            >
              Daily Summary
            </Button>
          )}

          <Chip
            avatar={<PersonIcon sx={{ color: '#c084fc !important' }} />}
            label={user?.email || 'Brinda Shyam Admin'}
            sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: '#f8fafc', fontWeight: 700, border: '1px solid #334155' }}
          />

          <IconButton onClick={handleLogout} title="Logout" sx={{ color: '#ef4444', bgcolor: 'rgba(239, 68, 68, 0.1)', '&:hover': { bgcolor: 'rgba(239, 68, 68, 0.2)' } }}>
            <LogoutIcon fontSize="small" />
          </IconButton>
        </Box>
      </Paper>

      {/* ── MAIN CREDITOR LEDGER SECTION ──────────────────────────── */}
      <Box sx={{ flex: 1 }}>
        <CreditorVehicleLedgerSection creditorName="BRINDA SHYAM" />
      </Box>
    </Box>
  );
};

export default BrindaPortal;
