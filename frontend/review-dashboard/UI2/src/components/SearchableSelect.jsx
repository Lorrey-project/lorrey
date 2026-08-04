import React from 'react';
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
  // Parse children to build options array
  const options = React.useMemo(() => {
    const opts = [];
    React.Children.forEach(children, child => {
      // Support native <option> and MUI <MenuItem>
      if (child && child.props) {
        let val = child.props.value;
        if (val === undefined) val = "";

        let lab = child.props.children;
        if (Array.isArray(lab)) lab = lab.join('');
        if (lab === undefined) lab = "";

        // Prevent duplicate values causing keys conflict in MUI Autocomplete
        if (!opts.some(o => o.value === val)) {
          opts.push({ value: val, label: String(lab), disabled: !!child.props.disabled });
        }
      }
    });
    return opts;
  }, [children]);

  // Find the currently selected option object
  // If value doesn't perfectly match, default to null so Autocomplete doesn't crash
  const selectedOption = options.find(o => String(o.value) === String(value)) || null;

  return (
    <Autocomplete
      options={options}
      getOptionLabel={(option) => option.label || ""}
      getOptionDisabled={(option) => !!option.disabled}
      value={selectedOption}
      onChange={(event, newValue) => {
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
