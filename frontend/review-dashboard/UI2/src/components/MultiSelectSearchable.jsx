import React, { useState, useRef, useEffect } from 'react';
import { Autocomplete, TextField, Checkbox } from '@mui/material';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import CheckBoxIcon from '@mui/icons-material/CheckBox';

const icon = <CheckBoxOutlineBlankIcon fontSize="small" />;
const checkedIcon = <CheckBoxIcon fontSize="small" />;

export default function MultiSelectSearchable({
  value,
  onChange,
  options,
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

  const selectedValues = Array.isArray(value) ? value : [];

  // Close when clicking outside reliably without blocking clicks on adjacent elements
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

  return (
    <Autocomplete
      ref={containerRef}
      open={open}
      onOpen={() => setOpen(true)}
      onClose={(event, reason) => {
        if (reason === 'selectOption' || reason === 'removeTag') return;
        setOpen(false);
      }}
      multiple
      options={options}
      disableCloseOnSelect
      getOptionLabel={(option) => String(option || '')}
      value={selectedValues}
      onChange={(event, newValue) => {
        if (onChange) {
          const fakeEvent = {
            target: { 
              value: newValue, 
              name: name 
            }
          };
          onChange(fakeEvent);
        }
      }}
      disabled={disabled}
      isOptionEqualToValue={(option, val) => String(option) === String(val)}
      renderOption={(props, option, { selected }) => {
        const { key, ...otherProps } = props;
        return (
          <li key={key || option} {...otherProps}>
            <Checkbox
              icon={icon}
              checkedIcon={checkedIcon}
              style={{ marginRight: 8 }}
              checked={selected}
            />
            {option}
          </li>
        );
      }}
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
          paddingBottom: '0 !important',
          flexWrap: 'nowrap',
          overflowX: 'hidden'
        } : {},
        '& .MuiInputBase-input': variant === 'standard' ? {
          padding: '4px 5px !important',
        } : {},
        '& .MuiChip-root': {
          height: '24px',
          fontSize: '0.75rem'
        },
        ...sx 
      }}
      style={style}
      className={className}
    />
  );
}
