import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Autocomplete, TextField } from '@mui/material';

export default function SearchableSelect({
  value,
  onChange,
  children,
  style,
  sx,
  disabled,
  label,
  className,
  name,
  size,
  variant
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  // Close reliably when clicking outside without blocking clicks on adjacent elements
  useEffect(() => {
    if (!open) return;
    const handleOutsideClick = (e) => {
      if (containerRef.current && containerRef.current.contains(e.target)) {
        return;
      }
      if (e.target.closest && e.target.closest('.MuiAutocomplete-popper')) {
        return;
      }
      setOpen(false);
    };

    document.addEventListener('pointerdown', handleOutsideClick, true);
    return () => {
      document.removeEventListener('pointerdown', handleOutsideClick, true);
    };
  }, [open]);

  // Recursively extract plain string text from any React element children
  const extractText = (node) => {
    if (node === null || node === undefined) return '';
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(extractText).join('');
    if (typeof node === 'object' && node.props && node.props.children) {
      return extractText(node.props.children);
    }
    return '';
  };

  // Parse children to build options array
  const options = useMemo(() => {
    const opts = [];
    React.Children.forEach(children, child => {
      // Support native <option> and MUI <MenuItem>
      if (child && child.props) {
        let val = child.props.value;
        if (val === undefined) val = "";

        let lab = extractText(child.props.children);

        // Prevent duplicate values causing keys conflict in MUI Autocomplete
        if (!opts.some(o => o.value === val)) {
          opts.push({ value: val, label: lab, disabled: !!child.props.disabled });
        }
      }
    });

    // Ensure if value is provided and not in options, it is still included as an option
    if (value && !opts.some(o => String(o.value) === String(value))) {
      opts.push({ value: value, label: String(value), disabled: false });
    }

    return opts;
  }, [children, value]);

  // Find the currently selected option object
  // If value doesn't perfectly match, default to null so Autocomplete doesn't crash
  const selectedOption = options.find(o => String(o.value) === String(value)) || null;

  return (
    <Autocomplete
      ref={containerRef}
      open={open}
      onOpen={() => setOpen(true)}
      onClose={(event, reason) => {
        setOpen(false);
      }}
      options={options}
      getOptionLabel={(option) => option.label || ""}
      getOptionDisabled={(option) => !!option.disabled}
      value={selectedOption}
      onChange={(event, newValue) => {
        setOpen(false);
        if (onChange) {
          // Mock event to simulate standard native select onChange
          const fakeEvent = {
            target: { 
              value: newValue !== null ? newValue.value : '', 
              name: name 
            }
          };
          onChange(fakeEvent);
        }
      }}
      disabled={disabled}
      disableClearable
      isOptionEqualToValue={(option, val) => String(option.value) === String(val.value)}
      PopperProps={{
        sx: { zIndex: 1400 }
      }}
      renderInput={(params) => (
        <TextField 
          {...params} 
          label={label}
          variant={variant || "outlined"}
          size={size || "small"}
          InputLabelProps={{
            ...params.InputLabelProps,
            shrink: label ? true : undefined,
          }}
          style={style}
        />
      )}
      sx={{ 
        flex: 1, 
        minWidth: variant === 'standard' ? 0 : 120, 
        backgroundColor: variant === 'standard' ? 'transparent' : '#fff',
        '& .MuiInputBase-root': variant === 'standard' ? {
          paddingRight: '24px !important', 
          paddingTop: '0 !important',
          paddingBottom: '0 !important'
        } : {},
        '& .MuiInputBase-input': variant === 'standard' ? {
          padding: '4px 5px !important',
        } : {},
        ...sx 
      }}
      style={style}
      className={className}
    />
  );
}
