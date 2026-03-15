'use client';

import { useEffect, useRef, useState } from 'react';

export default function DrawingCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const [color, setColor] = useState('#ff69b4');
  const [brushSize, setBrushSize] = useState(6);
  const [tool, setTool] = useState<'brush' | 'eraser' | 'stamp'>('brush');
  const [stamp, setStamp] = useState('⭐');
  const historyRef = useRef<ImageData[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    historyRef.current = [ctx.getImageData(0, 0, canvas.width, canvas.height)];
  }, []);

  const saveState = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    historyRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (historyRef.current.length > 30) historyRef.current.shift();
  };

  const undo = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || historyRef.current.length <= 1) return;
    historyRef.current.pop();
    ctx.putImageData(historyRef.current[historyRef.current.length - 1], 0, 0);
  };

  const getPos = (event: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ('touches' in event) {
      return {
        x: ((event.touches[0].clientX - rect.left) / rect.width) * canvas.width,
        y: ((event.touches[0].clientY - rect.top) / rect.height) * canvas.height,
      };
    }
    return {
      x: ((event.nativeEvent.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.nativeEvent.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const placeStamp = (pos: { x: number; y: number }) => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.font = `${brushSize * 5}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(stamp, pos.x, pos.y);
  };

  const start = (event: React.MouseEvent | React.TouchEvent) => {
    event.preventDefault();
    const pos = getPos(event);
    if (tool === 'stamp') {
      placeStamp(pos);
      saveState();
      return;
    }
    setDrawing(true);
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.strokeStyle = tool === 'eraser' ? '#ffffff' : color;
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    lastPoint.current = pos;
  };

  const move = (event: React.MouseEvent | React.TouchEvent) => {
    if (!drawing || !canvasRef.current) return;
    event.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    const pos = getPos(event);
    const from = lastPoint.current ?? pos;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = tool === 'eraser' ? '#ffffff' : color;
    ctx.lineWidth = tool === 'eraser' ? brushSize * 3 : brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    lastPoint.current = pos;
  };

  const end = (event?: React.MouseEvent | React.TouchEvent) => {
    if (event) event.preventDefault();
    if (drawing) saveState();
    setDrawing(false);
    lastPoint.current = null;
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    saveState();
  };

  const save = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = 'jayden-drawing.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const colors = ['#000000', '#ffffff', '#ff69b4', '#ff3b30', '#ff9500', '#ffd60a', '#34c759', '#00c7be', '#0a84ff', '#8e44ad', '#6b4f2c', '#ff6ec7'];
  const stamps = ['⭐', '❤️', '🌈', '🦋', '🌸', '⚡', '🎵', '🕷️', '🐵', '🍌'];
  const brushSizes = [
    { size: 3, label: '·' },
    { size: 6, label: '•' },
    { size: 12, label: '●' },
    { size: 20, label: '⬤' },
  ];

  return (
    <div className="text-center">
      <div className="flex flex-wrap justify-center gap-1.5 mb-3">
        {colors.map(swatch => (
          <button
            key={swatch}
            onClick={() => { setColor(swatch); setTool('brush'); }}
            className={`w-8 h-8 rounded-full border-2 transition-all ${color === swatch && tool === 'brush' ? 'border-yellow-300 scale-125 shadow-lg shadow-yellow-300/50' : 'border-white/20 hover:scale-110'}`}
            style={{ backgroundColor: swatch }}
          />
        ))}
      </div>
      <div className="flex flex-wrap justify-center gap-1.5 mb-3">
        {brushSizes.map(brush => (
          <button
            key={brush.size}
            onClick={() => { setBrushSize(brush.size); if (tool === 'stamp') setTool('brush'); }}
            className={`w-9 h-9 rounded-full font-bold flex items-center justify-center transition-all ${brushSize === brush.size && tool !== 'stamp' ? 'bg-yellow-400 text-black scale-110' : 'bg-white/10 text-white hover:bg-white/20'}`}
          >
            {brush.label}
          </button>
        ))}
        <div className="w-px h-9 bg-white/20 mx-1" />
        <button onClick={() => setTool('brush')} className={`px-3 py-1.5 rounded-full font-bold text-sm transition-all ${tool === 'brush' ? 'bg-pink-500 scale-105' : 'bg-white/10 hover:bg-white/20'}`}>🖌️</button>
        <button onClick={() => setTool('eraser')} className={`px-3 py-1.5 rounded-full font-bold text-sm transition-all ${tool === 'eraser' ? 'bg-cyan-500 text-black scale-105' : 'bg-white/10 hover:bg-white/20'}`}>🧽</button>
        <button onClick={() => setTool('stamp')} className={`px-3 py-1.5 rounded-full font-bold text-sm transition-all ${tool === 'stamp' ? 'bg-purple-500 scale-105' : 'bg-white/10 hover:bg-white/20'}`}>🎨</button>
      </div>
      {tool === 'stamp' && (
        <div className="flex flex-wrap justify-center gap-1.5 mb-3">
          {stamps.map(nextStamp => (
            <button
              key={nextStamp}
              onClick={() => setStamp(nextStamp)}
              className={`w-10 h-10 rounded-xl text-xl flex items-center justify-center transition-all ${stamp === nextStamp ? 'bg-purple-500 scale-110 ring-2 ring-purple-300' : 'bg-white/10 hover:bg-white/20'}`}
            >
              {nextStamp}
            </button>
          ))}
        </div>
      )}
      <canvas
        ref={canvasRef}
        width={480}
        height={360}
        className="bg-white rounded-2xl mx-auto cursor-crosshair touch-none w-full max-w-[480px] shadow-xl shadow-black/30 border-2 border-white/20"
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
      />
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <button onClick={undo} className="px-4 py-2 bg-orange-500 rounded-full text-white font-bold hover:scale-105 transition">↩️ Undo</button>
        <button onClick={clear} className="px-4 py-2 bg-red-500 rounded-full text-white font-bold hover:scale-105 transition">🗑️ Clear</button>
        <button onClick={save} className="px-4 py-2 bg-green-500 rounded-full text-white font-bold hover:scale-105 transition">💾 Save</button>
      </div>
    </div>
  );
}
