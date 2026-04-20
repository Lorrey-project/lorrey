import React, { useState } from 'react';
import { ThemeProvider, createTheme, CssBaseline, Box, CircularProgress, useMediaQuery } from '@mui/material';
import InvoiceForm from './components/InvoiceForm';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './components/Login';
import Signup from './components/Signup';
import PumpLogin from './components/PumpLogin';
import Dashboard from './components/Dashboard';
import PumpDashboard from './components/PumpDashboard';
import LorryHireSlipReview from './components/LorryHireSlipReview';
import FuelSlipReview from './components/FuelSlipReview';
import VoucherEntry from './components/VoucherEntry';
import CementRegister from './pages/CementRegister';
import VoucherRegister from './pages/VoucherRegister';
import GSTPortalRegister from './pages/GSTPortalRegister';
import MainCashbook from './pages/MainCashbook';
import FuelRateSettings from './pages/FuelRateSettings';
import OfficePortal from './portals/office/OfficePortal';
import SitePortal from './portals/site/SitePortal';
import PumpPortal from './portals/pump/PumpPortal';
import PumpPaymentDetails from './pages/PumpPaymentDetails';
import PartyPaymentDetails from './pages/PartyPaymentDetails';
import FinancialYearDetails from './pages/FinancialYearDetails';
import AccountDetails from './pages/AccountDetails';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1a73e8',
      dark: '#0d47a1',
    },
    secondary: {
      main: '#34a853',
    },
    background: {
      default: '#f4f7f9',
      paper: '#ffffff',
    },
    text: {
      primary: '#1e293b',
      secondary: '#64748b',
    }
  },
  typography: {
    fontFamily: '"Outfit", "Inter", "system-ui", sans-serif',
    h3: {
      fontWeight: 900,
      letterSpacing: '-1.5px',
    },
    h4: {
      fontWeight: 800,
      letterSpacing: '-0.5px',
    },
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.1)',
          borderRadius: 16,
        }
      }
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          borderRadius: 8,
          boxShadow: 'none',
          '&:hover': {
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
          }
        }
      }
    }
  }
});

