import React, { useEffect, useRef } from 'react';
import p5 from 'p5';
import TRUNK from 'vanta/dist/vanta.trunk.min';

const VantaTrunkBackground = () => {
    const vantaRef = useRef(null);
    const vantaEffectRef = useRef(null);

    useEffect(() => {
        if (!vantaEffectRef.current && vantaRef.current) {
            vantaEffectRef.current = TRUNK({
                el: vantaRef.current,
                p5: p5,
                mouseControls: true,
                touchControls: true,
                gyroControls: false,
                minHeight: 200.00,
                minWidth: 200.00,
                scale: 1.00,
                scaleMobile: 1.00,
                color: 0x98465f,       // Reference color
                backgroundColor: 0x222426, // Reference backgroundColor
                spacing: 0,
                chaos: 1
            });
        }

        // Forward window mousemove events to the vanta container 
        // so it reacts to mouse movement even when hidden behind AppContent
        const handleMouseMove = (e) => {
            if (vantaRef.current) {
                // Vanta attaches event listeners directly to the element.
                // We dispatch a cloned event to it.
                const clonedEvent = new MouseEvent('mousemove', {
                    clientX: e.clientX,
                    clientY: e.clientY,
                    bubbles: false,
                    cancelable: false
                });
                vantaRef.current.dispatchEvent(clonedEvent);
            }
        };

        window.addEventListener('mousemove', handleMouseMove);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            if (vantaEffectRef.current) {
                vantaEffectRef.current.destroy();
                vantaEffectRef.current = null;
            }
        };
    }, []);

    return (
        <div
            ref={vantaRef}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100vw',
                height: '100vh',
                zIndex: -1,
                // pointer-events: none ensures this container NEVER blocks scrolling
                pointerEvents: 'none'
            }}
        />
    );
};

export default VantaTrunkBackground;
