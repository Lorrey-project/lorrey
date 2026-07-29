import React, { useState, useEffect, useRef } from 'react';
import { Box, InputBase, IconButton, Typography, Paper, Tooltip } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import { globalSearch } from '../utils/domSearch';

export default function SearchOverlay({ open, onClose }) {
  const [query, setQuery] = useState('');
  const [matchCount, setMatchCount] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      globalSearch.clear();
      setQuery('');
      setMatchCount(0);
      setCurrentIndex(0);
    }
  }, [open]);

  useEffect(() => {
    // Debounce the search slightly so we don't block the main thread too heavily while typing
    const timer = setTimeout(() => {
      if (query.trim().length >= 1) {
        const count = globalSearch.search(query);
        setMatchCount(count);
        setCurrentIndex(count > 0 ? 1 : 0);
      } else {
        globalSearch.clear();
        setMatchCount(0);
        setCurrentIndex(0);
      }
    }, 250);
    
    return () => clearTimeout(timer);
  }, [query]);

  const handleNext = () => {
    if (matchCount > 0) {
      globalSearch.next();
      setCurrentIndex((prev) => (prev % matchCount) + 1);
    }
  };

  const handlePrev = () => {
    if (matchCount > 0) {
      globalSearch.prev();
      setCurrentIndex((prev) => (prev === 1 ? matchCount : prev - 1));
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) handlePrev();
      else handleNext();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!open) return null;

  return (
    <Paper
      elevation={4}
      sx={{
        position: 'fixed',
        top: 16,
        right: 16,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        padding: '4px 8px',
        borderRadius: 2,
        minWidth: 300,
        backgroundColor: '#fff'
      }}
    >
      <InputBase
        inputRef={inputRef}
        sx={{ ml: 1, flex: 1, fontSize: '0.95rem' }}
        placeholder="Find in page (Ctrl+F)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      
      <Typography variant="body2" sx={{ color: 'text.secondary', mr: 1, minWidth: '40px', textAlign: 'center' }}>
        {matchCount > 0 ? `${currentIndex} / ${matchCount}` : '0 / 0'}
      </Typography>

      <Box sx={{ display: 'flex', borderLeft: '1px solid #ddd', pl: 1 }}>
        <Tooltip title="Previous (Shift+Enter)">
          <IconButton size="small" onClick={handlePrev} disabled={matchCount === 0}>
            <KeyboardArrowUpIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Next (Enter)">
          <IconButton size="small" onClick={handleNext} disabled={matchCount === 0}>
            <KeyboardArrowDownIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Close (Esc)">
          <IconButton size="small" onClick={onClose} sx={{ ml: 0.5 }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
    </Paper>
  );
}
