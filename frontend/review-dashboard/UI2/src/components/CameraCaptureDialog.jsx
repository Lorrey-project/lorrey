import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  IconButton,
  Box,
  Typography,
  CircularProgress
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import FlipCameraIosIcon from '@mui/icons-material/FlipCameraIos';

const CameraCaptureDialog = ({ open, onClose, onCapture }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  
  const [hasCamera, setHasCamera] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [facingMode, setFacingMode] = useState("environment"); // default rear camera
  const [isStarting, setIsStarting] = useState(false);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    if (!open) return;
    setIsStarting(true);
    stopCamera();
    
    try {
        const constraints = {
            video: {
                facingMode: facingMode,
                width: { ideal: 1920 },
                height: { ideal: 1080 }
            }
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;
        if (videoRef.current) {
            videoRef.current.srcObject = stream;
        }
        setHasCamera(true);
        setErrorMsg("");
    } catch (err) {
        console.error("Error accessing camera:", err);
        setHasCamera(false);
        setErrorMsg("Failed to access camera: " + err.message);
    } finally {
        setIsStarting(false);
    }
  }, [open, facingMode, stopCamera]);

  useEffect(() => {
      if (open) {
          startCamera();
      } else {
          stopCamera();
      }
      return () => stopCamera();
  }, [open, startCamera, stopCamera]);

  const toggleCamera = () => {
      setFacingMode(prev => prev === "environment" ? "user" : "environment");
  };

  const handleCaptureClick = () => {
      if (!videoRef.current || !canvasRef.current) return;
      
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      canvas.toBlob((blob) => {
          if (blob) {
              // Construct a File object from the blob
              const file = new File([blob], `scan_${Date.now()}.jpg`, { type: "image/jpeg" });
              onCapture(file);
          }
      }, 'image/jpeg', 0.95); // High quality
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ m: 0, p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h6" fontWeight="bold" display="flex" alignItems="center" gap={1}>
            <CameraAltIcon color="primary" /> Scan Document
        </Typography>
        <IconButton onClick={onClose} sx={{ color: 'grey.500' }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ p: 0, bgcolor: '#000', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400, position: 'relative' }}>
          {isStarting && (
              <Box position="absolute" display="flex" flexDirection="column" alignItems="center" gap={2}>
                  <CircularProgress sx={{ color: '#fff' }} />
                  <Typography sx={{ color: '#fff' }}>Accessing Camera...</Typography>
              </Box>
          )}

          {!hasCamera && !isStarting && (
              <Box position="absolute" display="flex" flexDirection="column" alignItems="center" gap={2} p={4} textAlign="center">
                  <Typography variant="h6" color="error">Camera Not Available</Typography>
                  <Typography color="white">{errorMsg}</Typography>
                  <Typography color="white" mt={2}>Please ensure you have granted camera permissions in your browser.</Typography>
              </Box>
          )}

          <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              muted 
              style={{ width: '100%', maxHeight: '70vh', objectFit: 'contain', backgroundColor: '#000', display: hasCamera && !isStarting ? 'block' : 'none' }}
          />
          <canvas ref={canvasRef} style={{ display: 'none' }} />
          
          {hasCamera && !isStarting && (
              <IconButton 
                  onClick={toggleCamera} 
                  sx={{ 
                      position: 'absolute', 
                      bottom: 20, 
                      right: 20, 
                      bgcolor: 'rgba(255,255,255,0.2)', 
                      color: 'white',
                      '&:hover': { bgcolor: 'rgba(255,255,255,0.3)' }
                  }}
              >
                  <FlipCameraIosIcon />
              </IconButton>
          )}
      </DialogContent>
      <DialogActions sx={{ p: 2, justifyContent: 'center' }}>
          <Button variant="outlined" onClick={onClose} size="large" sx={{ borderRadius: 2, px: 4 }}>
              Cancel
          </Button>
          <Button 
              variant="contained" 
              onClick={handleCaptureClick} 
              size="large" 
              startIcon={<CameraAltIcon />}
              disabled={!hasCamera || isStarting}
              sx={{ borderRadius: 2, px: 4, background: 'linear-gradient(45deg, #1a73e8, #4285f4)' }}
          >
              Capture & Process
          </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CameraCaptureDialog;
