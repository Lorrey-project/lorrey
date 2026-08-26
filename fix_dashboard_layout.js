const fs = require('fs');
const path = 'frontend/review-dashboard/UI2/src/components/Dashboard.jsx';
let content = fs.readFileSync(path, 'utf8');

const returnStart = content.indexOf('    return (\n        <>\n            <Container');
const dialogStart = content.indexOf('                    <Dialog');

if (returnStart === -1 || dialogStart === -1) {
    console.error("Could not find boundaries");
    process.exit(1);
}

const beforeReturn = content.substring(0, returnStart);
const afterDialogs = content.substring(dialogStart);

const newLayout = `    return (
        <>
            <Container maxWidth="xl" sx={{ mt: { xs: 2, md: 4 }, mb: 4, px: { xs: 1, sm: 2, md: 3 } }}>

                {/* ── Header ─────────────────────────────────────────────── */}
                <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={4}
                    sx={{ flexDirection: { xs: 'column', md: 'row' }, gap: { xs: 3, md: 2 } }}>
                    <Box sx={{ width: { xs: '100%', md: 'auto' } }}>
                        <Typography variant="h3" fontWeight="900" color="primary"
                            sx={{ letterSpacing: '-1.5px', fontSize: { xs: '2rem', sm: '2.4rem', md: '2.8rem' }, textAlign: { xs: 'center', md: 'left' }, color: '#1a202c' }}>
                            DIPALI ASSOCIATES & CO
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.5, mt: 0.5, justifyContent: { xs: 'center', md: 'flex-start' } }}>
                            <Typography variant="subtitle1" color="text.secondary" fontWeight="500" sx={{ opacity: 0.8 }}>
                                Premium Slip & Invoice Management Portal [Role: {user?.role === 'OFFICE' ? 'Site-office' : (user?.role === 'HEAD_OFFICE' ? 'Head-office' : user?.role) || 'NONE'}]
                            </Typography>
                            {user?.role === 'HEAD_OFFICE' && portalStatuses.length > 0 && (
                                <Box sx={{ display: 'flex', gap: 1, borderLeft: { xs: 'none', md: '2px solid #e2e8f0' }, pl: { xs: 0, md: 1.5 } }}>
                                    {portalStatuses.map(ps => (
                                        <Tooltip key={ps.id} title={\`\${ps.name} is \${ps.active ? 'Online' : 'Offline'}\`}>
                                            <Chip 
                                                size="small" 
                                                label={ps.name.split(' ')[0]} 
                                                sx={{ 
                                                    height: 20, fontSize: '0.65rem', fontWeight: 800,
                                                    bgcolor: ps.active ? '#dcfce7' : '#fee2e2',
                                                    color: ps.active ? '#166534' : '#991b1b',
                                                    border: \`1px solid \${ps.active ? '#bbf7d0' : '#fecaca'}\`,
                                                    '& .MuiChip-label': { px: 1 }
                                                }}
                                            />
                                        </Tooltip>
                                    ))}
                                </Box>
                            )}
                        </Box>
                    </Box>
                    <Box display="flex" gap={2}
                        sx={{ width: { xs: '100%', md: 'auto' }, justifyContent: { xs: 'center', md: 'flex-end' } }}>
                        <Button variant="outlined" color="primary" startIcon={<FingerprintIcon />} onClick={handleRegisterBiometrics}
                            sx={{ borderRadius: '8px', px: { xs: 2.5, sm: 3 }, fontWeight: 700, flex: { xs: 1, md: 'none' } }}>
                            Register Biometrics
                        </Button>

                        {/* ── Pending Approvals Bell (HEAD_OFFICE only) ── */}
                        {user?.role === 'HEAD_OFFICE' && (
                            <Tooltip title={pendingCount > 0 ? \`\${pendingCount} pending approval request\${pendingCount !== 1 ? 's' : ''}\` : 'No pending approvals'}>
                                <Badge badgeContent={pendingCount} color="error" max={99}
                                    sx={{ '& .MuiBadge-badge': { fontWeight: 900, fontSize: 10 } }}>
                                    <IconButton
                                        onClick={onOpenAccountApprovals}
                                        sx={{
                                            bgcolor: pendingCount > 0 ? '#ede9fe' : '#f1f5f9',
                                            border: pendingCount > 0 ? '2px solid #7c3aed' : '2px solid #e2e8f0',
                                            borderRadius: '8px',
                                            transition: 'all 0.2s',
                                            '&:hover': { bgcolor: '#ede9fe', borderColor: '#7c3aed' }
                                        }}>
                                        <PersonAddAlt1Icon sx={{ color: pendingCount > 0 ? '#7c3aed' : '#94a3b8', fontSize: 22 }} />
                                    </IconButton>
                                </Badge>
                            </Tooltip>
                        )}
                        <IconButton onClick={logout} sx={{ bgcolor: '#fef2f2', color: '#dc2626', borderRadius: '8px', '&:hover': { bgcolor: '#fee2e2' } }}>
                            <LogoutIcon />
                        </IconButton>
                        <Button variant="contained" color="primary" startIcon={<AddIcon />} onClick={onUploadClick}
                            sx={{ borderRadius: '8px', px: { xs: 2.5, sm: 3 }, fontWeight: 700, boxShadow: '0 4px 14px 0 rgba(0,118,255,0.39)', flex: { xs: 1, md: 'none' } }}>
                            New Trip
                        </Button>
                    </Box>
                </Box>

                <Divider sx={{ mb: 4 }} />

                {/* ── Hero Section ─────────────────────────────────────────────── */}
                <Grid container spacing={3} sx={{ mb: 5 }}>
                    <Grid item xs={12} md={8}>
                        <Card sx={{
                            borderRadius: '16px', bgcolor: '#f0f4f8', color: '#1a202c', height: '100%',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0',
                            display: 'flex', flexDirection: 'column', justifyContent: 'center'
                        }}>
                            <CardContent sx={{ p: { xs: 3, md: 5 } }}>
                                <Typography variant="h4" fontWeight={900} mb={1}>INVOICE MANAGEMENT</Typography>
                                <Typography variant="subtitle1" color="text.secondary" mb={4} sx={{ maxWidth: '600px' }}>
                                    Upload, manage and process new logistics trips. Verify trip metrics, compute distances and securely store your invoices in the vault.
                                </Typography>
                                <Box display="flex" gap={2}>
                                    <Button variant="contained" color="primary" startIcon={<AddIcon />} onClick={onUploadClick}
                                        sx={{ borderRadius: '8px', px: 4, py: 1.5, fontWeight: 700 }}>
                                        Upload New Trip
                                    </Button>
                                    <Button variant="outlined" color="primary" startIcon={<StorageIcon />} onClick={() => setVaultOpen(true)}
                                        sx={{ borderRadius: '8px', px: 4, py: 1.5, fontWeight: 700, bgcolor: 'white' }}>
                                        Open Vault
                                    </Button>
                                </Box>
                            </CardContent>
                        </Card>
                    </Grid>
                    <Grid item xs={12} md={4}>
                        <Card sx={{
                            borderRadius: '16px', bgcolor: '#6b46c1', color: '#fff', height: '100%',
                            boxShadow: '0 10px 25px rgba(107, 70, 193, 0.3)',
                            display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
                        }}>
                            <CardContent sx={{ p: { xs: 3, md: 4 } }}>
                                <Box display="flex" alignItems="center" gap={2} mb={2}>
                                    <Box sx={{ p: 1.5, bgcolor: 'rgba(255,255,255,0.2)', borderRadius: '12px' }}>
                                        <AssignmentIcon sx={{ fontSize: 32 }} />
                                    </Box>
                                    <Typography variant="h5" fontWeight={900}>SUMMARY REPORTS</Typography>
                                </Box>
                                <Typography variant="body2" sx={{ opacity: 0.9, mb: 3 }}>
                                    Live operational overview and statistics for today's transactions.
                                </Typography>
                                {todayStats && (
                                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 3 }}>
                                        <Box>
                                            <Typography variant="caption" sx={{ opacity: 0.8, fontWeight: 700 }}>Invoices Uploaded</Typography>
                                            <Typography variant="h4" fontWeight={900}>{todayStats?.invoiceStats?.totalUploaded || 0}</Typography>
                                        </Box>
                                        <Box>
                                            <Typography variant="caption" sx={{ opacity: 0.8, fontWeight: 700 }}>Pending Review</Typography>
                                            <Typography variant="h4" fontWeight={900} color={todayStats?.invoiceStats?.pendingInvoices > 0 ? '#f6ad55' : 'inherit'}>
                                                {todayStats?.invoiceStats?.pendingInvoices || 0}
                                            </Typography>
                                        </Box>
                                    </Box>
                                )}
                                <Button
                                    fullWidth variant="contained"
                                    startIcon={<VisibilityIcon />}
                                    onClick={(e) => { e.stopPropagation(); onOpenDailySummaryReport(); }}
                                    sx={{
                                        borderRadius: '8px', py: 1.5, fontWeight: 800,
                                        bgcolor: 'white', color: '#6b46c1',
                                        '&:hover': { bgcolor: '#f7fafc' }
                                    }}
                                >
                                    Open Today's Dashboard
                                </Button>
                            </CardContent>
                        </Card>
                    </Grid>
                </Grid>

                {/* ── Helper Component for Cards ─────────────────────────────────────────────── */}
                {(() => {
                    const ActionCard = ({ title, subtitle, icon, bg, color, onClick }) => (
                        <Grid item xs={12} sm={6} md={4} lg={3}>
                            <Card sx={{
                                borderRadius: '12px', bgcolor: bg || 'white', color: color || '#1a202c',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0',
                                cursor: 'onClick' in {onClick} ? 'pointer' : 'default', transition: 'all 0.2s ease',
                                '&:hover': onClick ? { transform: 'translateY(-2px)', boxShadow: '0 8px 16px rgba(0,0,0,0.1)' } : {}
                            }} onClick={onClick}>
                                <CardContent sx={{ p: 2.5, display: 'flex', alignItems: 'center', gap: 2 }}>
                                    <Box sx={{ p: 1.5, bgcolor: color === '#fff' ? 'rgba(255,255,255,0.2)' : '#f1f5f9', borderRadius: '8px', color: color === '#fff' ? '#fff' : '#64748b' }}>
                                        {icon}
                                    </Box>
                                    <Box>
                                        <Typography variant="subtitle2" fontWeight={800}>{title}</Typography>
                                        <Typography variant="caption" sx={{ opacity: color === '#fff' ? 0.9 : 0.6, fontWeight: 500 }}>{subtitle}</Typography>
                                    </Box>
                                </CardContent>
                            </Card>
                        </Grid>
                    );

                    return (
                        <>
                            {/* ── High Priority Registers ─────────────────────────── */}
                            <Box mb={5}>
                                <Typography variant="h6" fontWeight={800} sx={{ color: '#334155', mb: 2 }}>HIGH PRIORITY REGISTERS</Typography>
                                <Grid container spacing={2}>
                                    <ActionCard title="CEMENT REGISTER" subtitle="Trip & Freight Logic" icon={<LocalShippingIcon />} bg="#1e3a8a" color="#fff" onClick={onOpenCementRegister} />
                                    <ActionCard title="BILL REGISTER" subtitle="Pending & Cleared Bills" icon={<TableChartIcon />} bg="#0f172a" color="#fff" onClick={onOpenFYDetails} />
                                    <ActionCard title="PARTY PAYMENT DETAILS" subtitle="Aggregated Monthly Ledger" icon={<AccountBalanceWalletIcon />} bg="#b91c1c" color="#fff" onClick={onOpenPartyPayment} />
                                </Grid>
                            </Box>

                            {/* ── Financial Management ─────────────────────────── */}
                            <Box mb={5}>
                                <Typography variant="h6" fontWeight={800} sx={{ color: '#334155', mb: 2 }}>FINANCIAL MANAGEMENT</Typography>
                                <Grid container spacing={2}>
                                    <ActionCard title="BANK BOOK" subtitle="Transactions & Balances" icon={<AccountBalanceWalletIcon />} bg="#047857" color="#fff" onClick={onOpenAccountDetails} />
                                    <ActionCard title="MAIN CASH BOOK" subtitle="Daily Cash Flow" icon={<DescriptionIcon />} bg="#0f766e" color="#fff" onClick={onOpenMainCashbook} />
                                    <ActionCard title="PUMP PAYMENT DETAILS" subtitle="Clear Pump Dues" icon={<LocalGasStationIcon />} bg="#0284c7" color="#fff" onClick={onOpenPumpPayment} />
                                    <ActionCard title="PUMP PAYMENT REGISTER" subtitle="Payment Register" icon={<ReceiptLongIcon />} bg="#0369a1" color="#fff" onClick={onOpenPumpPaymentRegister} />
                                    <ActionCard title="INCENTIVE ENTRY" subtitle="Complete/Manage Incentives" icon={<PersonIcon />} bg="white" color="#1a202c" onClick={onOpenIncentiveSheet} />
                                </Grid>
                            </Box>

                            {/* ── Reports / Data & Services ─────────────────────────── */}
                            <Box mb={5}>
                                <Typography variant="h6" fontWeight={800} sx={{ color: '#334155', mb: 2 }}>REPORTS / DATA & SERVICES</Typography>
                                <Grid container spacing={2}>
                                    <ActionCard title="GST / GSTR-1" subtitle="Tax Portal Ledger" icon={<ReceiptIcon />} bg="#86198f" color="#fff" onClick={onOpenGSTPortalRegister} />
                                    <ActionCard title="TOTAL INCOMING & OUTGOING" subtitle="Payment Reports" icon={<AccountBalanceWalletIcon />} bg="white" color="#1a202c" onClick={onOpenTotalPaymentReports} />
                                    <ActionCard title="PIE CHART" subtitle="Financial Analytics" icon={<PieChartIcon />} bg="white" color="#1a202c" onClick={onOpenPieChart} />
                                    <ActionCard title="AI EXTRA EXPENSE" subtitle="AI Expense Management" icon={<AutoAwesomeIcon />} bg="#4c1d95" color="#fff" onClick={onOpenAiExtraExpense} />
                                    <ActionCard title="OWNER & VEHICLES" subtitle="Fleet Directory" icon={<LocalShippingIcon />} bg="white" color="#1a202c" onClick={() => setTruckManagerOpen(true)} />
                                    <ActionCard title="VOUCHER HISTORY" subtitle="Approved Payouts" icon={<HistoryIcon />} bg="white" color="#1a202c" onClick={() => { setVoucherDialogTab(1); setVoucherDialogOpen(true); }} />
                                    {user?.role === 'HEAD_OFFICE' && (
                                        <ActionCard title="FUEL RATE SETTINGS" subtitle="Global Station Pricing" icon={<LocalGasStationIcon />} bg="white" color="#1a202c" onClick={onOpenFuelRateSettings} />
                                    )}
                                    {user?.role === 'HEAD_OFFICE' && (
                                        <ActionCard title="ACCOUNT APPROVALS" subtitle="Manage Staff Requests" icon={<PersonAddAlt1Icon />} bg="white" color="#1a202c" onClick={onOpenAccountApprovals} />
                                    )}
                                    <ActionCard title="ATTENDANCE PANEL" subtitle="Daily Clock Ins" icon={<PersonIcon />} bg="white" color="#1a202c" onClick={onOpenAttendancePanel} />
                                </Grid>
                            </Box>
                        </>
                    );
                })()}

`;

content = beforeReturn + newLayout + afterDialogs;

// We also need to remove CinematicSystem import from Dashboard.jsx
content = content.replace("import { Hero3DObject, ModuleCard3D } from './CinematicSystem';\n", "");

fs.writeFileSync(path, content, 'utf8');
console.log('Layout patched successfully.');
