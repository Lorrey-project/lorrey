import React, { useState, useEffect, useRef } from 'react';
import { Box, Card, Typography, Fade } from '@mui/material';

/**
 * 1. Cinematic Animated Background
 * Renders the absolute positioned deep dark background with slow floating particles.
 */
export const CinematicBackground = () => (
    <Box sx={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        zIndex: -1,
        backgroundColor: '#050505',
        backgroundImage: 'radial-gradient(circle at 50% 30%, rgba(20, 25, 35, 0.8), transparent 70%)',
        overflow: 'hidden',
        pointerEvents: 'none'
    }}>
        <style>
            {`
                @keyframes cinematicFloat1 { 0% { transform: translateY(0px) translateX(0px); opacity: 0; } 50% { opacity: 0.4; } 100% { transform: translateY(-150px) translateX(80px); opacity: 0; } }
                @keyframes cinematicFloat2 { 0% { transform: translateY(0px) translateX(0px); opacity: 0; } 50% { opacity: 0.2; } 100% { transform: translateY(-200px) translateX(-80px); opacity: 0; } }
                .cinematic-particle { position: absolute; background: white; border-radius: 50%; pointer-events: none; }
            `}
        </style>
        {[...Array(20)].map((_, i) => (
            <div key={i} className="cinematic-particle" style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                width: `${Math.random() * 3 + 1}px`,
                height: `${Math.random() * 3 + 1}px`,
                animation: `${i % 2 === 0 ? 'cinematicFloat1' : 'cinematicFloat2'} ${Math.random() * 15 + 15}s linear infinite`,
                animationDelay: `-${Math.random() * 15}s`
            }} />
        ))}
    </Box>
);

/**
 * 2. Floating Application Surface
 * The main wrapper that lifts the app off the background edges.
 */
export const FloatingSurface = ({ children, isTransitioning }) => {
    return (
        <Box sx={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            p: { xs: 0, md: 3 } // Touch edges on mobile, float on desktop
        }}>
            <CinematicBackground />
            
            <Box sx={{
                width: '100%',
                maxWidth: '1920px',
                minHeight: { xs: '100vh', md: 'calc(100vh - 48px)' },
                bgcolor: '#0f0f11', // Dark graphite surface
                borderRadius: { xs: 0, md: '32px' },
                border: { xs: 'none', md: '1px solid rgba(255,255,255,0.05)' },
                boxShadow: { 
                    xs: 'none', 
                    md: '0 40px 100px -20px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.08), inset 0 0 20px rgba(255,255,255,0.01)'
                },
                position: 'relative',
                transition: 'transform 0.6s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.6s ease',
                transform: isTransitioning ? 'scale(0.98)' : 'scale(1)',
                opacity: isTransitioning ? 0 : 1,
                display: 'flex',
                flexDirection: 'column'
            }}>
                {children}
            </Box>
        </Box>
    );
};

/**
 * 3. Central Abstract 3D Hero Object
 * A pure CSS 3D structure that reacts to mouse movement.
 */
