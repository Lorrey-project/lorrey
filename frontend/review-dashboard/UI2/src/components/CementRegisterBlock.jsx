import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import { exportToCsv } from '../utils/exportCsv';
import '../styles/cementRegister.css';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const socket = io('/');

export default function CementRegisterBlock() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch initial data
  const fetchData = async () => {
    try {
      const res = await axios.get(`${API_URL}/cement-register`);
      if (res.data.success) setEntries(res.data.entries);
    } catch (e) {
      console.error('Failed to fetch cement register:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Listen for real‑time updates
    socket.on('cementUpdates', (msg) => {
      // Simple strategy: refetch all data on any change
      fetchData();
    });
    return () => {
      socket.off('cementUpdates');
    };
  }, []);

  const handleCellBlur = async (id, field, e) => {
    const newValue = e.target.innerText;
    try {
      await axios.put(`${API_URL}/cement-register/${id}`, { [field]: newValue });
      // optimistic UI update
      setEntries((prev) =>
        prev.map((row) => (row._id === id ? { ...row, [field]: newValue } : row))
      );
    } catch (err) {
      console.error('Update failed:', err);
    }
  };

  const handleExport = () => {
    exportToCsv('cement_register.csv', entries);
  };

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    const rows = text.split('\n').filter(Boolean).map((line) => {
      const values = line.split(',').map((v) => v.replace(/^"|"$/g, '').trim());
      // Assuming CSV columns match the keys in the entry objects; map by header order if needed.
      // Here we simply create an object with the same keys as the first entry.
      const keys = Object.keys(entries[0] || {});
      const obj = {};
      keys.forEach((k, i) => (obj[k] = values[i]));
      return obj;
    });
    try {
      await axios.post(`${API_URL}/cement-register/bulk`, { entries: rows });
      fetchData();
    } catch (err) {
      console.error('Bulk import failed:', err);
    }
  };

  if (loading) return <p>Loading Cement Register...</p>;

  return (
    <div className="cement-register-card">
      <h3>Cement Register</h3>
      <div className="cement-actions">
        <button onClick={handleExport}>Export to CSV</button>
        <label className="import-label">
          Import CSV
          <input type="file" accept=".csv" onChange={handleImport} style={{ display: 'none' }} />
        </label>
      </div>
      <div className="table-wrapper">
        <table className="cement-table">
          <thead>
            <tr>
              {entries.length > 0 &&
                Object.keys(entries[0]).map((col) => (
                  <th key={col}>{col}</th>
                ))}
            </tr>
          </thead>
          <tbody>
            {entries.map((row) => (
              <tr key={row._id}>
                {Object.entries(row).map(([field, value]) => (
                  <td
                    key={field}
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={(e) => handleCellBlur(row._id, field, e)}
                  >
                    {value !== undefined ? value.toString() : ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