function AppContent() {
  const { user, loading } = useAuth();
  const theme = createTheme(); // Need theme for media query
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [showSignup, setShowSignup] = useState(false);
  const [currentView, setCurrentView] = useState('dashboard');
  const [lorrySlipInvoiceId, setLorrySlipInvoiceId] = useState(null);
  const [fuelSlipInvoiceId, setFuelSlipInvoiceId] = useState(null);
  const [voucherInvoiceId, setVoucherInvoiceId] = useState(null);
  const [voucherInvoiceData, setVoucherInvoiceData] = useState(null);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="100vh">
        <CircularProgress />
      </Box>
    );
  }

  if (!user) {
    const portal = import.meta.env.VITE_PORTAL; // undefined | 'site' | 'sas1' | 'sas2'

    // Port 5175 — SAS-1 pump only
    if (portal === 'sas1') {
      return showSignup ? (
        <Signup onToggle={() => setShowSignup(false)} lockedPump="SAS-1" />
      ) : (
        <Login onToggle={() => setShowSignup(true)} lockedPortal="PETROL PUMP" lockedPump="SAS-1" />
      );
    }

    // Port 5176 — SAS-2 pump only
    if (portal === 'sas2') {
      return showSignup ? (
        <Signup onToggle={() => setShowSignup(false)} lockedPump="SAS-2" />
      ) : (
        <Login onToggle={() => setShowSignup(true)} lockedPortal="PETROL PUMP" lockedPump="SAS-2" />
      );
    }

    // Port 5174 — Site admin only (OFFICE role)
    if (portal === 'site') {
      return showSignup ? (
        <Signup onToggle={() => setShowSignup(false)} lockedPortal="OFFICE" />
      ) : (
        <Login onToggle={() => setShowSignup(true)} lockedPortal="OFFICE" />
      );
    }

    // Port 5173 — Full office portal (all roles: HEAD_OFFICE, OFFICE, PETROL PUMP)
    return showSignup ? (
      <Signup onToggle={() => setShowSignup(false)} />
    ) : (
      <Login onToggle={() => setShowSignup(true)} />
    );
  }

  if (currentView === 'lorryHireSlip' && lorrySlipInvoiceId) {
    return (
      <LorryHireSlipReview
        invoiceId={lorrySlipInvoiceId}
        onBack={() => { setCurrentView('dashboard'); setLorrySlipInvoiceId(null); }}
        onOpenFuelSlip={() => {
          setFuelSlipInvoiceId(lorrySlipInvoiceId);
          setLorrySlipInvoiceId(null);
          setCurrentView('fuelSlip');
        }}
      />
    );
  }

  if (currentView === 'fuelSlip' && fuelSlipInvoiceId) {
    return (
      <FuelSlipReview
        invoiceId={fuelSlipInvoiceId}
        onBack={() => { setCurrentView('dashboard'); setFuelSlipInvoiceId(null); }}
        onOpenVoucher={(id) => {
          setVoucherInvoiceId(id);
          setFuelSlipInvoiceId(null);
          setCurrentView('voucher');
        }}
      />
    );
  }

  if (currentView === 'voucher') {
    return (
      <VoucherEntry
        invoiceId={voucherInvoiceId}
        invoiceData={voucherInvoiceData}
        onBack={() => {
          if (voucherInvoiceId) {
            setFuelSlipInvoiceId(voucherInvoiceId);
            setCurrentView('fuelSlip');
          } else {
            setCurrentView('dashboard');
          }
          setVoucherInvoiceId(null);
          setVoucherInvoiceData(null);
        }}
        onDashboard={() => {
          setCurrentView('dashboard');
          setVoucherInvoiceId(null);
          setVoucherInvoiceData(null);
        }}
      />
    );
  }

  if (currentView === 'cementRegister') {
    return <CementRegister onBack={() => setCurrentView('dashboard')} />;
  }

  if (currentView === 'voucherRegister') {
    return <VoucherRegister onBack={() => setCurrentView('dashboard')} />;
  }

  if (currentView === 'gstPortalRegister') {
    return <GSTPortalRegister onBack={() => setCurrentView('dashboard')} />;
  }

  if (currentView === 'mainCashbook') {
    return <MainCashbook onBack={() => setCurrentView('dashboard')} />;
  }

  if (currentView === 'pumpPayment') {
    return <PumpPaymentDetails onBack={() => setCurrentView('dashboard')} />;
  }

  if (currentView === 'partyPayment') {
    return <PartyPaymentDetails onBack={() => setCurrentView('dashboard')} />;
  }

  if (currentView === 'fyDetails') {
    return <FinancialYearDetails onBack={() => setCurrentView('dashboard')} />;
  }

  if (currentView === 'accountDetails') {
    return <AccountDetails onBack={() => setCurrentView('dashboard')} />;
  }

  if (currentView === 'fuelRateSettings') {
    return <FuelRateSettings onBack={() => setCurrentView('dashboard')} />;
  }

  if (currentView === 'dashboard') {
    if (isMobile) {
      if (user.role === 'PETROL PUMP') {
        return (
          <PumpPortal 
            onOpenBillingSheet={() => setCurrentView('pumpPayment')}
            onRegisterBiometrics={() => {
              alert("Biometric registration is initiated. Please follow the system prompt.");
            }}
          />
        );
      }
      if (import.meta.env.VITE_PORTAL === 'site' || user.role === 'OFFICE') {
        return (
          <SitePortal 
            onUploadNew={() => setCurrentView('upload')}
            onOpenLorrySlip={(id) => { setLorrySlipInvoiceId(id); setCurrentView('lorryHireSlip'); }}
            onOpenFuelSlip={(id) => { setFuelSlipInvoiceId(id); setCurrentView('fuelSlip'); }}
            onOpenRegisters={() => setCurrentView('cementRegister')}
          />
        );
      }
      return (
        <OfficePortal 
          onUploadNew={() => setCurrentView('upload')}
          onOpenLorrySlip={(id) => { setLorrySlipInvoiceId(id); setCurrentView('lorryHireSlip'); }}
          onOpenFuelSlip={(id) => { setFuelSlipInvoiceId(id); setCurrentView('fuelSlip'); }}
          onOpenFuelRateSettings={() => setCurrentView('fuelRateSettings')}
          onOpenRegisters={() => setCurrentView('cementRegister')}
        />
      );
    }

    // Desktop Routing
    if (user.role === 'PETROL PUMP') {
      return (
        <PumpDashboard 
          onOpenPumpPayment={() => setCurrentView('pumpPayment')}
        />
      );
    }

    return (
      <Dashboard
        onUploadNew={() => setCurrentView('upload')}
        onOpenLorrySlip={(id) => { setLorrySlipInvoiceId(id); setCurrentView('lorryHireSlip'); }}
        onOpenFuelSlip={(id) => { setFuelSlipInvoiceId(id); setCurrentView('fuelSlip'); }}
        onOpenCementRegister={() => setCurrentView('cementRegister')}
        onOpenVoucherRegister={() => setCurrentView('voucherRegister')}
        onOpenGSTPortalRegister={() => setCurrentView('gstPortalRegister')}
        onOpenMainCashbook={() => setCurrentView('mainCashbook')}
        onOpenPumpPayment={() => setCurrentView('pumpPayment')}
        onOpenPartyPayment={() => setCurrentView('partyPayment')}
        onOpenFYDetails={() => setCurrentView('fyDetails')}
        onOpenFuelRateSettings={() => setCurrentView('fuelRateSettings')}
        onOpenAccountDetails={() => setCurrentView('accountDetails')}
      />
    );
  }

  return (
    <InvoiceForm onBack={() => setCurrentView('dashboard')} />
  );
}

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
