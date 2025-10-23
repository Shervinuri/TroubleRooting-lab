
import React, { useRef, useEffect } from 'react';

// Configuration for the starfield
const STAR_COUNT = 3000; // Increased star count for a denser, more galactic feel
const STAR_COLORS = ['#FFA500', '#FF4500', '#FFFF00', '#FFDAB9', '#FFFFFF']; // Orange, Red-Orange, Yellow, Peach, White
const ZOOM_SPEED = 0.04; // Controls how fast the camera appears to move backward
const ROTATION_SPEED = 0.0001; // Controls the speed of the camera's rotation

interface Star {
  x: number; // 3D x-coordinate
  y: number; // 3D y-coordinate
  z: number; // 3D z-coordinate (depth)
  color: string;
}

const NetworkBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let stars: Star[] = [];
    let width: number, height: number;
    let centerX: number, centerY: number;

    const init = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      centerX = width / 2;
      centerY = height / 2;
      stars = [];
      for (let i = 0; i < STAR_COUNT; i++) {
        stars.push(createStar());
      }
    };

    const createStar = (): Star => {
      // Stars are created in a 3D box, then projected to the screen
      return {
        x: (Math.random() - 0.5) * width * 2,
        y: (Math.random() - 0.5) * height * 2,
        z: Math.random() * width, // Start at a random depth
        color: STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)],
      };
    };

    const animate = () => {
      // Get a continuous rotation angle based on time
      const angle = Date.now() * ROTATION_SPEED;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      // Clear the canvas with the base background color
      ctx.fillStyle = '#050505';
      ctx.fillRect(0, 0, width, height);
      
      stars.forEach(star => {
        // This simulates the camera moving backward by pushing stars further away
        star.z += ZOOM_SPEED;

        // If a star is too far away (behind the "camera"), reset it to the front
        if (star.z > width) {
          Object.assign(star, createStar());
          star.z = 0;
        }

        // 3D to 2D projection logic
        const scale = width / (width + star.z);
        let projX = star.x * scale + centerX;
        let projY = star.y * scale + centerY;

        // Rotate the projected 2D coordinates around the center for the spinning effect
        const dx = projX - centerX;
        const dy = projY - centerY;
        projX = centerX + (dx * cos - dy * sin);
        projY = centerY + (dx * sin + dy * cos);

        // Star size is based on its distance (z-coordinate)
        const size = (1 - star.z / width) * 3;

        // Draw the star if it's visible on the screen
        if (size > 0.1 && projX > 0 && projX < width && projY > 0 && projY < height) {
            ctx.shadowBlur = 8; // Add glow effect
            ctx.shadowColor = star.color; // Glow with the star's color
            ctx.beginPath();
            ctx.arc(projX, projY, size, 0, Math.PI * 2);
            ctx.fillStyle = star.color;
            ctx.fill();
        }
      });
      
      ctx.shadowBlur = 0; // Reset shadow for other elements if any
      animationFrameId = requestAnimationFrame(animate);
    };

    window.addEventListener('resize', init);
    init();
    animate();

    return () => {
      window.removeEventListener('resize', init);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full -z-10 bg-[#050505]" />;
};

export default NetworkBackground;
