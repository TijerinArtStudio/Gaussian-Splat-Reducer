
import React, { useRef, useEffect, useState } from 'react';

interface ColorWheelProps {
  color: string;
  onChange: (color: string) => void;
  tolerance: number; // 0-100
  disabled?: boolean;
}

export const ColorWheel: React.FC<ColorWheelProps> = ({ color, onChange, tolerance, disabled }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectorPos, setSelectorPos] = useState<{x: number, y: number} | null>(null);

  const DISPLAY_SIZE = 220;

  // Draw scene function using logical coordinates (0 to DISPLAY_SIZE)
  const drawScene = (
      ctx: CanvasRenderingContext2D, 
      width: number, 
      height: number, 
      sel: {x: number, y: number} | null
  ) => {
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) / 2 - 10;

    // Clear the canvas using the full transformed space
    // Since we used scale(dpr, dpr), clearing 0,0,width,height works in logical coords
    ctx.clearRect(0, 0, width, height);

    // 1. Draw Hue Ring
    for (let i = 0; i < 360; i+=2) {
        const startAngle = (i - 90) * Math.PI / 180;
        const endAngle = (i + 2 - 90) * Math.PI / 180;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, startAngle, endAngle);
        ctx.fillStyle = `hsl(${i}, 100%, 50%)`;
        ctx.fill();
    }
    
    // 2. Saturation/Lightness Overlay
    const grd = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
    grd.addColorStop(0, 'white');
    grd.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    ctx.fill();

    // 3. Draw Selector
    if (sel) {
        // Ring representing tolerance
        ctx.beginPath();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 4;
        
        const selectionRadius = 6 + (tolerance / 100) * (radius * 0.8);
        
        ctx.arc(sel.x, sel.y, selectionRadius, 0, 2 * Math.PI);
        ctx.stroke();
        
        // Center Dot
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.fillStyle = 'white';
        ctx.arc(sel.x, sel.y, 4, 0, 2 * Math.PI);
        ctx.fill();
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 1;
        ctx.stroke();
    } else {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText("Click to pick", centerX, centerY);
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // High DPI Setup
    const dpr = window.devicePixelRatio || 1;
    
    // Set internal size to physical pixels
    canvas.width = DISPLAY_SIZE * dpr;
    canvas.height = DISPLAY_SIZE * dpr;
    
    // Set display size to logical pixels via CSS
    canvas.style.width = `${DISPLAY_SIZE}px`;
    canvas.style.height = `${DISPLAY_SIZE}px`;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    // Scale context so drawing operations use logical pixels
    ctx.scale(dpr, dpr);
    
    drawScene(ctx, DISPLAY_SIZE, DISPLAY_SIZE, selectorPos);
  }, [tolerance, selectorPos]);

  const handleInteraction = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let clientX, clientY;
    if ('touches' in e) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    } else {
        clientX = (e as React.MouseEvent).clientX;
        clientY = (e as React.MouseEvent).clientY;
        
        if (e.type === 'mousedown') setIsDragging(true);
        if (e.type === 'mouseup') setIsDragging(false);
        if (e.type === 'mousemove' && !isDragging) return;
    }

    const rect = canvas.getBoundingClientRect();
    // Calculate logical coordinates relative to canvas
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    const centerX = DISPLAY_SIZE / 2;
    const centerY = DISPLAY_SIZE / 2;
    const radius = DISPLAY_SIZE / 2 - 10;
    const dist = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
    
    if (dist > radius + 5) return; 

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    
    // Temporarily redraw clean scene to sample color
    drawScene(ctx, DISPLAY_SIZE, DISPLAY_SIZE, null);
    
    const dpr = window.devicePixelRatio || 1;
    // getImageData uses physical pixels
    const pixel = ctx.getImageData(x * dpr, y * dpr, 1, 1).data;
    const toHex = (n: number) => n.toString(16).padStart(2, '0');
    const hex = `#${toHex(pixel[0])}${toHex(pixel[1])}${toHex(pixel[2])}`;
    
    setSelectorPos({ x, y });
    onChange(hex);
    
    // Redraw with selector
    drawScene(ctx, DISPLAY_SIZE, DISPLAY_SIZE, { x, y });
  };

  return (
    <div className="flex flex-col items-center space-y-3">
        <canvas 
            ref={canvasRef}
            className={`rounded-full cursor-crosshair shadow-2xl border-4 border-gray-800 bg-gray-900 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
            onMouseDown={handleInteraction}
            onMouseMove={handleInteraction}
            onMouseUp={() => setIsDragging(false)}
            onMouseLeave={() => setIsDragging(false)}
            onTouchStart={handleInteraction}
            onTouchMove={handleInteraction}
        />
        <div className="flex items-center space-x-3 bg-gray-900/50 px-3 py-1.5 rounded-lg border border-gray-700">
            <div 
                className="w-8 h-8 rounded-full border-2 border-white shadow-sm" 
                style={{ backgroundColor: color }}
            ></div>
            <div className="flex flex-col">
                <span className="text-xs text-gray-400 uppercase tracking-wider">Selected</span>
                <span className="text-sm font-mono text-cyan-400 font-bold">{color}</span>
            </div>
        </div>
    </div>
  );
};