export const Hero3DObject = () => {
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
    const requestRef = useRef();

    useEffect(() => {
        const handleMouseMove = (e) => {
            const x = (e.clientX / window.innerWidth - 0.5) * 30; // -15 to +15 deg
            const y = (e.clientY / window.innerHeight - 0.5) * -30;
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
            requestRef.current = requestAnimationFrame(() => setMousePos({ x, y }));
        };
        window.addEventListener('mousemove', handleMouseMove);
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, []);

    return (
        <Box sx={{
            width: '100%',
            height: 300,
            perspective: '1000px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative'
        }}>
            <style>
                {`
                    @keyframes heroRotate { 0% { transform: rotateY(0deg) rotateX(20deg); } 100% { transform: rotateY(360deg) rotateX(20deg); } }
                    @keyframes heroPulse { 0%, 100% { opacity: 0.4; box-shadow: 0 0 20px rgba(212,175,55,0.2); } 50% { opacity: 1; box-shadow: 0 0 50px rgba(212,175,55,0.6); } }
                    .hero-core {
                        width: 120px; height: 120px;
                        position: absolute;
                        transform-style: preserve-3d;
                        transition: transform 0.1s ease-out;
                    }
                    .hero-ring {
                        position: absolute;
                        width: 100%; height: 100%;
                        border-radius: 50%;
                        border: 1px solid rgba(255,255,255,0.15);
                        transform-style: preserve-3d;
                    }
                    .hero-node {
                        position: absolute;
                        width: 12px; height: 12px;
                        background: #fff;
                        border-radius: 50%;
                        top: 50%; left: 50%;
                        margin: -6px 0 0 -6px;
                        box-shadow: 0 0 15px rgba(255,255,255,0.8);
                        animation: heroPulse 4s ease-in-out infinite;
                    }
                `}
            </style>
            
            <div className="hero-core" style={{
                transform: `rotateY(${mousePos.x}deg) rotateX(${mousePos.y + 20}deg)`
            }}>
                <div style={{ position: 'absolute', width: '100%', height: '100%', animation: 'heroRotate 20s linear infinite', transformStyle: 'preserve-3d' }}>
                    {/* Ring 1 */}
                    <div className="hero-ring" style={{ transform: 'rotateX(75deg)' }}>
                        <div className="hero-node" style={{ transform: 'translateZ(60px)' }} />
                    </div>
                    {/* Ring 2 */}
                    <div className="hero-ring" style={{ transform: 'rotateY(75deg)' }}>
                        <div className="hero-node" style={{ transform: 'translateZ(60px)', background: '#d4af37' }} />
                    </div>
                    {/* Ring 3 */}
                    <div className="hero-ring" style={{ transform: 'rotateZ(75deg) rotateX(45deg)' }}>
                        <div className="hero-node" style={{ transform: 'translateZ(-60px)' }} />
                    </div>
                    {/* Central Glowing Core */}
                    <div style={{
                        position: 'absolute', top: '50%', left: '50%', width: 40, height: 40,
                        margin: '-20px 0 0 -20px', borderRadius: '50%',
                        background: 'radial-gradient(circle, rgba(212,175,55,0.8) 0%, transparent 70%)',
                        animation: 'heroPulse 6s ease-in-out infinite'
                    }} />
                </div>
            </div>
        </Box>
    );
};

/**
 * 4. 3D Module Card
 * Reusable card for dashboard tabs with physical hover elevation.
 */
export const ModuleCard3D = ({ title, subtitle, icon, onClick, sx = {} }) => {
    return (
        <Card 
            onClick={onClick}
            sx={{
                bgcolor: '#141416', // slightly lighter than surface
                border: '1px solid rgba(255,255,255,0.04)',
                boxShadow: '0 10px 30px rgba(0,0,0,0.5), inset 0 1px 1px rgba(255,255,255,0.05)',
                borderRadius: '16px',
                cursor: 'pointer',
                position: 'relative',
                overflow: 'hidden',
                transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)', // slight bounce
                transformStyle: 'preserve-3d',
                ...sx,
                '&:hover': {
                    transform: 'translateY(-6px) rotateX(2deg)',
                    boxShadow: '0 20px 40px rgba(0,0,0,0.8), inset 0 2px 2px rgba(255,255,255,0.1)',
                    borderColor: 'rgba(255,255,255,0.1)',
                    '& .module-icon-container': {
                        transform: 'translateZ(10px) scale(1.05)',
                        bgcolor: 'rgba(255,255,255,0.1)'
                    },
                    '& .module-glow': {
                        opacity: 0.6
                    }
                }
            }}
        >
            <Box className="module-glow" sx={{
                position: 'absolute', top: 0, left: 0, right: 0, height: '50%',
                background: 'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, transparent 100%)',
                opacity: 0, transition: 'opacity 0.4s ease'
            }} />
            
            <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2, position: 'relative', zIndex: 1 }}>
                <Box className="module-icon-container" sx={{ 
                    p: 1.5, 
                    borderRadius: 2,
                    bgcolor: 'rgba(255,255,255,0.03)',
                    alignSelf: 'flex-start',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#e2e8f0',
                    transition: 'all 0.4s ease',
                    border: '1px solid rgba(255,255,255,0.05)'
                }}>
                    {icon}
                </Box>
                <Box>
                    <Typography variant="subtitle1" fontWeight={800} sx={{ color: '#f8fafc', letterSpacing: 0.5 }}>
                        {title}
                    </Typography>
                    {subtitle && (
                        <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 500 }}>
                            {subtitle}
                        </Typography>
                    )}
                </Box>
            </Box>
        </Card>
    );
};

export default {
    CinematicBackground,
    FloatingSurface,
    Hero3DObject,
    ModuleCard3D
};
