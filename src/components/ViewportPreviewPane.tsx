import React, { useRef, useEffect, useState } from 'react';
import { Eye, ExternalLink, Box, Sparkles, Activity, Lock, RefreshCw } from 'lucide-react';
import { ViewportConfig } from '../types/v2e';

interface Props {
  config: ViewportConfig;
  onUpdateConfig: (updated: ViewportConfig) => void;
  onPopOut: () => void;
  isPopoutAllowed: boolean;
  displayStr: string;
  isForked: boolean;
}

export const ViewportPreviewPane: React.FC<Props> = ({
  config,
  onUpdateConfig,
  onPopOut,
  isPopoutAllowed,
  displayStr,
  isForked,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [rotX, setRotX] = useState(0.4);
  const [rotY, setRotY] = useState(0.6);
  const lastMousePos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [fps, setFps] = useState(60);

  // 3D Canvas Rendering Loop
  useEffect(() => {
    let animId: number;
    let localRotY = rotY;
    let lastTime = performance.now();
    let frames = 0;

    const render = (time: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Calculate FPS
      frames++;
      if (time - lastTime >= 1000) {
        setFps(Math.round((frames * 1000) / (time - lastTime)));
        frames = 0;
        lastTime = time;
      }

      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;

      // Dark futuristic viewport background
      ctx.fillStyle = '#090d16';
      ctx.fillRect(0, 0, w, h);

      // Draw faint perspective grid lines
      ctx.strokeStyle = 'rgba(30, 41, 59, 0.4)';
      ctx.lineWidth = 1;
      const gridSpacing = 28;
      for (let x = 0; x < w; x += gridSpacing) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += gridSpacing) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // Auto-rotation when not user-dragging
      if (!isDragging) {
        localRotY += config.rotationSpeed;
      }

      // 3D Math Projection Helper
      const project = (x: number, y: number, z: number): [number, number, number] => {
        // Rotate around Y
        const cosY = Math.cos(localRotY);
        const sinY = Math.sin(localRotY);
        const x1 = x * cosY + z * sinY;
        const z1 = -x * sinY + z * cosY;

        // Rotate around X
        const cosX = Math.cos(rotX);
        const sinX = Math.sin(rotX);
        const y2 = y * cosX - z1 * sinX;
        const z2 = y * sinX + z1 * cosX;

        // Perspective divide
        const fov = 340;
        const dist = 380;
        const scale = fov / (dist + z2);
        return [cx + x1 * scale, cy + y2 * scale, z2];
      };

      ctx.save();

      if (config.meshType === 'cube') {
        const size = 70;
        const vertices = [
          [-size, -size, -size],
          [size, -size, -size],
          [size, size, -size],
          [-size, size, -size],
          [-size, -size, size],
          [size, -size, size],
          [size, size, size],
          [-size, size, size],
        ];

        const edges = [
          [0, 1], [1, 2], [2, 3], [3, 0],
          [4, 5], [5, 6], [6, 7], [7, 4],
          [0, 4], [1, 5], [2, 6], [3, 7],
        ];

        const proj = vertices.map(([x, y, z]) => project(x, y, z));

        ctx.strokeStyle = config.primaryColor || '#10b981';
        ctx.lineWidth = config.wireframe ? 1.5 : 3;

        edges.forEach(([i, j]) => {
          ctx.beginPath();
          ctx.moveTo(proj[i][0], proj[i][1]);
          ctx.lineTo(proj[j][0], proj[j][1]);
          ctx.stroke();
        });

        // Vertex glow nodes
        proj.forEach(([px, py]) => {
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(px, py, 3, 0, Math.PI * 2);
          ctx.fill();
        });
      } else if (config.meshType === 'sphere' || config.meshType === 'torus') {
        // Torus / Sphere parametric rings
        const rings = 12;
        const segments = 16;
        const R = config.meshType === 'torus' ? 70 : 65;
        const r = config.meshType === 'torus' ? 30 : 50;

        ctx.strokeStyle = config.primaryColor || '#38bdf8';
        ctx.lineWidth = 1.2;

        for (let i = 0; i < rings; i++) {
          const u = (i / rings) * Math.PI * 2;
          ctx.beginPath();
          for (let j = 0; j <= segments; j++) {
            const v = (j / segments) * Math.PI * 2;
            let x, y, z;
            if (config.meshType === 'torus') {
              x = (R + r * Math.cos(v)) * Math.cos(u);
              y = (R + r * Math.cos(v)) * Math.sin(u);
              z = r * Math.sin(v);
            } else {
              x = R * Math.sin(u) * Math.cos(v);
              y = R * Math.cos(u);
              z = R * Math.sin(u) * Math.sin(v);
            }
            const [px, py] = project(x, y, z);
            if (j === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.stroke();
        }
      } else {
        // Neural Graph mesh
        const nodes = 18;
        const points: [number, number, number][] = [];
        for (let i = 0; i < nodes; i++) {
          const phi = (i / nodes) * Math.PI * 2;
          const rad = 75 + Math.sin(i * 1.5) * 20;
          points.push([
            Math.cos(phi) * rad,
            Math.sin(phi * 2) * 45,
            Math.sin(phi) * rad,
          ]);
        }

        const proj = points.map(([x, y, z]) => project(x, y, z));
        ctx.strokeStyle = config.primaryColor || '#a855f7';
        ctx.lineWidth = 1;

        for (let i = 0; i < proj.length; i++) {
          for (let j = i + 1; j < proj.length; j++) {
            const dx = proj[i][0] - proj[j][0];
            const dy = proj[i][1] - proj[j][1];
            if (Math.sqrt(dx * dx + dy * dy) < 85) {
              ctx.beginPath();
              ctx.moveTo(proj[i][0], proj[i][1]);
              ctx.lineTo(proj[j][0], proj[j][1]);
              ctx.stroke();
            }
          }
        }

        proj.forEach(([px, py]) => {
          ctx.fillStyle = '#e2e8f0';
          ctx.beginPath();
          ctx.arc(px, py, 3.5, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      ctx.restore();
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [config, isDragging, rotX, rotY]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true);
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging) return;
    const dx = e.clientX - lastMousePos.current.x;
    const dy = e.clientY - lastMousePos.current.y;
    lastMousePos.current = { x: e.clientX, y: e.clientY };
    setRotY((prev) => prev + dx * 0.015);
    setRotX((prev) => Math.max(-1.4, Math.min(1.4, prev + dy * 0.015)));
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  return (
    <div className="flex flex-col h-full bg-[#0b0f17] border border-slate-800 rounded-lg overflow-hidden font-mono text-xs shadow-inner select-none">
      {/* Pane Window Title Bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#161b22] border-b border-slate-800 text-slate-300">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80 inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block" />
          </div>
          <span className="text-slate-500">|</span>
          <div className="flex items-center gap-1.5 text-amber-400 font-semibold">
            <Box className="w-3.5 h-3.5" />
            <span>3D VIEWPORT / OUTPUT PANE</span>
          </div>
          <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-400 border border-slate-700">
            {displayStr} (OpenGL/GLX) • {isForked ? 'LIVE FORK' : 'SYNCED'}
          </span>
        </div>

        {/* Pop-Out Action Button */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => {
              const types: ViewportConfig['meshType'][] = ['torus', 'cube', 'sphere', 'neural_graph'];
              const nextIdx = (types.indexOf(config.meshType) + 1) % types.length;
              onUpdateConfig({ ...config, meshType: types[nextIdx] });
            }}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
            title="Cycle 3D Mesh Geometry"
          >
            <Sparkles className="w-3 h-3 text-amber-400" />
            <span className="text-[10px] capitalize">{config.meshType}</span>
          </button>

          <button
            onClick={onPopOut}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-semibold border transition-all ${
              isPopoutAllowed
                ? 'bg-purple-950/80 hover:bg-purple-900 border-purple-600 text-purple-200 shadow-sm'
                : 'bg-slate-800/80 border-slate-700 text-slate-500 cursor-not-allowed'
            }`}
            title={isPopoutAllowed ? 'Pop out 3D Viewport into isolated browser tab (:101)' : 'Restricted by Publisher Policy'}
          >
            {isPopoutAllowed ? <ExternalLink className="w-3 h-3 text-purple-300" /> : <Lock className="w-3 h-3 text-rose-400" />}
            <span>Pop Out Viewport Tab</span>
          </button>
        </div>
      </div>

      {/* Viewport Canvas with interactive drag controls */}
      <div className="flex-1 relative overflow-hidden flex items-center justify-center bg-[#090d16] cursor-grab active:cursor-grabbing">
        <canvas
          ref={canvasRef}
          width={480}
          height={320}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          className="w-full h-full block"
          title="Click and drag to rotate 3D object in real-time"
        />

        {/* Overlay Badges */}
        <div className="absolute top-2 left-2 flex items-center gap-2 pointer-events-none">
          <span className="px-1.5 py-0.5 bg-black/70 backdrop-blur-sm border border-slate-700/80 rounded text-[10px] text-emerald-400 font-mono flex items-center gap-1">
            <Activity className="w-3 h-3 text-emerald-400 animate-pulse" />
            {fps} FPS
          </span>
          <span className="px-1.5 py-0.5 bg-black/70 backdrop-blur-sm border border-slate-700/80 rounded text-[10px] text-slate-300 font-mono">
            Shader: GLSL 3.3
          </span>
        </div>

        <div className="absolute bottom-2 right-2 flex items-center gap-1 pointer-events-auto">
          <label className="text-[10px] flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-sm border border-slate-800 text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={config.wireframe}
              onChange={(e) => onUpdateConfig({ ...config, wireframe: e.target.checked })}
              className="accent-indigo-500"
            />
            <span>Wireframe</span>
          </label>
        </div>
      </div>

      {/* Viewport Control Bar */}
      <div className="flex items-center justify-between px-3 py-1 bg-[#161b22] border-t border-slate-800 text-[10px] text-slate-400">
        <div className="flex items-center gap-2">
          <span>Speed:</span>
          <input
            type="range"
            min="0"
            max="0.06"
            step="0.005"
            value={config.rotationSpeed}
            onChange={(e) => onUpdateConfig({ ...config, rotationSpeed: parseFloat(e.target.value) })}
            className="w-16 accent-amber-400 h-1 bg-slate-700 rounded cursor-pointer"
          />
        </div>
        <div className="flex items-center gap-2 text-slate-400">
          <span>Interactive Canvas Drag Active</span>
          <span className="text-cyan-400">● GLX Pipe Active</span>
        </div>
      </div>
    </div>
  );
};
