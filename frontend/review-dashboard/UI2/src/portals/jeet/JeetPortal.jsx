import React from 'react';
import { Box, Typography, IconButton, Chip, Paper } from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import PersonIcon from '@mui/icons-material/Person';
import { useAuth } from '../../context/AuthContext';
import RoadTaxRegisterSection from '../../components/RoadTaxRegisterSection';

const JeetPortal = ({
  onLogout,
  onOpenCementRegister,
  onOpenMainCashbook,
  onOpenDailySummaryReport,
  onOpenOthersCreditor,
  onOpenDashboard,
  hideHeader = false
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

  if (hideHeader) {
    return (
      <Box sx={{ flex: 1 }}>
        <RoadTaxRegisterSection creditorName="JEET PANJA" panelTitle="JEET PANJA PANEL" />
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#0f172a', color: '#f8fafc', p: { xs: 2, md: 4 }, display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
      {/* ── TOP HEADER BAR ────────────────────────────────────────── */}
      <Paper elevation={0} sx={{ p: 2.5, mb: 3, bgcolor: '#1e293b', borderRadius: 3, border: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Box display="flex" alignItems="center" gap={2}>
          <Box sx={{ width: 46, height: 46, borderRadius: '14px', bgcolor: 'rgba(56, 189, 248, 0.15)', border: '1px solid rgba(56, 189, 248, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#38bdf8' }}>
            <PersonIcon sx={{ fontSize: 28 }} />
          </Box>
          <Box>
            <Box display="flex" alignItems="center" gap={1.5}>
              <Typography variant="h5" fontWeight={900} sx={{ color: '#f8fafc', letterSpacing: '-0.5px' }}>
                JEET PANJA PANEL
              </Typography>
              <Chip label="PORT 5178" size="small" sx={{ bgcolor: 'rgba(56, 189, 248, 0.2)', color: '#bae6fd', fontWeight: 800, fontSize: '0.7rem', border: '1px solid rgba(56, 189, 248, 0.4)' }} />
            </Box>
            <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 600 }}>
              Dipali Associates & Co. &bull; Vehicle Validity Register & Creditor Accounts
            </Typography>
          </Box>
        </Box>

        <Box display="flex" alignItems="center" gap={1.5} flexWrap="wrap">
          <Chip
            avatar={<PersonIcon sx={{ color: '#38bdf8 !important' }} />}
            label={user?.email || 'Jeet Panja Admin'}
            sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: '#f8fafc', fontWeight: 700, border: '1px solid #334155' }}
          />

          <IconButton onClick={handleLogout} title="Logout" sx={{ color: '#ef4444', bgcolor: 'rgba(239, 68, 68, 0.1)', '&:hover': { bgcolor: 'rgba(239, 68, 68, 0.2)' } }}>
            <LogoutIcon fontSize="small" />
          </IconButton>
        </Box>
      </Paper>

      {/* ── MAIN SECTION CONTENT ─────────────────────────────────────── */}
      <Box sx={{ flex: 1 }}>
        <RoadTaxRegisterSection creditorName="JEET PANJA" panelTitle="JEET PANJA PANEL" />
      </Box>
    </Box>
  );
};

export default JeetPortal;
