import React from 'react';
import {
  Box, Typography, Button, Container, Grid, Card, CardContent, Paper
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import AssessmentIcon from '@mui/icons-material/Assessment';
import TuneIcon from '@mui/icons-material/Tune';

export default function TdsReportsPage({ onBack }) {
  return (
    <Box sx={{
      minHeight: '100vh',
      bgcolor: '#090d16',
      color: '#f8fafc',
      py: 4,
      px: { xs: 2, md: 4 },
      fontFamily: 'Inter, system-ui, sans-serif'
    }}>
      <Container maxWidth="xl">
        {/* ── Top Bar / Header ─────────────────────────────────────────── */}
        <Box sx={{
          display: 'flex',
          alignItems: 'center',
          justify: 'space-between',
          mb: 4,
          pb: 2,
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Button
              variant="outlined"
              startIcon={<ArrowBackIcon />}
              onClick={onBack}
              sx={{
                color: '#94a3b8',
                borderColor: 'rgba(255, 255, 255, 0.2)',
                borderRadius: '10px',
                textTransform: 'none',
                fontWeight: 600,
                '&:hover': {
                  borderColor: '#06b6d4',
                  color: '#06b6d4',
                  bgcolor: 'rgba(6, 182, 212, 0.08)'
                }
              }}
            >
              Back to Dashboard
            </Button>
            <Box>
              <Typography variant="h4" sx={{ fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.5px' }}>
                TDS REPORTS
              </Typography>
              <Typography variant="body2" sx={{ color: '#94a3b8', mt: 0.5 }}>
                Tax Deducted at Source — Ledger & Deductions Management
              </Typography>
            </Box>
          </Box>

          <Box sx={{
            p: 1.5,
            borderRadius: '12px',
            bgcolor: 'rgba(6, 182, 212, 0.1)',
            border: '1px solid rgba(6, 182, 212, 0.2)',
            display: 'flex',
            alignItems: 'center',
            gap: 1.5
          }}>
            <ReceiptLongIcon sx={{ color: '#06b6d4', fontSize: 28 }} />
            <Box>
              <Typography variant="caption" sx={{ color: '#06b6d4', fontWeight: 700, display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Module Status
              </Typography>
              <Typography variant="body2" sx={{ color: '#e2e8f0', fontWeight: 600 }}>
                Active & Ready
              </Typography>
            </Box>
          </Box>
        </Box>

        {/* ── Feature Cards Grid ─────────────────────────────────────────── */}
        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid item xs={12} sm={6} md={3}>
            <Card sx={{
              bgcolor: 'rgba(15, 23, 42, 0.75)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '16px',
              backdropFilter: 'blur(10px)',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
            }}>
              <CardContent sx={{ p: 3 }}>
                <Box sx={{ p: 1.5, bgcolor: 'rgba(6, 182, 212, 0.15)', borderRadius: '12px', width: 'fit-content', mb: 2 }}>
                  <ReceiptLongIcon sx={{ color: '#06b6d4', fontSize: 24 }} />
                </Box>
                <Typography variant="h6" sx={{ fontWeight: 700, color: '#f8fafc', mb: 0.5 }}>
                  TDS Summary Ledger
                </Typography>
                <Typography variant="body2" sx={{ color: '#94a3b8', fontSize: '0.85rem' }}>
                  Aggregated Section 194C TDS deductions across vendors & parties.
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card sx={{
              bgcolor: 'rgba(15, 23, 42, 0.75)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '16px',
              backdropFilter: 'blur(10px)',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
            }}>
              <CardContent sx={{ p: 3 }}>
                <Box sx={{ p: 1.5, bgcolor: 'rgba(16, 185, 129, 0.15)', borderRadius: '12px', width: 'fit-content', mb: 2 }}>
                  <AccountBalanceIcon sx={{ color: '#10b981', fontSize: 24 }} />
                </Box>
                <Typography variant="h6" sx={{ fontWeight: 700, color: '#f8fafc', mb: 0.5 }}>
                  Sectionwise Breakdown
                </Typography>
                <Typography variant="body2" sx={{ color: '#94a3b8', fontSize: '0.85rem' }}>
                  Categorized view by TDS rates (@1%, @2%, @10%) & PAN status.
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card sx={{
              bgcolor: 'rgba(15, 23, 42, 0.75)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '16px',
              backdropFilter: 'blur(10px)',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
            }}>
              <CardContent sx={{ p: 3 }}>
                <Box sx={{ p: 1.5, bgcolor: 'rgba(168, 85, 247, 0.15)', borderRadius: '12px', width: 'fit-content', mb: 2 }}>
                  <AssessmentIcon sx={{ color: '#a855f7', fontSize: 24 }} />
                </Box>
                <Typography variant="h6" sx={{ fontWeight: 700, color: '#f8fafc', mb: 0.5 }}>
                  Quarterly Returns
                </Typography>
                <Typography variant="body2" sx={{ color: '#94a3b8', fontSize: '0.85rem' }}>
                  Form 26Q return filing data & Form 16A certificate tracking.
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card sx={{
              bgcolor: 'rgba(15, 23, 42, 0.75)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '16px',
              backdropFilter: 'blur(10px)',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
            }}>
              <CardContent sx={{ p: 3 }}>
                <Box sx={{ p: 1.5, bgcolor: 'rgba(245, 158, 11, 0.15)', borderRadius: '12px', width: 'fit-content', mb: 2 }}>
                  <TuneIcon sx={{ color: '#f59e0b', fontSize: 24 }} />
                </Box>
                <Typography variant="h6" sx={{ fontWeight: 700, color: '#f8fafc', mb: 0.5 }}>
                  TDS Provisions & Config
                </Typography>
                <Typography variant="body2" sx={{ color: '#94a3b8', fontSize: '0.85rem' }}>
                  Customizable deduction rates, thresholds & PAN exemption rules.
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* ── Main Content Area / Structure Container ──────────────────── */}
        <Paper sx={{
          p: 4,
          bgcolor: 'rgba(15, 23, 42, 0.85)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '20px',
          backdropFilter: 'blur(12px)',
          textAlign: 'center',
          minHeight: '360px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justify: 'center'
        }}>
          <Box sx={{
            p: 2.5,
            borderRadius: '50%',
            bgcolor: 'rgba(6, 182, 212, 0.12)',
            border: '1px solid rgba(6, 182, 212, 0.3)',
            mb: 2.5
          }}>
            <ReceiptLongIcon sx={{ color: '#06b6d4', fontSize: 44 }} />
          </Box>
          <Typography variant="h5" sx={{ fontWeight: 800, color: '#f8fafc', mb: 1 }}>
            TDS REPORTS MODULE
          </Typography>
          <Typography variant="body1" sx={{ color: '#94a3b8', maxWidth: '600px', mb: 3, lineHeight: 1.6 }}>
            The TDS Reports module structure and navigation are fully integrated into the LORREY dashboard. Ready for live tax deduction data and report generators.
          </Typography>
          <Button
            variant="contained"
            onClick={onBack}
            sx={{
              bgcolor: '#06b6d4',
              color: '#0f172a',
              fontWeight: 800,
              px: 4,
              py: 1.2,
              borderRadius: '12px',
              textTransform: 'none',
              '&:hover': {
                bgcolor: '#0891b2'
              }
            }}
          >
            Return to Dashboard
          </Button>
        </Paper>
      </Container>
    </Box>
  );
}
