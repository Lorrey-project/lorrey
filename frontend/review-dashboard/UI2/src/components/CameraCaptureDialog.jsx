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
  CircularProgress,
  Alert,
  useMediaQuery,
  useTheme
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import FlipCameraIosIcon from '@mui/icons-material/FlipCameraIos';
import ReplayIcon from '@mui/icons-material/Replay';
import CheckIcon from '@mui/icons-material/Check';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

const CameraCaptureDialog = ({ open, onClose, onCapture }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  
  const [hasCamera, setHasCamera] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [facingMode, setFacingMode] = useState("environment"); // default rear camera
  const [isStarting, setIsStarting] = useState(false);
  const [capturedImage, setCapturedImage] = useState(null);
  const [capturedBlob, setCapturedBlob] = useState(null);

  // Stop active camera stream tracks safely
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        try {
          track.stop();
        } catch (e) {
          console.error("Error stopping track:", e);
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  // Initialize camera stream
  const startCamera = useCallback(async () => {
    if (!open) return;
    setIsStarting(true);
    setErrorMsg("");
    setHasCamera(true);
    stopCamera();
    
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Camera is not supported on this browser.");
      }

      const constraints = {
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play().catch(err => console.error("Play error:", err));
        };
      }
      setHasCamera(true);
      setErrorMsg("");
    } catch (err) {
      console.error("Camera access error:", err);
      setHasCamera(false);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setErrorMsg("Camera access is required to capture an invoice. Please allow camera permissions in your browser settings.");
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setErrorMsg("Camera is not available on this device/browser.");
      } else {
        setErrorMsg(err.message || "Failed to initialize camera.");
      }
    } finally {
      setIsStarting(false);
    }
  }, [open, facingMode, stopCamera]);

  useEffect(() => {
    if (open) {
      setCapturedImage(null);
      setCapturedBlob(null);
      startCamera();
    } else {
      stopCamera();
      setCapturedImage(null);
      setCapturedBlob(null);
    }
    return () => stopCamera();
  }, [open, startCamera, stopCamera]);

  const toggleCamera = () => {
    setFacingMode(prev => prev === "environment" ? "user" : "environment");
  };

  // Capture photo frame from video
  const handleCaptureClick = () => {
    if (!videoRef.current) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current || document.createElement('canvas');
    
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    canvas.width = width;
    canvas.height = height;
    
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, width, height);
    
    canvas.toBlob((blob) => {
      if (blob) {
        const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
        setCapturedImage(dataUrl);
        setCapturedBlob(blob);
        stopCamera(); // stop live camera stream while previewing captured image
      }
    }, 'image/jpeg', 0.95);
  };

  // Retake photo: discard captured photo & restart live camera
  const handleRetake = () => {
    setCapturedImage(null);
    setCapturedBlob(null);
    startCamera();
  };

  // Confirm "Use Photo": create File & pass to existing AI pipeline
  const handleUsePhoto = () => {
    if (!capturedBlob) return;
    const file = new File([capturedBlob], `captured_invoice_${Date.now()}.jpg`, { type: 'image/jpeg' });
    stopCamera();
    onCapture(file);
    onClose();
  };

  const handleCloseDialog = () => {
    stopCamera();
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleCloseDialog}
      fullScreen={isMobile}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: '#0f172a',
          color: '#f8fafc',
          borderRadius: isMobile ? 0 : 4,
          overflow: 'hidden',
          minHeight: isMobile ? '100dvh' : 520
        }
      }}
    >
      {/* Top Header */}
      <DialogTitle
        sx={{
          m: 0,
          p: 2,
          bgcolor: '#1e293b',
          color: '#f8fafc',
          display: 'flex',
          alignItems: 'center',
          justify: 'space-between',
          borderBottom: '1px solid rgba(255,255,255,0.08)'
        }}
      >
        <Box display="flex" alignItems="center" gap={1.5}>
          <IconButton onClick={handleCloseDialog} sx={{ color: '#f8fafc', p: 0.5 }}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h6" fontWeight="800" fontSize="1.05rem" letterSpacing="-0.3px">
            {capturedImage ? 'Preview Captured Invoice' : 'Capture Invoice'}
          </Typography>
        </Box>
        <IconButton onClick={handleCloseDialog} sx={{ color: '#94a3b8' }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      {/* Main Viewport Content */}
      <DialogContent
        sx={{
          p: 0,
          bgcolor: '#000000',
          display: 'flex',
          flexDirection: 'column',
          justify: 'center',
          alignItems: 'center',
          minHeight: 380,
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {/* Loading Spinner */}
        {isStarting && !capturedImage && (
          <Box position="absolute" display="flex" flexDirection="column" alignItems="center" gap={2} zIndex={10}>
            <CircularProgress sx={{ color: '#38bdf8' }} />
            <Typography sx={{ color: '#f8fafc', fontWeight: 600, fontSize: '0.9rem' }}>
              Initializing Camera...
            </Typography>
          </Box>
        )}

        {/* Camera Error Message */}
        {!hasCamera && !isStarting && !capturedImage && (
          <Box position="absolute" display="flex" flexDirection="column" alignItems="center" gap={2} p={4} textAlign="center" zIndex={10}>
            <Alert severity="warning" sx={{ width: '100%', borderRadius: 3, fontWeight: 600 }}>
              {errorMsg}
            </Alert>
            <Button
              variant="contained"
              onClick={startCamera}
              sx={{ mt: 1, bgcolor: '#0284c7', fontWeight: 800, borderRadius: 2.5 }}
            >
              Retry Camera
            </Button>
          </Box>
        )}

        {/* Live Camera Feed */}
        {!capturedImage && (
          <Box sx={{ position: 'relative', width: '100%', height: '100%', minHeight: 380, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{
                width: '100%',
                maxHeight: isMobile ? 'calc(100dvh - 140px)' : '480px',
                objectFit: 'contain',
                backgroundColor: '#000000',
                display: hasCamera && !isStarting ? 'block' : 'none'
              }}
            />

            {/* Positioning Frame Overlay */}
            {hasCamera && !isStarting && (
              <Box
                sx={{
                  position: 'absolute',
                  top: '12%',
                  bottom: '22%',
                  left: '8%',
                  right: '8%',
                  border: '2px dashed rgba(56, 189, 248, 0.75)',
                  borderRadius: 3,
                  boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.45)',
                  pointerEvents: 'none',
                  display: 'flex',
                  alignItems: 'flex-start',
                  justify: 'center',
                  pt: 2
                }}
              >
                <Typography variant="caption" sx={{ bgcolor: 'rgba(15, 23, 42, 0.8)', color: '#38bdf8', px: 1.5, py: 0.5, borderRadius: 2, fontWeight: 800, fontSize: '0.7rem', letterSpacing: '0.5px' }}>
                  POSITION INVOICE CLEARLY IN FRAME
                </Typography>
              </Box>
            )}

            {/* Flip Camera Switch Button */}
            {hasCamera && !isStarting && (
              <IconButton
                onClick={toggleCamera}
                sx={{
                  position: 'absolute',
                  top: 16,
                  right: 16,
                  bgcolor: 'rgba(15, 23, 42, 0.75)',
                  color: '#ffffff',
                  border: '1px solid rgba(255,255,255,0.2)',
                  '&:hover': { bgcolor: 'rgba(15, 23, 42, 0.9)' }
                }}
              >
                <FlipCameraIosIcon fontSize="small" />
              </IconButton>
            )}
          </Box>
        )}

        {/* Captured Image Preview */}
        {capturedImage && (
          <Box sx={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', p: 1, bgcolor: '#000' }}>
            <img
              src={capturedImage}
              alt="Captured Invoice"
              style={{
                maxWidth: '100%',
                maxHeight: isMobile ? 'calc(100dvh - 140px)' : '460px',
                objectFit: 'contain',
                borderRadius: '8px'
              }}
            />
          </Box>
        )}

        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </DialogContent>

      {/* Bottom Action Bar */}
      <DialogActions sx={{ p: 2.5, bgcolor: '#1e293b', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        {capturedImage ? (
          <>
            <Button
              variant="outlined"
              onClick={handleRetake}
              startIcon={<ReplayIcon />}
              sx={{
                borderRadius: 2.5,
                px: 3,
                py: 1,
                fontWeight: 700,
                color: '#cbd5e1',
                borderColor: '#475569',
                '&:hover': { bgcolor: '#334155' }
              }}
            >
              Retake
            </Button>
            <Button
              variant="contained"
              onClick={handleUsePhoto}
              startIcon={<CheckIcon />}
              sx={{
                borderRadius: 2.5,
                px: 3.5,
                py: 1,
                fontWeight: 800,
                bgcolor: '#0284c7',
                color: '#ffffff',
                '&:hover': { bgcolor: '#0369a1' }
              }}
            >
              Use Photo
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="outlined"
              onClick={handleCloseDialog}
              sx={{ borderRadius: 2.5, px: 3, fontWeight: 700, color: '#94a3b8', borderColor: '#475569' }}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handleCaptureClick}
              disabled={!hasCamera || isStarting}
              startIcon={<CameraAltIcon />}
              sx={{
                borderRadius: 2.5,
                px: 4,
                py: 1,
                fontWeight: 800,
                bgcolor: '#0284c7',
                color: '#ffffff',
                boxShadow: '0 4px 15px rgba(2, 132, 199, 0.4)',
                '&:hover': { bgcolor: '#0369a1' }
              }}
            >
              Capture
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default CameraCaptureDialog;
