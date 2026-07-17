import React from 'react';
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
  const selectedValues = Array.isArray(value) ? value : [];

  return (
    <Autocomplete
      multiple
      options={options}
      disableCloseOnSelect
      getOptionLabel={(option) => option}
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
      renderOption={(props, option, { selected }) => (
        <li {...props}>
          <Checkbox
            icon={icon}
            checkedIcon={checkedIcon}
            style={{ marginRight: 8 }}
            checked={selected}
          />
          {option}
        </li>
      )}
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
