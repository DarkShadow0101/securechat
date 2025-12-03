// client/src/components/AnimatedBackground.js
import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

/**
 * AnimatedBackground (fixed)
 * - preserves same visuals + framer-motion animations
 * - guards setParticles with mountedRef to avoid calling setter after unmount
 * - uses functional setState to avoid stale reads
 * - uses unique keys so React can reconcile without surprises
 * - uses explicit px units for inline styles
 */

const AnimatedBackground = () => {
  const [particles, setParticles] = useState([]);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;

    const generateParticles = () => {
      const now = Date.now();
      const newParticles = Array.from({ length: 20 }, (_, i) => ({
        id: `${now}-${i}`, // unique per generation
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        size: Math.random() * 4 + 2,
        duration: Math.random() * 20 + 10,
        delay: Math.random() * 5,
      }));
      // guard setter and use functional update
      if (mountedRef.current) setParticles(() => newParticles);
    };

    generateParticles();
    const interval = setInterval(generateParticles, 30000); // Regenerate every 30 seconds
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="absolute inset-0 z-0 pointer-events-none">
      {/* Floating Particles */}
      {particles.map((particle) => (
        <motion.div
          key={particle.id}
          className="absolute bg-white/20 rounded-full"
          style={{
            left: `${particle.x}px`,
            top: `${particle.y}px`,
            width: `${particle.size}px`,
            height: `${particle.size}px`,
          }}
          animate={{ y: [0, -100, 0], opacity: [0, 1, 0], scale: [0, 1, 0] }}
          transition={{
            duration: particle.duration,
            delay: particle.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}

      {/* Large Decorative Blobs */}
      <motion.div
        className="absolute top-20 left-20 w-32 h-32 bg-gradient-to-r from-blue-400/30 to-purple-400/30 rounded-full blur-xl"
        animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute bottom-20 right-20 w-40 h-40 bg-gradient-to-r from-pink-400/30 to-purple-400/30 rounded-full blur-xl"
        animate={{ scale: [1.2, 1, 1.2], opacity: [0.6, 0.3, 0.6] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  );
};

export default AnimatedBackground;
