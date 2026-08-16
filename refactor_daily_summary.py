import re

with open('frontend/review-dashboard/UI2/src/pages/DailySummaryReport.jsx', 'r') as f:
    content = f.read()

# Replace the component signature
content = content.replace(
    "export default function DailySummaryReport({ \n  onBack, \n  onUploadNew, \n  onOpenCementRegister, \n  onOpenPartyPayment, \n  onOpenPumpPaymentRegister \n}) {",
    "function DailySummaryTab({ \n  onBack, \n  onUploadNew, \n  onOpenCementRegister, \n  onOpenPartyPayment, \n  onOpenPumpPaymentRegister,\n  mainTab,\n  setMainTab\n}) {"
)

# Insert the tabs in the sticky header
header_find = """        <Box display="flex" alignItems="center" gap={1.5}>
          <IconButton onClick={onBack} sx={{ color: '#0f172a', bgcolor: '#f1f5f9', '&:hover': { bgcolor: '#e2e8f0' } }}>
            <ArrowBackIcon />
          </IconButton>
          <Box>
            <Typography variant="h5" fontWeight={900} sx={{ letterSpacing: '-0.5px' }}>
                Daily Operations Dashboard
            </Typography>
            <Typography variant="caption" color="text.secondary" fontWeight={600}>
                Live operational metrics and invoice processing
            </Typography>
          </Box>
        </Box>"""

header_replace = header_find + """
        <Box sx={{ flexGrow: 1, display: 'flex', justifyContent: 'center' }}>
          <Tabs 
            value={mainTab} 
            onChange={(e, v) => setMainTab(v)}
            sx={{
              minHeight: 40,
              '& .MuiTab-root': {
                  minHeight: 40,
                  borderRadius: 2,
                  textTransform: 'none',
                  fontWeight: 800,
                  px: 3,
                  mx: 1,
                  transition: 'all 0.3s ease'
              },
              '& .Mui-selected': {
                  bgcolor: '#0f172a',
                  color: '#fff !important',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
              }
            }}
            TabIndicatorProps={{ style: { display: 'none' } }}
          >
            <Tab label="Daily Summary Report" />
            <Tab label="ALL PARTY REPORTS" />
          </Tabs>
        </Box>"""

content = content.replace(header_find, header_replace)

# Append the new components to the end
new_components = """

// ==========================================
// NEW: ALL PARTY REPORTS TAB SKELETON
// ==========================================
function AllPartyReportsTab({ onBack, mainTab, setMainTab }) {
  return (
    <Box sx={{ bgcolor: '#f4f7fa', minHeight: '100vh', pb: 6 }}>
      {/* --- Sticky Header --- */}
      <Box sx={{
        position: 'sticky', top: 0, zIndex: 10,
        bgcolor: '#ffffff', color: '#0f172a',
        px: { xs: 2, md: 4 }, py: 2,
        boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.1)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
      }}>
        <Box display="flex" alignItems="center" gap={1.5}>
          <IconButton onClick={onBack} sx={{ color: '#0f172a', bgcolor: '#f1f5f9', '&:hover': { bgcolor: '#e2e8f0' } }}>
            <ArrowBackIcon />
          </IconButton>
          <Box>
            <Typography variant="h5" fontWeight={900} sx={{ letterSpacing: '-0.5px' }}>
                Daily Operations Dashboard
            </Typography>
            <Typography variant="caption" color="text.secondary" fontWeight={600}>
                All Party Reports Module
            </Typography>
          </Box>
        </Box>

        <Box sx={{ flexGrow: 1, display: 'flex', justifyContent: 'center' }}>
          <Tabs 
            value={mainTab} 
            onChange={(e, v) => setMainTab(v)}
            sx={{
              minHeight: 40,
              '& .MuiTab-root': {
                  minHeight: 40,
                  borderRadius: 2,
                  textTransform: 'none',
                  fontWeight: 800,
                  px: 3,
                  mx: 1,
                  transition: 'all 0.3s ease'
              },
              '& .Mui-selected': {
                  bgcolor: '#0f172a',
                  color: '#fff !important',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
              }
            }}
            TabIndicatorProps={{ style: { display: 'none' } }}
          >
            <Tab label="Daily Summary Report" />
            <Tab label="ALL PARTY REPORTS" />
          </Tabs>
        </Box>
        
        <Box sx={{ width: 170 }}>
            {/* Placeholder for future tools */}
        </Box>
      </Box>

      <Box sx={{ px: { xs: 2, md: 4 }, mt: 4, maxWidth: '1600px', mx: 'auto' }}>
        <Typography variant="subtitle2" fontWeight={800} color="text.secondary" mb={1.5} sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>
          All Party Reports
        </Typography>
        <Card sx={{ borderRadius: '16px', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0', mb: 4, overflow: 'hidden', p: 4, textAlign: 'center' }}>
            <Typography variant="h6" color="text.secondary" fontWeight={700}>
                Party Reports module is currently under construction.
            </Typography>
            <Typography variant="body2" color="text.secondary" mt={1}>
                This section will connect to existing project data without requiring duplicate entry.
            </Typography>
        </Card>
      </Box>
    </Box>
  );
}

// ==========================================
// WRAPPER MODULE
// ==========================================
export default function DailySummaryReport(props) {
  const [mainTab, setMainTab] = useState(0);

  if (mainTab === 0) {
    return <DailySummaryTab {...props} mainTab={mainTab} setMainTab={setMainTab} />;
  } else {
    return <AllPartyReportsTab {...props} mainTab={mainTab} setMainTab={setMainTab} />;
  }
}
"""

content += new_components

with open('frontend/review-dashboard/UI2/src/pages/DailySummaryReport.jsx', 'w') as f:
    f.write(content)

print("Done!")
