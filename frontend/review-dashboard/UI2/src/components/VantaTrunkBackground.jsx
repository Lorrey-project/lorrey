import React, { useEffect, useRef } from 'react';

const VantaTrunkBackground = () => {
    const vantaRef = useRef(null);
    const vantaEffectRef = useRef(null);

    useEffect(() => {
        // Skip on mobile / touch or prefers-reduced-motion to keep mobile 100% smooth & save battery
        const isMobile = window.innerWidth < 768 || (navigator.maxTouchPoints > 1 && window.innerWidth < 1024);
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        if (isMobile || prefersReducedMotion) {
            return;
        }

        let isDestroyed = false;
        let idleCallbackId = null;

        const initVanta = async () => {
            if (isDestroyed || !vantaRef.current || vantaEffectRef.current) return;
            try {
                const [{ default: p5 }, { default: TRUNK }] = await Promise.all([
                    import('p5'),
                    import('vanta/dist/vanta.trunk.min')
                ]);

                if (isDestroyed || !vantaRef.current || vantaEffectRef.current) return;

                vantaEffectRef.current = TRUNK({
                    el: vantaRef.current,
                    p5: p5,
                    mouseControls: true,
                    touchControls: false,
                    gyroControls: false,
                    minHeight: 200.00,
                    minWidth: 200.00,
                    scale: 1.00,
                    scaleMobile: 1.00,
                    color: 0x98465f,
                    backgroundColor: 0x222426,
                    spacing: 0,
                    chaos: 1
                });
            } catch (err) {
                console.warn('Vanta background failed to load asynchronously:', err);
            }
        };

        // Defer until main thread is idle after first paint
        if ('requestIdleCallback' in window) {
            idleCallbackId = window.requestIdleCallback(() => initVanta(), { timeout: 2000 });
        } else {
            idleCallbackId = setTimeout(initVanta, 500);
        }

        // Throttled mousemove forwarder
        let rafId = null;
        let lastEvent = null;

        const onMouseMove = (e) => {
            lastEvent = e;
            if (!rafId) {
                rafId = requestAnimationFrame(() => {
                    if (vantaRef.current && lastEvent) {
                        const clonedEvent = new MouseEvent('mousemove', {
                            clientX: lastEvent.clientX,
                            clientY: lastEvent.clientY,
                            bubbles: false,
                            cancelable: false
                        });
                        vantaRef.current.dispatchEvent(clonedEvent);
                    }
                    rafId = null;
                });
            }
        };

        window.addEventListener('mousemove', onMouseMove, { passive: true });

        const onVisibilityChange = () => {
            if (document.hidden) {
                if (vantaEffectRef.current) {
                    vantaEffectRef.current.destroy();
                    vantaEffectRef.current = null;
                }
            } else {
                initVanta();
            }
        };
        document.addEventListener('visibilitychange', onVisibilityChange);

        return () => {
            isDestroyed = true;
            if (idleCallbackId) {
                if ('cancelIdleCallback' in window) window.cancelIdleCallback(idleCallbackId);
                else clearTimeout(idleCallbackId);
            }
            if (rafId) cancelAnimationFrame(rafId);
            window.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('visibilitychange', onVisibilityChange);
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
                pointerEvents: 'none',
                willChange: 'transform',
                transform: 'translateZ(0)'
            }}
        />
    );
};

export default React.memo(VantaTrunkBackground);

