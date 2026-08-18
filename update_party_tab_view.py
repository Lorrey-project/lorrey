import re

with open('frontend/review-dashboard/UI2/src/pages/DailySummaryReport.jsx', 'r') as f:
    content = f.read()

# Add import
if 'import PartyReportView from' not in content:
    content = content.replace("import * as XLSX from 'xlsx';", "import * as XLSX from 'xlsx';\nimport PartyReportView from './PartyReportView';")

# Update AllPartyReportsTab
new_tab_component = """
function AllPartyReportsTab({ onBack, mainTab, setMainTab }) {
  const [parties, setParties] = useState([]);
  const [ownerDetailsMap, setOwnerDetailsMap] = useState({});
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [snack, setSnack] = useState(null);
  const [selectedParty, setSelectedParty] = useState(null);

  useEffect(() => {
    fetchParties();
  }, []);

  const fetchParties = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_URL}/voucher/contacts`);
      if (res.data.success) {
        setParties(res.data.names || []);
        setOwnerDetailsMap(res.data.ownerDetails || {});
      }
    } catch (err) {
      console.error(err);
      setSnack({ msg: 'Failed to fetch party names', severity: 'error' });
    } finally {
      setLoading(false);
    }
  };

  if (selectedParty) {
    return (
      <PartyReportView 
        partyName={selectedParty} 
        ownerDetails={ownerDetailsMap[selectedParty] || {}} 
        onBack={() => setSelectedParty(null)} 
      />
    );
  }

  const filteredParties = parties.filter(p => p.toLowerCase().includes(searchTerm.toLowerCase()));

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
            <Tab label="Summary Reports" />
            <Tab label="ALL PARTY REPORTS" />
          </Tabs>
        </Box>
        
        <Box sx={{ width: 170 }}>
            <Tooltip title="Refresh Data">
              <IconButton onClick={fetchParties} sx={{ color: '#0f172a', bgcolor: '#f1f5f9', '&:hover': { bgcolor: '#e2e8f0' } }}>
                <RefreshIcon />
              </IconButton>
            </Tooltip>
        </Box>
      </Box>

      <Box sx={{ px: { xs: 2, md: 4 }, mt: 4, maxWidth: '1600px', mx: 'auto' }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="subtitle2" fontWeight={800} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>
              All Party Reports
            </Typography>
            <TextField
              size="small"
              placeholder="Search Party Name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
              sx={{ width: 300, bgcolor: '#fff', borderRadius: 1 }}
            />
        </Box>

        <Card sx={{ borderRadius: '16px', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0', mb: 4, overflow: 'hidden' }}>
            {loading ? (
                <Box display="flex" justifyContent="center" p={4}>
                    <CircularProgress />
                </Box>
            ) : (
                <List disablePadding>
                    {filteredParties.map((party, index) => (
                        <React.Fragment key={party}>
                            <ListItem sx={{ py: 2, px: 3, '&:hover': { bgcolor: '#f8fafc' }, transition: 'background 0.2s' }}>
                                <ListItemIcon sx={{ minWidth: 40 }}>
                                    <Typography variant="body2" fontWeight={700} color="text.secondary">
                                        {String(index + 1).padStart(2, '0')}.
                                    </Typography>
                                </ListItemIcon>
                                <ListItemText 
                                    primary={
                                        <Typography variant="subtitle1" fontWeight={800} color="#0f172a">
                                            {party}
                                        </Typography>
                                    } 
                                />
                                <Button 
                                    variant="outlined" 
                                    size="small" 
                                    onClick={() => setSelectedParty(party)}
                                    endIcon={<ArrowBackIcon sx={{ transform: 'rotate(180deg)' }} />}
                                    sx={{ borderRadius: '8px', fontWeight: 700, textTransform: 'none' }}
                                >
                                    View Report
                                </Button>
                            </ListItem>
                            {index < filteredParties.length - 1 && <Divider />}
                        </React.Fragment>
                    ))}
                    {filteredParties.length === 0 && (
                        <Box p={4} textAlign="center">
                            <Typography variant="body1" color="text.secondary" fontWeight={600}>
                                No party names found.
                            </Typography>
                        </Box>
                    )}
                </List>
            )}
        </Card>
      </Box>

      <Snackbar
        open={!!snack}
        autoHideDuration={6000}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setSnack(null)} severity={snack?.severity || 'info'} sx={{ width: '100%', fontWeight: 700 }}>
          {snack?.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}
"""

content = re.sub(r'function AllPartyReportsTab\({.*?^}\n', new_tab_component, content, flags=re.MULTILINE | re.DOTALL)

with open('frontend/review-dashboard/UI2/src/pages/DailySummaryReport.jsx', 'w') as f:
    f.write(content)

print("Done!")
