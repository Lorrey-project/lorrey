import React, { useEffect } from 'react';
import {
    Card, CardHeader, CardContent, TextField, IconButton, Button, Box, Typography, Divider
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import { toIndianWords } from '../utils/toIndianWords';

export default function ItemsTable({ items = [], amountSummary = {}, onChange, errors }) {

    // Auto-calculate bags on initial load if AI only provided quantity, and backfill net_payable from global summary
    useEffect(() => {
        if (!items || items.length === 0) return;
        let needsUpdate = false;
        
        const mapped = items.map((item, idx) => {
            let updated = { ...item };
            
            if (item.quantity && !item.bags) {
                const q = parseFloat(String(item.quantity).replace(/,/g, ''));
                if (!isNaN(q)) {
                    needsUpdate = true;
                    updated.bags = String(Math.round(q * 20));
                }
            }
            
            // Only backfill net_payable for the first item from the global invoice sum if it's completely empty
            if (idx === 0 && amountSummary?.net_payable && !updated.net_payable) {
                needsUpdate = true;
                updated.net_payable = amountSummary.net_payable;
            }
            
            return updated;
        });
        
        if (needsUpdate) {
            onChange('items', null, mapped);
        }
    }, [items, amountSummary, onChange]);

    const handleItemChange = (index, field, value) => {
        const newItems = [...items];
        let updatedItem = { ...newItems[index], [field]: value };
        
        // Auto-calculate bags from quantity (1 MT = 20 bags)
        if (field === 'quantity' && value !== '') {
            const qty = parseFloat(String(value).replace(/,/g, ''));
            if (!isNaN(qty)) {
                updatedItem.bags = String(Math.round(qty * 20));
            } else {
                updatedItem.bags = '';
            }
        }
        
        newItems[index] = updatedItem;
        onChange('items', null, newItems);
    };

    const handleAddItem = () => {
        const newItem = {
            description_of_product: '',
            hsn_code: '',
            bags: '',
            quantity: '',
            uom: '',
            taxable_value: ''
        };
        onChange('items', null, [...items, newItem]);
    };

    const handleDeleteItem = (index) => {
        const newItems = items.filter((_, i) => i !== index);
        onChange('items', null, newItems);
    };

    return (
        <Card sx={{ mb: 3, boxShadow: 0, border: '1px solid #e0e0e0', borderRadius: 2 }}>
            <CardHeader title="Items Details" sx={{ bgcolor: '#f5f5f5', borderBottom: '1px solid #e0e0e0' }} />
            <CardContent>
                {items.map((item, index) => {
                    const itemErrors = errors?.[index] || {};
                    return (
                        <Box key={index} sx={{ mb: 4, p: 3, border: '1px solid #e0e0e0', borderRadius: 2, bgcolor: '#fafafa', position: 'relative' }}>
                            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                                <Typography variant="h6" color="text.secondary">Item #{index + 1}</Typography>
                                <IconButton color="error" onClick={() => handleDeleteItem(index)}>
                                    <DeleteIcon />
                                </IconButton>
                            </Box>
                            <Divider sx={{ mb: 3 }} />

                            <Box display="flex" flexDirection="column" gap={3}>
                                <TextField
                                    fullWidth
                                    label="Description of Product"
                                    value={item.description_of_product || ''}
                                    onChange={(e) => handleItemChange(index, 'description_of_product', e.target.value)}
                                    variant="outlined"
                                />
                                <TextField
                                    fullWidth
                                    label="HSN Code"
                                    value={item.hsn_code || ''}
                                    onChange={(e) => handleItemChange(index, 'hsn_code', e.target.value)}
                                    variant="outlined"
                                />
                                <TextField
                                    fullWidth
                                    label="Quantity (MT)"
                                    value={item.quantity || ''}
                                    onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                                    error={!!itemErrors.quantity}
                                    helperText={itemErrors.quantity || "Enter MT to auto-calculate bags"}
                                    variant="outlined"
                                />
                                <TextField
                                    fullWidth
                                    label="Bags"
                                    value={item.bags || ''}
                                    onChange={(e) => handleItemChange(index, 'bags', e.target.value)}
                                    variant="outlined"
                                    helperText="Editable override. Auto-calculated as Quantity × 20."
                                />
                                <TextField
                                    fullWidth
                                    label="UOM"
                                    value={item.uom || ''}
                                    onChange={(e) => handleItemChange(index, 'uom', e.target.value)}
                                    variant="outlined"
                                />
                                <TextField
                                    fullWidth
                                    label="Net Payable Amount"
                                    value={item.net_payable || ''}
                                    onChange={(e) => handleItemChange(index, 'net_payable', e.target.value)}
                                    error={!!itemErrors.net_payable}
                                    helperText={itemErrors.net_payable || "Total Invoice Amount"}
                                    variant="outlined"
                                />
                                {item.net_payable && !isNaN(parseFloat(String(item.net_payable).replace(/,/g, ''))) && (
                                    <TextField
                                        fullWidth
                                        label="Net Payable Amount In Words"
                                        value={toIndianWords(parseFloat(String(item.net_payable).replace(/,/g, '')))}
                                        variant="outlined"
                                        InputProps={{ readOnly: true }}
                                        sx={{
                                            '& .MuiOutlinedInput-root': { bgcolor: '#f1f5f9' },
                                            '& .MuiInputBase-input': { color: '#475569', cursor: 'not-allowed', fontStyle: 'italic', fontWeight: 700 }
                                        }}
                                    />
                                )}
                            </Box>
                        </Box>
                    );
                })}
                {items.length === 0 && (
                    <Typography variant="body1" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                        No items added yet. Click the button below to add an item.
                    </Typography>
                )}
                <Button
                    variant="outlined"
                    startIcon={<AddIcon />}
                    onClick={handleAddItem}
                    sx={{ mt: 2 }}
                >
                    Add New Item
                </Button>
            </CardContent>
        </Card>
    );
}
