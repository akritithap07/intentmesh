'use client';
import { useState, useEffect } from 'react';
import { motion, useSpring } from 'framer-motion';

export function GlobalCursor() {
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const cx = useSpring(0, { stiffness: 120, damping: 18 });
  const cy = useSpring(0, { stiffness: 120, damping: 18 });

  useEffect(() => {
    const onMouse = (e: MouseEvent) => {
      setMouse({ x: e.clientX, y: e.clientY });
      cx.set(e.clientX);
      cy.set(e.clientY);
    };
    window.addEventListener('mousemove', onMouse);
    return () => window.removeEventListener('mousemove', onMouse);
  }, [cx, cy]);

  return (
    <>
      <motion.div style={{
        position: 'fixed', width: 6, height: 6, background: '#ff2d78',
        borderRadius: '50%', pointerEvents: 'none', zIndex: 9999,
        x: mouse.x - 3, y: mouse.y - 3,
      }} />
      <motion.div style={{
        position: 'fixed', width: 32, height: 32,
        border: '1.5px solid rgba(255,45,120,0.45)',
        borderRadius: '50%', pointerEvents: 'none', zIndex: 9998,
        x: cx, y: cy, translateX: '-50%', translateY: '-50%',
      }} />
    </>
  );
}