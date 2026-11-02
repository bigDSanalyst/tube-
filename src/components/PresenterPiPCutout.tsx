import React, { useRef, useEffect } from 'react';
import { Volume2, VolumeX, Play, Pause, Radio, UserCheck } from 'lucide-react';

interface Props {
  isSpeakerPlaying: boolean;
  onToggleSpeakerPlay: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
  currentSpokenText: string;
  timestampSec: number;
}

export const PresenterPiPCutout: React.FC<Props> = ({
  isSpeakerPlaying,
  onToggleSpeakerPlay,
  isMuted,
  onToggleMute,
  currentSpokenText,
  timestampSec,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Render dynamic animated presenter facecam / waveform canvas
  useEffect(() => {
    let animId: number;
    let frameCount = 0;

    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;

      // Dark studio background
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, '#0f172a');
      grad.addColorStop(1, '#1e1b4b');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Studio background lighting
      ctx.fillStyle = 'rgba(99, 102, 241, 0.15)';
      ctx.beginPath();
      ctx.arc(w * 0.7, h * 0.3, 70, 0, Math.PI * 2);
      ctx.fill();

      // Draw Presenter Torso & Head
      const cx = w * 0.5;
      const cy = h * 0.52;
      const breathing = isSpeakerPlaying ? Math.sin(frameCount * 0.05) * 1.5 : 0;

      // Torso / Shoulders
      ctx.fillStyle = '#334155';
      ctx.beginPath();
      ctx.ellipse(cx, h + 10, 65, 45, 0, 0, Math.PI * 2);
      ctx.fill();

      // Shirt collar
      ctx.fillStyle = '#475569';
      ctx.beginPath();
      ctx.moveTo(cx - 20, h - 18);
      ctx.lineTo(cx, h - 8);
      ctx.lineTo(cx + 20, h - 18);
      ctx.stroke();

      // Head
      ctx.fillStyle = '#fbcfe8'; // skin tone
      ctx.beginPath();
      ctx.ellipse(cx, cy + breathing, 28, 34, 0, 0, Math.PI * 2);
      ctx.fill();

      // Hair
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.arc(cx, cy - 10 + breathing, 30, Math.PI * 0.85, Math.PI * 2.15);
      ctx.fill();

      // Eyes
      const blink = Math.floor(frameCount / 90) % 20 === 0;
      ctx.fillStyle = '#0f172a';
      if (!blink) {
        ctx.beginPath();
        ctx.arc(cx - 9, cy - 2 + breathing, 2.5, 0, Math.PI * 2);
        ctx.arc(cx + 9, cy - 2 + breathing, 2.5, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(cx - 12, cy - 2 + breathing);
        ctx.lineTo(cx - 6, cy - 2 + breathing);
        ctx.moveTo(cx + 6, cy - 2 + breathing);
        ctx.lineTo(cx + 12, cy - 2 + breathing);
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Glasses frame
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(cx - 14, cy - 7 + breathing, 10, 8);
      ctx.strokeRect(cx + 4, cy - 7 + breathing, 10, 8);
      ctx.beginPath();
      ctx.moveTo(cx - 4, cy - 3 + breathing);
      ctx.lineTo(cx + 4, cy - 3 + breathing);
      ctx.stroke();

      // Mouth (animated when speaking, static when paused)
      ctx.fillStyle = '#9f1239';
      ctx.beginPath();
      if (isSpeakerPlaying) {
        const mouthOpen = 2 + Math.abs(Math.sin(frameCount * 0.25)) * 4.5;
        ctx.ellipse(cx, cy + 16 + breathing, 6, mouthOpen, 0, 0, Math.PI * 2);
      } else {
        ctx.ellipse(cx, cy + 16, 6, 1.2, 0, 0, Math.PI * 2);
      }
      ctx.fill();

      // Microphone headset
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy - 14 + breathing, 32, -Math.PI * 0.5, 0.1);
      ctx.stroke();

      ctx.fillStyle = '#0284c7';
      ctx.beginPath();
      ctx.arc(cx + 20, cy + 16 + breathing, 3.5, 0, Math.PI * 2);
      ctx.fill();

      // Animated Soundwave overlay at bottom
      const bars = 18;
      const barWidth = 4;
      const startX = cx - (bars * (barWidth + 2)) / 2;
      for (let i = 0; i < bars; i++) {
        let barHeight = 3;
        if (isSpeakerPlaying && !isMuted) {
          barHeight = 4 + Math.abs(Math.sin(frameCount * 0.18 + i * 0.45)) * 14;
        }
        ctx.fillStyle = isSpeakerPlaying ? '#38bdf8' : '#64748b';
        ctx.fillRect(startX + i * (barWidth + 2), h - 14 - barHeight, barWidth, barHeight);
      }

      frameCount++;
      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [isSpeakerPlaying, isMuted]);

  return (
    <div
      onClick={onToggleSpeakerPlay}
      className={`relative group rounded-xl overflow-hidden border-2 transition-all duration-200 cursor-pointer shadow-2xl select-none ${
        isSpeakerPlaying
          ? 'border-amber-400/90 shadow-amber-500/20'
          : 'border-rose-500/90 shadow-rose-500/20 grayscale-[25%]'
      }`}
      style={{ width: '250px', height: '170px' }}
      title="Click to pause/play ONLY the speaker presenter (Subscreen remains live!)"
    >
      {/* Visual Canvas Facecam */}
      <canvas ref={canvasRef} width={250} height={170} className="w-full h-full block" />

      {/* Top Overlay Badge */}
      <div className="absolute top-2 left-2 right-2 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-900/80 backdrop-blur-sm border border-slate-700/80 text-[10px] font-mono">
          <Radio className={`w-3 h-3 ${isSpeakerPlaying ? 'text-amber-400 animate-pulse' : 'text-slate-500'}`} />
          <span className={isSpeakerPlaying ? 'text-amber-300 font-semibold' : 'text-rose-400'}>
            {isSpeakerPlaying ? 'SPEAKER: LIVE' : 'SPEAKER: PAUSED'}
          </span>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleMute();
          }}
          className="pointer-events-auto p-1 rounded-full bg-slate-900/80 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white transition-colors"
          title={isMuted ? 'Unmute Speaker Audio' : 'Mute Speaker Audio'}
        >
          {isMuted ? <VolumeX className="w-3.5 h-3.5 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5 text-emerald-400" />}
        </button>
      </div>

      {/* Center Tap Prompt on Hover / Paused */}
      <div
        className={`absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[1px] transition-opacity ${
          !isSpeakerPlaying ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
      >
        <div className="flex flex-col items-center gap-1 text-white bg-slate-900/90 px-3 py-1.5 rounded-lg border border-slate-700 shadow-lg text-center">
          {isSpeakerPlaying ? (
            <>
              <Pause className="w-5 h-5 text-amber-400 fill-amber-400/20" />
              <span className="text-[10px] font-medium text-amber-200">Tap to Pause Speaker</span>
            </>
          ) : (
            <>
              <Play className="w-5 h-5 text-emerald-400 fill-emerald-400/20 ml-0.5" />
              <span className="text-[10px] font-medium text-emerald-200">Tap to Resume Speaker</span>
            </>
          )}
          <span className="text-[9px] text-slate-400">Workspace stays interactive</span>
        </div>
      </div>

      {/* Bottom Subtitles Banner */}
      <div className="absolute bottom-0 inset-x-0 bg-slate-950/90 backdrop-blur-md px-2.5 py-1.5 border-t border-slate-800">
        <div className="flex items-center gap-1.5 text-[10px] text-amber-300/90 truncate font-sans">
          <span className="font-semibold text-slate-400">🗣</span>
          <span className="truncate italic">"{currentSpokenText || 'Streaming presentation...'}"</span>
        </div>
      </div>
    </div>
  );
};
