import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import IncentiveAnalysis from '../components/IncentiveAnalysis';
import { applyCalcs } from '../utils/cementCalculations';
import { Box, CircularProgress, Typography } from '@mui/material';

const API_URL = import.meta.env.VITE_API_URL;

export default function IncentiveCalculationSheet({ onBack }) {
    const now = useMemo(() => new Date(), []);
    const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1); // 1-12
    const [selectedYear, setSelectedYear] = useState(now.getFullYear());
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const res = await axios.get(`${API_URL}/cement-register`, {
                params: {
                    month: selectedMonth,
                    year: selectedYear
                }
            });
            if (res.data.success) {
                setEntries(res.data.entries);
            }
        } catch (e) {
            console.error('Fetch failed:', e);
        } finally {
            setLoading(false);
        }
    }, [selectedMonth, selectedYear]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const computedRows = useMemo(() => {
        return entries.map(row => applyCalcs(row));
    }, [entries]);

    if (loading) {
        return (
            <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" height="100vh" gap={2}>
                <CircularProgress size={48} thickness={4} sx={{ color: '#7c3aed' }} />
                <Typography color="text.secondary" fontWeight={600}>Loading Incentive Data…</Typography>
            </Box>
        );
    }

    return (
        <IncentiveAnalysis
            rows={computedRows}
            initialMonth={selectedMonth - 1} // 0-11 for JS dates
            initialYear={selectedYear}
            onPeriodChange={(y, m) => {
                setSelectedYear(y);
                setSelectedMonth(m);
            }}
            onBack={onBack}
        />
    );
}
