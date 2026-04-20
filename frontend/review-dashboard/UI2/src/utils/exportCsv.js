import * as XLSX from 'xlsx';

/**
 * exportToCsv — Drop-in replacement for exporting data to Excel.
 * Uses the 'xlsx' library to generate a genuine binary .xlsx file.
 * This fixes compatibility issues with Apple Numbers and newer Excel versions.
 * 
 * @param {string} filename - The desired filename (e.g., "data.csv" or "data.xls")
 * @param {Array<Object>} rows - Array of objects to export
 */
export function exportToCsv(filename, rows) {
    if (!rows || rows.length === 0) return;

    // 1. Clean the data: Filter out internal MongoDB / private keys
    const SKIP_KEYS = new Set(['_id', '__v', '_invoiceId', '_cementId', '_tds_percent', '_is_ato', '_source', '_auto_updated_at']);
    
    const cleanedRows = rows.map(originalRow => {
        const cleaned = {};
        Object.keys(originalRow).forEach(key => {
            if (!SKIP_KEYS.has(key)) {
                // Ensure values are formatted reasonably for Excel
                let val = originalRow[key];
                if (val === null || val === undefined) {
                    cleaned[key] = '';
                } else if (typeof val === 'boolean') {
                    cleaned[key] = val ? 'Yes' : 'No';
                } else {
                    cleaned[key] = val;
                }
            }
        });
        return cleaned;
    });

    // 2. Create worksheet
    const worksheet = XLSX.utils.json_to_sheet(cleanedRows);

    // 3. Basic styling for headers (optional but helpful)
    // We can set col widths if we want, but json_to_sheet does a decent job.
    // For simplicity and robustness, we'll stick to a standard export.

    // 4. Create workbook and append sheet
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');

    // 5. Generate filename (Standardize to .xlsx for maximum compatibility with Numbers/Excel)
    const finalFilename = filename.replace(/\.(csv|xls|xlsx)$/i, '') + '.xlsx';

    // 6. Write and download
    /* 
       XLSX.writeFile handles the binary blob creation and download trigger
       automatically in the browser environment.
    */
    XLSX.writeFile(workbook, finalFilename);
}

