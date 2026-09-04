import React, { useState } from 'react';
import { ThemeProvider, createTheme, CssBaseline, Box, CircularProgress, useMediaQuery } from '@mui/material';
import { ShortcutProvider } from './context/ShortcutContext';
import GlobalShortcutHandler from './components/GlobalShortcutHandler';
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
import TotalPaymentReports from './pages/TotalPaymentReports';
import PieChartDashboard from './pages/PieChartDashboard';
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
import AccountApprovalsPage from './pages/AccountApprovalsPage';
import DailySummaryReport from './pages/DailySummaryReport';
import PumpPaymentRegister from './pages/PumpPaymentRegister';
import IncentiveCalculationSheet from './pages/IncentiveCalculationSheet';
import AttendancePanel from './pages/AttendancePanel';
import AiExtraExpense from './pages/AiExtraExpense';
import TdsReportsPage from './pages/TdsReportsPage';
import OthersCreditor from './pages/OthersCreditor';
import VantaTrunkBackground from './components/VantaTrunkBackground';




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
  const [isTransitioning, setIsTransitioning] = useState(false);

  const handleViewChange = (newView) => {
    setIsTransitioning(true);
    setTimeout(() => {
        setCurrentView(newView);
        setIsTransitioning(false);
    }, 400); // Cinematic transition duration
  };


  if (loading) {
        return (
      <Box display="flex" justifyContent="center" alignItems="center" height="100vh">
        <CircularProgress />
      </Box>
    );
  }

  
  const renderView = () => {
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
        onBack={() => { handleViewChange('dashboard'); setLorrySlipInvoiceId(null); }}
        onOpenFuelSlip={() => {
          setFuelSlipInvoiceId(lorrySlipInvoiceId);
          setLorrySlipInvoiceId(null);
          handleViewChange('fuelSlip');
        }}
      />
    );
  }

  if (currentView === 'fuelSlip' && fuelSlipInvoiceId) {
    return (
      <FuelSlipReview
        invoiceId={fuelSlipInvoiceId}
        onBack={() => { handleViewChange('dashboard'); setFuelSlipInvoiceId(null); }}
        onOpenVoucher={(id) => {
          setVoucherInvoiceId(id);
          setFuelSlipInvoiceId(null);
          handleViewChange('voucher');
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
            handleViewChange('fuelSlip');
          } else {
            handleViewChange('dashboard');
          }
          setVoucherInvoiceId(null);
          setVoucherInvoiceData(null);
        }}
        onDashboard={() => {
          handleViewChange('dashboard');
          setVoucherInvoiceId(null);
          setVoucherInvoiceData(null);
        }}
      />
    );
  }

  if (currentView === 'cementRegister') {
    return <CementRegister onBack={() => handleViewChange('dashboard')} />;
  }

  if (currentView === 'voucherRegister') {
    return <VoucherRegister onBack={() => handleViewChange('dashboard')} />;
  }

  if (currentView === 'gstPortalRegister') {
    return <GSTPortalRegister onBack={() => handleViewChange('dashboard')} />;
  }

  if (currentView === 'mainCashbook') {
    return <MainCashbook onBack={() => handleViewChange('dashboard')} />;
  }

  if (currentView === 'pumpPayment') {
    return <PumpPaymentDetails onBack={() => handleViewChange('dashboard')} />;
  }

  if (currentView === 'pumpPaymentRegister') {
    return <PumpPaymentRegister onBack={() => handleViewChange('dashboard')} />;
  }

  if (currentView === 'partyPayment') {
    return <PartyPaymentDetails onBack={() => handleViewChange('dashboard')} />;
  }

  if (currentView === 'fyDetails') {
    return <FinancialYearDetails onBack={() => handleViewChange('dashboard')} />;
  }

  if (currentView === 'totalPaymentReports') {
    return <TotalPaymentReports onBack={() => handleViewChange('dashboard')} />;
  }

  if (currentView === 'pieChart') {
    return <PieChartDashboard onBack={() => handleViewChange('dashboard')} />;
  }

  if (currentView === 'accountDetails') {
    return <AccountDetails onBack={() => handleViewChange('dashboard')} />;
  }

  if (currentView === 'accountApprovals') {
    return <AccountApprovalsPage onBack={() => handleViewChange('dashboard')} />;
  }

  if (currentView === 'fuelRateSettings') {
    return <FuelRateSettings onBack={() => handleViewChange('dashboard')} />;
  }

  if (currentView === 'dailySummary') {
    return (
      <DailySummaryReport
        onBack={() => handleViewChange('dashboard')}
        onUploadNew={() => handleViewChange('dashboard')} // Will trigger upload via dashboard or we can just go dashboard
        onOpenCementRegister={() => handleViewChange('cementRegister')}
        onOpenPartyPayment={() => handleViewChange('partyPayment')}
        onOpenPumpPaymentRegister={() => handleViewChange('pumpPaymentRegister')}
      />
    );
  }

  if (currentView === 'aiExtraExpense') {
    return <AiExtraExpense onBack={() => handleViewChange('dashboard')} />;
  }

  if (currentView === 'incentiveCalculationSheet') {
    return <IncentiveCalculationSheet onBack={() => handleViewChange('dashboard')} />;
  }

  if (currentView === 'attendancePanel') {
    return <AttendancePanel onBack={() => handleViewChange('dashboard')} />;
  }

  if (currentView === 'tdsReports') {
    return <TdsReportsPage onBack={() => handleViewChange('dashboard')} />;
  }

  if (currentView === 'othersCreditor') {
    return <OthersCreditor onBack={() => handleViewChange('dashboard')} />;
  }

  if (currentView === 'dashboard') {
    if (isMobile) {
      if (user.role === 'PETROL PUMP') {
        return (
          <PumpPortal
            onOpenBillingSheet={() => handleViewChange('pumpPayment')}
            onRegisterBiometrics={() => {
              alert("Biometric registration is initiated. Please follow the system prompt.");
            }}
          />
        );
      }
      if (import.meta.env.VITE_PORTAL === 'site' || user.role === 'OFFICE') {
        return (
          <SitePortal
            onUploadNew={() => handleViewChange('upload')}
            onOpenLorrySlip={(id) => { setLorrySlipInvoiceId(id); handleViewChange('lorryHireSlip'); }}
            onOpenFuelSlip={(id) => { setFuelSlipInvoiceId(id); handleViewChange('fuelSlip'); }}
            onOpenRegisters={() => handleViewChange('cementRegister')}
            onOpenVouchers={() => handleViewChange('voucherRegister')}
          />
        );
      }
      return (
        <OfficePortal
          onUploadNew={() => handleViewChange('upload')}
          onOpenLorrySlip={(id) => { setLorrySlipInvoiceId(id); handleViewChange('lorryHireSlip'); }}
          onOpenFuelSlip={(id) => { setFuelSlipInvoiceId(id); handleViewChange('fuelSlip'); }}
          onOpenFuelRateSettings={() => handleViewChange('fuelRateSettings')}
          onOpenVouchers={() => handleViewChange('voucherRegister')}
          onOpenContacts="truckManager"
          onOpenAccountApprovals={() => handleViewChange('accountApprovals')}
        />
      );
    }

    // Desktop Routing
    if (user.role === 'PETROL PUMP') {
      return (
        <PumpDashboard
          onOpenPumpPayment={() => handleViewChange('pumpPayment')}
        />
      );
    }

    return (
      <Dashboard
        onUploadNew={() => handleViewChange('upload')}
        onOpenLorrySlip={(id) => { setLorrySlipInvoiceId(id); handleViewChange('lorryHireSlip'); }}
        onOpenFuelSlip={(id) => { setFuelSlipInvoiceId(id); handleViewChange('fuelSlip'); }}
        onOpenCementRegister={() => handleViewChange('cementRegister')}
        onOpenVoucherRegister={() => handleViewChange('voucherRegister')}
        onOpenGSTPortalRegister={() => handleViewChange('gstPortalRegister')}
        onOpenMainCashbook={() => handleViewChange('mainCashbook')}
        onOpenPumpPayment={() => handleViewChange('pumpPayment')}
        onOpenPumpPaymentRegister={() => handleViewChange('pumpPaymentRegister')}
        onOpenPartyPayment={() => handleViewChange('partyPayment')}
        onOpenFYDetails={() => handleViewChange('fyDetails')}
        onOpenTotalPaymentReports={() => handleViewChange('totalPaymentReports')}
        onOpenPieChart={() => handleViewChange('pieChart')}
        onOpenFuelRateSettings={() => handleViewChange('fuelRateSettings')}
        onOpenAccountDetails={() => handleViewChange('accountDetails')}
        onOpenAccountApprovals={() => handleViewChange('accountApprovals')}
        onOpenDailySummaryReport={() => handleViewChange('dailySummary')}
        onOpenAiExtraExpense={() => handleViewChange('aiExtraExpense')}
        onOpenIncentiveSheet={() => handleViewChange('incentiveCalculationSheet')}
        onOpenAttendancePanel={() => handleViewChange('attendancePanel')}
        onOpenTdsReports={() => handleViewChange('tdsReports')}
        onOpenOthersCreditor={() => handleViewChange('othersCreditor')}
      />
    );
  }


  return (
    <InvoiceForm onBack={() => handleViewChange('dashboard')} />
  );
  };

  return (
    <>
      <VantaTrunkBackground />
      <Box sx={{
          minHeight: '100vh',
          bgcolor: 'rgba(15, 20, 25, 0.2)', // Subtle dark overlay for Vanta
          transition: 'opacity 0.3s ease',
          opacity: isTransitioning ? 0 : 1
      }}>
        {renderView()}
      </Box>
    </>
  );
}

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <ShortcutProvider>
        <AuthProvider>
          <GlobalShortcutHandler />
          <AppContent />
        </AuthProvider>
      </ShortcutProvider>
    </ThemeProvider>
  );
}

export default App;
