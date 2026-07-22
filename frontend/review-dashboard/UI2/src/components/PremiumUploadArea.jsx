import React, { useState, useEffect } from 'react';
import { Box, Typography, Button, Paper, CircularProgress, IconButton, Collapse, LinearProgress } from '@mui/material';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DocumentScannerIcon from '@mui/icons-material/DocumentScanner';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

export default function PremiumUploadArea({ 
  onUpload, 
  onScan, 
  isProcessing, 
  isScanTriggered, 
  status, 
  currentFile, 
  onRemove, 
  onReplace 
}) {
  const [isDragActive, setIsDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [processingStep, setProcessingStep] = useState(0);

  const processingSteps = [
    "PDF Uploaded",
    "Reading PDF",
    "OCR Processing",
    "AI Extraction",
    "Data Verification",
    "Completed"
  ];

  // Simulate progress when processing
  useEffect(() => {
    let interval;
    if (isProcessing && !isScanTriggered) {
      setUploadProgress(0);
      setProcessingStep(0);
      
      // Simulate fast upload progress
      let p = 0;
      const progressInt = setInterval(() => {
        p += 10;
        if (p >= 100) {
          p = 100;
          clearInterval(progressInt);
        }
        setUploadProgress(p);
      }, 50);

      // Simulate AI stages
      let step = 0;
      interval = setInterval(() => {
        step += 1;
        if (step >= processingSteps.length - 1) {
          step = processingSteps.length - 2; // hold at Verification until done
        }
        setProcessingStep(step);
      }, 1500);
      
      return () => {
        clearInterval(progressInt);
        clearInterval(interval);
      };
    } else if (!isProcessing && currentFile && status?.type === 'success') {
      setProcessingStep(5); // Completed
      setUploadProgress(100);
    }
  }, [isProcessing, currentFile, status]);

  const handleDragOver = (e) => {
    e.preventDefault();
    if (!isDragActive) setIsDragActive(true);
  };
  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragActive(false);
  };
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onUpload({ target: { files: e.dataTransfer.files } });
    }
  };

  const formatSize = (bytes) => {
    if (!bytes) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getStatusColor = (type) => {
    switch(type) {
      case 'success': return { bg: '#ecfdf5', text: '#065f46', border: '#a7f3d0', icon: <CheckCircleIcon sx={{ color: '#10b981' }}/> };
      case 'error': return { bg: '#fef2f2', text: '#991b1b', border: '#fecaca', icon: <ErrorOutlineIcon sx={{ color: '#ef4444' }}/> };
      case 'warning': return { bg: '#fffbeb', text: '#92400e', border: '#fde68a', icon: <InfoOutlinedIcon sx={{ color: '#f59e0b' }}/> };
      default: return { bg: '#eff6ff', text: '#1e40af', border: '#bfdbfe', icon: <CircularProgress size={20} sx={{ color: '#3b82f6' }}/> };
    }
  };

  return (
    <Box sx={{ mb: 4 }}>
      {/* Title Section */}
      <Box display="flex" alignItems="flex-start" gap={1.5} mb={3}>
        <Box>
          <Typography variant="h4" fontWeight="800" sx={{ color: '#0f172a', letterSpacing: '-1px', fontSize: { xs: '1.5rem', md: '2.25rem' } }}>
            DIPALI ASSOCIATES & CO
          </Typography>
          <Typography variant="body1" sx={{ color: '#64748b', mt: 0.5 }}>
            Upload PDF or Image. AI will automatically extract data for review.
          </Typography>
        </Box>
      </Box>

      {/* Upload Area / File Preview */}
      {!currentFile && !isProcessing && !isScanTriggered ? (
        <Paper
          elevation={0}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          sx={{
            p: { xs: 4, md: 6 },
            borderRadius: 4,
            border: isDragActive ? "2px dashed #3b82f6" : "2px dashed #cbd5e1",
            backgroundColor: isDragActive ? "#eff6ff" : "#f8fafc",
            textAlign: 'center',
            transition: "all 0.3s ease",
            cursor: 'pointer',
            '&:hover': {
              borderColor: '#3b82f6',
              backgroundColor: '#f1f5f9',
              boxShadow: '0 10px 25px -5px rgba(59, 130, 246, 0.1)'
            }
          }}
          onClick={() => document.getElementById('file-upload-input').click()}
        >
          <input
            id="file-upload-input"
            type="file"
            hidden
            accept="image/*, application/pdf"
            onChange={onUpload}
          />
          <CloudUploadOutlinedIcon sx={{ fontSize: 64, color: isDragActive ? '#3b82f6' : '#94a3b8', mb: 2, transition: 'color 0.3s' }} />
          <Typography variant="h6" fontWeight="700" color="#334155" mb={1}>
            Drag & Drop PDF Here
          </Typography>
          <Typography variant="body2" color="#64748b" mb={3}>
            or click to browse files
          </Typography>
          <Box display="flex" justifyContent="center" gap={2}>
            <Button
              variant="contained"
              component="span"
              sx={{
                borderRadius: '10px',
                px: 4,
                py: 1.2,
                bgcolor: '#ffffff',
                color: '#3b82f6',
                border: '1px solid #bfdbfe',
                fontWeight: 600,
                boxShadow: '0 2px 5px rgba(0,0,0,0.02)',
                '&:hover': { bgcolor: '#eff6ff', border: '1px solid #93c5fd' }
              }}
              onClick={(e) => {
                // The label handles click via htmlFor in standard HTML, but here we manually trigger input
              }}
            >
              Browse Files
            </Button>
            <Button
              variant="outlined"
              color="secondary"
              startIcon={<DocumentScannerIcon />}
              onClick={(e) => { e.stopPropagation(); onScan(); }}
              sx={{
                borderRadius: '10px',
                px: 3,
                py: 1.2,
                fontWeight: 600,
                borderColor: '#e2e8f0',
                color: '#64748b',
                '&:hover': { bgcolor: '#f1f5f9', borderColor: '#cbd5e1' }
              }}
            >
              Scan
            </Button>
          </Box>
          <Typography variant="caption" sx={{ display: 'block', mt: 3, color: '#94a3b8' }}>
            Supported Formats: PDF, JPG, PNG • Max Size: 25MB
          </Typography>
        </Paper>
      ) : (
        <Paper
          elevation={0}
          sx={{
            p: 4,
            borderRadius: 4,
            border: "1px solid #e2e8f0",
            backgroundColor: "#ffffff",
            boxShadow: '0 4px 20px rgba(0,0,0,0.03)'
          }}
        >
          {/* File Preview Card */}
          {currentFile && (
            <Box display="flex" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={2}>
              <Box display="flex" alignItems="center" gap={2}>
                <Box sx={{ p: 2, bgcolor: '#f1f5f9', borderRadius: 3, display: 'flex' }}>
                  <InsertDriveFileOutlinedIcon sx={{ color: '#3b82f6', fontSize: 32 }} />
                </Box>
                <Box>
                  <Typography variant="subtitle1" fontWeight="700" color="#1e293b">
                    {currentFile.name}
                  </Typography>
                  <Typography variant="body2" color="#64748b">
                    {formatSize(currentFile.size)} • Uploaded {currentFile.uploadDate?.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                  </Typography>
                </Box>
              </Box>
              
              {!isProcessing && (
                <Box display="flex" gap={1}>
                  <Button size="small" variant="outlined" startIcon={<VisibilityOutlinedIcon />} onClick={() => window.open(currentFile.url, '_blank')} sx={{ borderRadius: 2, color: '#64748b', borderColor: '#e2e8f0', '&:hover': { bgcolor: '#f8fafc', borderColor: '#cbd5e1' } }}>View</Button>
                  <Button size="small" variant="outlined" startIcon={<RefreshIcon />} onClick={onReplace} sx={{ borderRadius: 2, color: '#64748b', borderColor: '#e2e8f0', '&:hover': { bgcolor: '#f8fafc', borderColor: '#cbd5e1' } }}>Replace</Button>
                  <Button size="small" variant="outlined" color="error" startIcon={<DeleteOutlineIcon />} onClick={onRemove} sx={{ borderRadius: 2, '&:hover': { bgcolor: '#fef2f2' } }}>Remove</Button>
                </Box>
              )}
            </Box>
          )}

          {/* AI Processing Section */}
          {isProcessing && (
            <Box sx={{ mt: 4 }}>
              <Box display="flex" justifyContent="space-between" mb={1}>
                <Typography variant="body2" fontWeight="600" color="#334155">
                  Uploading & Processing...
                </Typography>
                <Typography variant="body2" fontWeight="700" color="#3b82f6">
                  {uploadProgress}%
                </Typography>
              </Box>
              <LinearProgress 
                variant="determinate" 
                value={uploadProgress} 
                sx={{ 
                  height: 8, 
                  borderRadius: 4, 
                  bgcolor: '#f1f5f9',
                  '& .MuiLinearProgress-bar': { borderRadius: 4, backgroundImage: 'linear-gradient(90deg, #3b82f6, #60a5fa)' }
                }} 
              />

              <Box sx={{ mt: 4, display: 'flex', justifyContent: 'space-between', position: 'relative' }}>
                <Box sx={{ position: 'absolute', top: 12, left: '5%', right: '5%', height: 2, bgcolor: '#f1f5f9', zIndex: 0 }} />
                <Box sx={{ position: 'absolute', top: 12, left: '5%', right: '5%', height: 2, bgcolor: '#3b82f6', zIndex: 0, width: `${(processingStep / (processingSteps.length - 1)) * 100}%`, transition: 'width 1s ease' }} />
                
                {processingSteps.map((step, idx) => {
                  const isActive = idx === processingStep;
                  const isDone = idx < processingStep;
                  return (
                    <Box key={step} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 1, width: '16%' }}>
                      <Box sx={{ 
                        width: 26, height: 26, borderRadius: '50%', 
                        bgcolor: isDone ? '#3b82f6' : (isActive ? '#ffffff' : '#f8fafc'),
                        border: `2px solid ${isActive || isDone ? '#3b82f6' : '#e2e8f0'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        mb: 1,
                        transition: 'all 0.3s ease'
                      }}>
                        {isDone && <CheckCircleIcon sx={{ color: '#fff', fontSize: 16 }} />}
                        {isActive && <CircularProgress size={12} thickness={5} sx={{ color: '#3b82f6' }} />}
                      </Box>
                      <Typography variant="caption" fontWeight={isActive ? 700 : 500} color={isActive ? '#1e293b' : '#94a3b8'} textAlign="center" sx={{ lineHeight: 1.2 }}>
                        {step}
                      </Typography>
                    </Box>
                  );
                })}
              </Box>
            </Box>
          )}

          {/* Status Message */}
          <Collapse in={!!status}>
            {status && (
              <Box sx={{ 
                mt: 4, p: 2, borderRadius: 3, 
                display: 'flex', alignItems: 'center', gap: 2,
                bgcolor: getStatusColor(status.type).bg, 
                border: `1px solid ${getStatusColor(status.type).border}` 
              }}>
                {getStatusColor(status.type).icon}
                <Typography variant="body2" fontWeight="500" sx={{ color: getStatusColor(status.type).text, flex: 1 }}>
                  {status.message}
                </Typography>
                {(status.type === 'error') && (
                  <Button size="small" variant="outlined" color="error" onClick={() => document.getElementById('file-upload-input')?.click()} sx={{ bgcolor: '#fff', '&:hover': { bgcolor: '#fef2f2' } }}>
                    Retry
                  </Button>
                )}
              </Box>
            )}
          </Collapse>
        </Paper>
      )}
    </Box>
  );
}
