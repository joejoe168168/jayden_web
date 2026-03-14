'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';

// ===== TYPES =====
type SparkleData = { left: string; top: string; animationDelay: string };

// ===== AUDIO ENGINE (Web Audio API - realistic instrument sounds) =====
function useAudio() {
  const ctxRef = useRef<AudioContext | null>(null);
  const getCtx = useCallback(() => {
    if (!ctxRef.current) {
      ctxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    // iOS requires resume after user gesture
    if (ctxRef.current.state === 'suspended') {
      ctxRef.current.resume();
    }
    return ctxRef.current;
  }, []);

  // Call this on first user interaction for iOS
  const initAudio = useCallback(() => {
    try {
      const ctx = getCtx();
      if (ctx.state === 'suspended') ctx.resume();
    } catch (e) {}
  }, [getCtx]);

  // Realistic instrument synthesis
  const playNote = useCallback((freq: number, duration: number, instrument: 'piano' | 'clarinet' | 'recorder' | 'kick' | 'punch' | 'block' = 'piano') => {
    try {
      const ctx = getCtx();
      const now = ctx.currentTime;
      
      if (instrument === 'piano') {
        // Piano: triangle + harmonics, sharp attack
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();
        osc1.type = 'triangle';
        osc1.frequency.value = freq;
        osc2.type = 'sine';
        osc2.frequency.value = freq * 2;
        const g2 = ctx.createGain();
        g2.gain.value = 0.2;
        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + duration);
        osc1.connect(gain);
        osc2.connect(g2).connect(gain);
        gain.connect(ctx.destination);
        osc1.start(now); osc2.start(now);
        osc1.stop(now + duration); osc2.stop(now + duration);
      } else if (instrument === 'clarinet') {
        // Clarinet: sawtooth + lowpass (warm, woody)
        const osc = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.value = freq;
        filter.type = 'lowpass';
        filter.frequency.value = 1200;
        filter.Q.value = 2;
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.3, now + 0.05);
        gain.gain.setValueAtTime(0.3, now + duration - 0.1);
        gain.gain.exponentialRampToValueAtTime(0.01, now + duration);
        osc.connect(filter).connect(gain).connect(ctx.destination);
        osc.start(now); osc.stop(now + duration);
      } else if (instrument === 'recorder') {
        // Recorder: sine + slight vibrato (breathy, pure)
        const osc = ctx.createOscillator();
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        lfo.type = 'sine';
        lfo.frequency.value = 5;
        lfoGain.gain.value = 3;
        lfo.connect(lfoGain).connect(osc.frequency);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + duration);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now); lfo.start(now);
        osc.stop(now + duration); lfo.stop(now + duration);
      } else if (instrument === 'kick') {
        // Kick: low thump
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(50, now + 0.15);
        gain.gain.setValueAtTime(0.6, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now); osc.stop(now + 0.3);
      } else if (instrument === 'punch') {
        // Punch: mid impact
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.1);
        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now); osc.stop(now + 0.15);
      } else if (instrument === 'block') {
        // Block: sharp snap
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = 800;
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now); osc.stop(now + 0.08);
      }
    } catch (e) { /* silent fail */ }
  }, [getCtx]);

  // Play melody with instrument
  const playMelody = useCallback((notes: { freq: number; dur: number }[], tempo: number = 200, instrument: 'piano' | 'clarinet' | 'recorder' = 'piano') => {
    let t = 0;
    notes.forEach((n) => {
      setTimeout(() => playNote(n.freq, n.dur, instrument), t);
      t += tempo;
    });
  }, [playNote]);

  // KPop Demon Hunters melodies
  // Soda Pop: catchy synth-pop riff (recognizable pattern)
  const sodaPopMelody = [
    { freq: 329.63, dur: 0.2 }, { freq: 392.0, dur: 0.2 }, { freq: 440.0, dur: 0.3 },
    { freq: 523.25, dur: 0.2 }, { freq: 440.0, dur: 0.2 }, { freq: 392.0, dur: 0.3 },
    { freq: 329.63, dur: 0.2 }, { freq: 349.23, dur: 0.2 }, { freq: 392.0, dur: 0.4 },
  ];
  
  // Golden: uplifting chorus melody
  const goldenMelody = [
    { freq: 523.25, dur: 0.3 }, { freq: 587.33, dur: 0.2 }, { freq: 659.25, dur: 0.3 },
    { freq: 783.99, dur: 0.4 }, { freq: 659.25, dur: 0.2 }, { freq: 587.33, dur: 0.2 },
    { freq: 523.25, dur: 0.3 }, { freq: 440.0, dur: 0.3 }, { freq: 523.25, dur: 0.4 },
  ];

  return { playNote, playMelody, sodaPopMelody, goldenMelody, initAudio };
}

// ===== PIANO KEYBOARD (32 keys: C3 to C6) =====
function PianoKeyboard({ onClose, playNote }: { onClose: () => void; playNote: (f: number, d: number, inst?: any) => void }) {
  // Generate 32 keys: C3 to C6 (roughly 3 octaves)
  const generateKeys = () => {
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const keys = [];
    for (let octave = 3; octave <= 6; octave++) {
      for (let i = 0; i < noteNames.length; i++) {
        const note = noteNames[i];
        const isBlack = note.includes('#');
        const freq = 130.81 * Math.pow(2, (octave - 3) + i / 12);
        keys.push({ note: `${note}${octave}`, freq, white: !isBlack });
      }
    }
    return keys.slice(0, 37); // ~32 white+black keys
  };

  const keys = generateKeys();
  const whiteKeys = keys.filter(k => k.white);
  const blackKeys = keys.filter(k => !k.white);

  // Calculate black key positions
  const getBlackKeyLeft = (note: string) => {
    const noteBase = note.replace(/\d/, '');
    const octave = parseInt(note.match(/\d/)?.[0] || '4');
    const positions: Record<string, number> = { 'C#': 0.7, 'D#': 1.7, 'F#': 3.7, 'G#': 4.7, 'A#': 5.7 };
    const octaveOffset = (octave - 3) * 7;
    return (positions[noteBase] || 0) + octaveOffset;
  };

  return (
    <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900 rounded-3xl p-6 shadow-2xl max-w-full overflow-x-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-2xl font-bold text-white">🎹 32-Key Piano</h3>
          <button onClick={onClose} className="text-white/60 hover:text-white text-2xl px-3">✕</button>
        </div>
        <div className="relative flex" style={{ minWidth: '800px' }}>
          {whiteKeys.map((k) => (
            <button key={k.note}
              onMouseDown={() => playNote(k.freq, 0.6, 'piano')}
              className="w-10 h-44 bg-gradient-to-b from-white via-gray-50 to-gray-200 border border-gray-300 mx-[1px] rounded-b-lg hover:from-yellow-100 hover:to-yellow-300 active:scale-95 transition-all shadow-md active:bg-yellow-200" />
          ))}
          {blackKeys.map((k) => (
            <button key={k.note}
              onMouseDown={() => playNote(k.freq, 0.5, 'piano')}
              className="absolute w-7 h-28 bg-gradient-to-b from-gray-700 to-black rounded-b-lg hover:from-purple-700 hover:to-purple-900 active:scale-95 transition-all shadow-lg z-10"
              style={{ left: `${getBlackKeyLeft(k.note) * 42}px` }} />
          ))}
        </div>
        <p className="text-white/40 text-center mt-4 text-sm">3 octaves: C3 → C6 🎵</p>
      </div>
    </div>
  );
}
// ===== POKEMON EFFECTS =====
function PokemonEffect({ type, x, y, onDone }: { type: string; x: number; y: number; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 2000); return () => clearTimeout(t); }, [onDone]);
  const effects: Record<string, { emoji: string; color: string; label: string }> = {
    Electric: { emoji: '⚡', color: 'from-yellow-400 to-yellow-600', label: 'Thunderbolt!' },
    Fire: { emoji: '🔥', color: 'from-orange-500 to-red-600', label: 'Flamethrower!' },
    Water: { emoji: '💧', color: 'from-blue-400 to-cyan-500', label: 'Water Gun!' },
    Grass: { emoji: '🌿', color: 'from-green-400 to-green-600', label: 'Vine Whip!' },
    Normal: { emoji: '✨', color: 'from-amber-300 to-orange-400', label: 'Tackle!' },
    Fairy: { emoji: '💫', color: 'from-pink-400 to-pink-600', label: 'Sing!' },
    'Fire/Flying': { emoji: '🔥', color: 'from-red-500 to-orange-600', label: 'Fire Blast!' },
    Psychic: { emoji: '🌀', color: 'from-purple-400 to-indigo-600', label: 'Psychic!' },
  };
  const fx = effects[type] || effects['Normal'];
  return (
    <div className="fixed z-[8000] pointer-events-none" style={{ left: x - 50, top: y - 50 }}>
      <div className="text-6xl animate-ping">{fx.emoji}</div>
      <div className={`text-lg font-bold text-center bg-gradient-to-r ${fx.color} bg-clip-text text-transparent animate-bounce`}>{fx.label}</div>
      {Array.from({ length: 8 }).map((_, i) => (
        <span key={i} className="absolute text-2xl animate-ping" style={{
          left: `${Math.cos(i * 45 * Math.PI / 180) * 60}px`,
          top: `${Math.sin(i * 45 * Math.PI / 180) * 60}px`,
          animationDelay: `${i * 0.1}s`,
        }}>{fx.emoji}</span>
      ))}
    </div>
  );
}

// ===== CUSTOM CURSOR =====
function CustomCursor() {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [trails, setTrails] = useState<{ x: number; y: number; id: number }[]>([]);
  const trailId = useRef(0);

  useEffect(() => {
    const move = (e: MouseEvent) => {
      setPos({ x: e.clientX, y: e.clientY });
      trailId.current++;
      setTrails(prev => [...prev.slice(-8), { x: e.clientX, y: e.clientY, id: trailId.current }]);
    };
    window.addEventListener('mousemove', move);
    return () => window.removeEventListener('mousemove', move);
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-[9999] hidden md:block">
      {trails.map((t, i) => (
        <span key={t.id} className="absolute text-lg transition-all duration-300" style={{
          left: t.x - 10, top: t.y - 10,
          opacity: (i + 1) / trails.length * 0.5,
          transform: `scale(${(i + 1) / trails.length})`,
        }}>⭐</span>
      ))}
      <span className="absolute text-3xl transition-transform duration-100" style={{ left: pos.x - 15, top: pos.y - 15, transform: 'rotate(0deg)' }}>⚡</span>
    </div>
  );
}

// ===== SCROLL PROGRESS =====
function ScrollProgress() {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const onScroll = () => { const h = document.documentElement.scrollHeight - window.innerHeight; setProgress(h > 0 ? (window.scrollY / h) * 100 : 0); };
    window.addEventListener('scroll', onScroll); return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return <div className="fixed top-0 left-0 h-1 bg-gradient-to-r from-pink-500 via-purple-500 to-blue-500 z-[100]" style={{ width: `${progress}%` }} />;
}

// ===== SPARKLES =====
function useSparkles(count: number) {
  const [sparkles, setSparkles] = useState<SparkleData[]>([]);
  useEffect(() => { setSparkles(Array.from({ length: count }, () => ({ left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%`, animationDelay: `${Math.random() * 5}s` }))); }, [count]);
  return sparkles;
}

function Sparkle({ style }: { style: SparkleData }) {
  return <span className="absolute text-yellow-300 text-xl animate-pulse pointer-events-none z-0" style={style}>✨</span>;
}

// ===== LOADING SCREEN =====
function LoadingScreen({ onFinish }: { onFinish: () => void }) {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => { setProgress(p => { if (p >= 100) { clearInterval(iv); setTimeout(onFinish, 300); return 100; } return p + 2; }); }, 40);
    return () => clearInterval(iv);
  }, [onFinish]);
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center">
      <div className="text-center">
        <div className="text-6xl mb-4 animate-bounce">⚡</div>
        <h1 className="text-3xl font-bold text-white mb-4">Jayden&apos;s World</h1>
        <div className="w-64 h-3 bg-purple-800 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-pink-500 to-yellow-500 transition-all" style={{ width: `${progress}%` }} /></div>
        <p className="text-purple-300 mt-2">{progress}%</p>
      </div>
    </div>
  );
}

// ===== REVEAL ON SCROLL =====
function RevealSection({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  useEffect(() => { const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setShow(true); }, { threshold: 0.1 }); if (ref.current) obs.observe(ref.current); return () => obs.disconnect(); }, []);
  return <div ref={ref} className={`transition-all duration-1000 ${show ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>{children}</div>;
}

// ===== TILT CARD =====
function TiltCard({ children }: { children: React.ReactNode }) {
  const [style, setStyle] = useState({});
  const ref = useRef<HTMLDivElement>(null);
  const onMove = (e: React.MouseEvent) => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    setStyle({ transform: `perspective(600px) rotateY(${x * 10}deg) rotateX(${-y * 10}deg)` });
  };
  return <div ref={ref} onMouseMove={onMove} onMouseLeave={() => setStyle({})} style={style} className="transition-transform duration-200">{children}</div>;
}

// ===== FLOATING EMOJI =====
function FloatingEmoji({ emoji, delay, left }: { emoji: string; delay: number; left: string }) {
  return <span className="absolute text-4xl animate-bounce pointer-events-none opacity-30" style={{ left, top: `${20 + Math.random() * 60}%`, animationDelay: `${delay}s`, animationDuration: '3s' }}>{emoji}</span>;
}

// ===== NAV DOTS =====
function NavDots({ sections, active }: { sections: string[]; active: number }) {
  return (
    <div className="fixed right-4 top-1/2 -translate-y-1/2 z-50 hidden md:flex flex-col gap-2">
      {sections.map((id, i) => (
        <a key={id} href={`#${id}`} className={`w-3 h-3 rounded-full transition-all ${i === active ? 'bg-pink-400 scale-125' : 'bg-white/30 hover:bg-white/60'}`} title={id} />
      ))}
    </div>
  );
}

// ===== VIRTUAL PIKACHU =====
function VirtualPikachu() {
  const [mood, setMood] = useState('happy');
  const [hunger, setHunger] = useState(80);
  const [energy, setEnergy] = useState(90);
  const poke = () => setMood(m => m === 'happy' ? 'excited' : 'happy');
  const feed = () => { setHunger(h => Math.min(100, h + 15)); setMood('eating'); setTimeout(() => setMood('happy'), 1500); };
  const play = () => { setEnergy(e => Math.max(0, e - 10)); setMood('playing'); setTimeout(() => setMood('happy'), 2000); };
  const faces: Record<string, string> = { happy: '(◕‿◕)', excited: '(★‿★)', eating: '(◕ᴗ◕)🍕', playing: '(≧▽≦)⚡', tired: '(─‿─)💤' };
  return (
    <div className="text-center">
      <div className="text-8xl mb-4 cursor-pointer hover:scale-110 transition" onClick={poke}>⚡</div>
      <div className="text-3xl mb-4">{faces[mood]}</div>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div><span className="text-sm">🍎 Hunger</span><div className="h-3 bg-gray-700 rounded-full mt-1"><div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${hunger}%` }} /></div></div>
        <div><span className="text-sm">⚡ Energy</span><div className="h-3 bg-gray-700 rounded-full mt-1"><div className="h-full bg-yellow-500 rounded-full transition-all" style={{ width: `${energy}%` }} /></div></div>
      </div>
      <div className="flex justify-center gap-3">
        <button onClick={feed} className="px-4 py-2 bg-green-500 rounded-full hover:scale-110 transition">🍎 Feed</button>
        <button onClick={play} className="px-4 py-2 bg-yellow-500 rounded-full hover:scale-110 transition text-black">🎾 Play</button>
        <button onClick={poke} className="px-4 py-2 bg-pink-500 rounded-full hover:scale-110 transition">🤗 Poke</button>
      </div>
    </div>
  );
}

// ===== MEMORY GAME =====
function MemoryGame() {
  const emojis = ['🕷️', '⚡', '🎵', '🥋', '⭐', '🎨', '🎮', '🍕'];
  const [cards, setCards] = useState<{ id: number; emoji: string; flipped: boolean; matched: boolean }[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  useEffect(() => { const d = [...emojis, ...emojis].sort(() => Math.random() - 0.5).map((emoji, i) => ({ id: i, emoji, flipped: false, matched: false })); setCards(d); }, []);
  useEffect(() => {
    if (selected.length === 2) {
      setMoves(m => m + 1);
      const [a, b] = selected;
      if (cards[a].emoji === cards[b].emoji) { setCards(c => c.map((card, i) => (i === a || i === b ? { ...card, matched: true } : card))); setSelected([]); }
      else setTimeout(() => setSelected([]), 800);
    }
  }, [selected, cards]);
  const flip = (i: number) => { if (selected.length < 2 && !cards[i].matched && !cards[i].flipped) setSelected(s => [...s, i]); };
  return (
    <div className="text-center">
      <div className="mb-3 text-lg font-bold text-yellow-300">Moves: {moves}</div>
      <div className="grid grid-cols-4 gap-2 max-w-xs mx-auto">
        {cards.map((c, i) => (
          <button key={c.id} onClick={() => flip(i)} className={`w-14 h-14 rounded-xl text-2xl transition-all ${c.matched ? 'bg-green-500/50' : selected.includes(i) ? 'bg-purple-500' : 'bg-indigo-600 hover:bg-indigo-500'} ${c.matched ? 'scale-90' : 'hover:scale-105'}`}>
            {c.matched || selected.includes(i) ? c.emoji : '❓'}
          </button>
        ))}
      </div>
      {cards.every(c => c.matched) && <div className="mt-3 text-green-400 font-bold animate-bounce">🎉 You Won!</div>}
    </div>
  );
}

// ===== STAR CATCH GAME =====
function StarCatchGame() {
  const [active, setActive] = useState(false);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(30);
  const [stars, setStars] = useState<{ id: number; x: number; y: number }[]>([]);

  useEffect(() => {
    if (!active) return;
    // Timer countdown
    const timer = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { setActive(false); return 0; }
        return t - 1;
      });
    }, 1000);
    // Spawn stars
    const starSpawner = setInterval(() => {
      setStars(s => [...s.slice(-5), { id: Date.now(), x: Math.random() * 80 + 10, y: Math.random() * 70 + 10 }]);
    }, 600);
    return () => { clearInterval(timer); clearInterval(starSpawner); };
  }, [active]);

  const startGame = () => { setActive(true); setScore(0); setTimeLeft(30); setStars([]); };

  return (
    <div className="text-center">
      <div className="flex justify-center gap-6 mb-4">
        <div className="text-xl font-bold text-yellow-300">⭐ {score}</div>
        <div className={`text-xl font-bold ${timeLeft <= 5 ? 'text-red-400 animate-pulse' : 'text-white'}`}>⏱️ {timeLeft}s</div>
      </div>
      {!active && timeLeft === 30 ? (
        <button onClick={startGame} className="px-8 py-3 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-full font-bold text-xl hover:scale-110 transition">⭐ Start Game!</button>
      ) : !active && timeLeft === 0 ? (
        <div>
          <div className="text-2xl font-bold text-green-400 mb-3">🎉 Time&apos;s Up!</div>
          <div className="text-lg text-white mb-4">You caught {score} stars!</div>
          <button onClick={startGame} className="px-8 py-3 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-full font-bold text-xl hover:scale-110 transition">🔄 Play Again!</button>
        </div>
      ) : (
        <div className="relative w-full h-64 bg-gradient-to-b from-indigo-900 to-purple-900 rounded-2xl overflow-hidden">
          {stars.map(s => (
            <button key={s.id} onClick={() => { setScore(sc => sc + 1); setStars(p => p.filter(x => x.id !== s.id)); }}
              className="absolute text-3xl animate-ping hover:scale-150 transition" style={{ left: `${s.x}%`, top: `${s.y}%` }}>⭐</button>
          ))}
        </div>
      )}
      {active && <button onClick={() => { setActive(false); setTimeLeft(30); }} className="mt-3 px-6 py-2 bg-red-500 rounded-full text-white font-bold">Stop</button>}
    </div>
  );
}

// ===== DRAWING CANVAS =====
function DrawingCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [color, setColor] = useState('#ff69b4');

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY };
  };

  const start = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setDrawing(true);
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) {
      const pos = getPos(e);
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
    }
  };

  const move = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing || !canvasRef.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.stroke();
  };

  const end = (e?: React.MouseEvent | React.TouchEvent) => {
    if (e) e.preventDefault();
    setDrawing(false);
  };

  const clear = () => { const ctx = canvasRef.current?.getContext('2d'); if (ctx && canvasRef.current) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height); };
  const colors = ['#ff69b4', '#ff0000', '#ff8c00', '#ffff00', '#00ff00', '#00bfff', '#8a2be2', '#ffffff'];
  return (
    <div className="text-center">
      <div className="flex justify-center gap-2 mb-3">{colors.map(c => (<button key={c} onClick={() => setColor(c)} className={`w-8 h-8 rounded-full border-2 ${color === c ? 'border-white scale-110' : 'border-transparent'} transition`} style={{ backgroundColor: c }} />))}</div>
      <canvas ref={canvasRef} width={300} height={250} className="bg-white rounded-2xl mx-auto cursor-crosshair touch-none"
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end} />
      <button onClick={clear} className="mt-3 px-6 py-2 bg-red-500 rounded-full text-white font-bold">🗑️ Clear</button>
    </div>
  );
}

// ===== MAIN HOME =====
export default function Home() {
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState(0);
  const [showPiano, setShowPiano] = useState(false);
  const [pokeEffect, setPokeEffect] = useState<{ type: string; x: number; y: number } | null>(null);
  const sparkles = useSparkles(30);
  const sectionIds = ['hero', 'about', 'food', 'kpop', 'music', 'taekwondo', 'pokemon', 'artwork', 'spiderman', 'pikachu', 'games', 'art', 'dreams'];
  const { playNote, playMelody, sodaPopMelody, goldenMelody, initAudio } = useAudio();

  const triggerPokeEffect = (type: string, e: React.MouseEvent) => {
    initAudio(); // iOS audio init
    setPokeEffect({ type, x: e.clientX, y: e.clientY });
    const freqs: Record<string, number> = { Electric: 800, Fire: 300, Water: 600, Grass: 400, Normal: 500, Fairy: 900, 'Fire/Flying': 350, Psychic: 700 };
    playNote(freqs[type] || 500, 0.3, 'punch');
  };

  useEffect(() => {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) { const i = sectionIds.indexOf(e.target.id); if (i >= 0) setActiveSection(i); } });
    }, { threshold: 0.3 });
    sectionIds.forEach(id => { const el = document.getElementById(id); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, []);

  if (loading) return <LoadingScreen onFinish={() => setLoading(false)} />;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 text-white overflow-x-hidden">
      <CustomCursor />
      <ScrollProgress />
      <NavDots sections={sectionIds} active={activeSection} />
      {sparkles.map((s, i) => <Sparkle key={i} style={s} />)}

      {/* HERO */}
      <section id="hero" className="relative min-h-screen flex items-center justify-center px-4">
        <FloatingEmoji emoji="⚡" delay={0} left="10%" />
        <FloatingEmoji emoji="🎮" delay={0.5} left="20%" />
        <FloatingEmoji emoji="🕷️" delay={1} left="80%" />
        <FloatingEmoji emoji="🎵" delay={1.5} left="70%" />
        <FloatingEmoji emoji="🥋" delay={2} left="90%" />
        <FloatingEmoji emoji="⭐" delay={0.3} left="5%" />
        <FloatingEmoji emoji="💫" delay={0.8} left="85%" />
        <FloatingEmoji emoji="🌟" delay={1.2} left="15%" />
        <div className="text-center z-10">
          <h1 className="text-5xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-yellow-300 via-pink-400 to-purple-400 bg-clip-text text-transparent animate-pulse">
            ✨ Welcome to Jayden&apos;s World ✨
          </h1>
          <p className="text-xl md:text-2xl mb-8 text-purple-200">I&apos;m Jayden — a 4-year-old superhero from Hong Kong! 🇭🇰</p>
          <p className="text-lg mb-8 text-pink-300">I love Pokémon ⚡, Spider-Man 🕷️, music 🎵, taekwondo 🥋, and K-pop 🎤</p>
          <a href="#about" className="px-10 py-4 bg-gradient-to-r from-pink-500 via-purple-500 to-blue-500 rounded-full text-xl font-bold hover:scale-110 transition-all duration-300 shadow-lg shadow-pink-500/50 inline-block magnetic-btn">
            🚀 Start the Adventure!
          </a>
        </div>
      </section>

      {/* ABOUT */}
      <RevealSection><section id="about" className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold text-center mb-12 bg-gradient-to-r from-yellow-300 to-pink-400 bg-clip-text text-transparent">😎 About Me</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { icon: '🎂', title: 'Age', value: '4 Years Old', color: 'from-pink-500 to-rose-500' },
              { title: 'Born', value: 'Hong Kong', color: 'from-blue-500 to-cyan-500', isFlag: true },
              { icon: '⚡', title: 'Superpower', value: 'Being Awesome!', color: 'from-yellow-500 to-orange-500' },
              { icon: '🏃', title: 'Personality', value: 'Active & Energetic', color: 'from-green-500 to-emerald-500' },
              { icon: '😄', title: 'Vibe', value: 'Outgoing & Confident', color: 'from-purple-500 to-violet-500' },
              { icon: '💪', title: 'Special', value: 'Super Handsome', color: 'from-red-500 to-pink-500' },
            ].map((item, i) => (
              <TiltCard key={i}>
                <div className={`p-6 rounded-3xl bg-gradient-to-br ${item.color} shadow-lg`}>
                  {(item as any).isFlag ? (
                    <div className="mb-3"><Image src="/images/hk-flag.svg" alt="Hong Kong" width={60} height={40} className="rounded shadow-md" /></div>
                  ) : (
                    <div className="text-5xl mb-3">{item.icon}</div>
                  )}
                  <div className="text-sm opacity-80">{item.title}</div>
                  <div className="text-xl font-bold">{item.value}</div>
                </div>
              </TiltCard>
            ))}
          </div>
        </div>
      </section></RevealSection>

      {/* FAVOURITE FOOD */}
      <RevealSection><section id="food" className="py-20 px-4 bg-gradient-to-b from-transparent via-orange-800/20 to-transparent">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold text-center mb-12 bg-gradient-to-r from-orange-300 to-yellow-400 bg-clip-text text-transparent">😋 Favourite Food</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { name: 'Siu Mai', emoji: '', desc: 'Dim sum champion!', color: 'from-orange-400 to-red-500', isSiuMai: true },
              { name: 'French Fries', emoji: '🍟', desc: 'Crispy & golden!', color: 'from-yellow-400 to-amber-500' },
              { name: 'Chicken', emoji: '🍗', desc: 'Yummy & juicy!', color: 'from-amber-400 to-orange-500' },
              { name: 'Fish Stick', emoji: '🐟', desc: 'Ocean goodness!', color: 'from-blue-400 to-cyan-500' },
            ].map((item, i) => (
              <TiltCard key={i}>
                <div className={`p-6 rounded-3xl bg-gradient-to-br ${item.color} shadow-xl text-center`}>
                  {(item as any).isSiuMai ? (
                    <div className="mb-3 flex justify-center"><Image src="/images/siu-mai.svg" alt="Siu Mai" width={80} height={80} className="drop-shadow-lg" /></div>
                  ) : (
                    <div className="text-6xl mb-3">{item.emoji}</div>
                  )}
                  <h3 className="text-xl font-bold">{item.name}</h3>
                  <p className="text-sm opacity-80">{item.desc}</p>
                </div>
              </TiltCard>
            ))}
          </div>
        </div>
      </section></RevealSection>

      {/* K-POP */}
      <RevealSection><section id="kpop" className="py-20 px-4 bg-gradient-to-b from-transparent via-pink-800/20 to-transparent">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold text-center mb-4 bg-gradient-to-r from-pink-300 to-purple-400 bg-clip-text text-transparent">🎤 K-Pop Demon Hunters 🎤</h2>
          <p className="text-center text-purple-200 mb-12 text-lg">My favorite songs! (from the movie Hunties)</p>
          <div className="grid md:grid-cols-2 gap-8">
            {[
              { song: 'Soda Pop', desc: 'Catchy beats! 🎶', color: 'from-cyan-400 to-blue-500', icon: '🥤', melody: sodaPopMelody },
              { song: 'Golden', desc: 'My favorite! ✨', color: 'from-yellow-400 to-amber-500', icon: '⭐', melody: goldenMelody },
            ].map((item, i) => (
              <TiltCard key={i}>
                <div className={`p-8 rounded-3xl bg-gradient-to-br ${item.color} shadow-2xl relative overflow-hidden group cursor-pointer`}
                     onClick={() => { initAudio(); playMelody(item.melody, 250, 'piano'); }}>
                  <div className="text-6xl mb-4 text-center animate-bounce">{item.icon}</div>
                  <h3 className="text-3xl font-bold text-center mb-2">{item.song}</h3>
                  <p className="text-center text-sm opacity-70">{item.desc}</p>
                  <p className="text-center text-xs mt-2 text-white/50">🎵 Click to play melody!</p>
                  <div className="flex justify-center gap-2 mt-4">
                    {['💃', '🕺', '🎵', '🎶', '✨'].map((e, j) => (
                      <span key={j} className="text-2xl opacity-0 group-hover:opacity-100 group-hover:animate-bounce transition-all duration-300" style={{ animationDelay: `${j * 0.15}s`, transitionDelay: `${j * 0.1}s` }}>{e}</span>
                    ))}
                  </div>
                </div>
              </TiltCard>
            ))}
          </div>
          <div className="flex justify-center gap-3 mt-8">
            <span className="px-4 py-2 bg-pink-500/30 rounded-full text-sm animate-pulse">🎧 Loves K-pop</span>
            <span className="px-4 py-2 bg-purple-500/30 rounded-full text-sm animate-pulse" style={{ animationDelay: '0.5s' }}>🌟 Future star</span>
          </div>
        </div>
      </section></RevealSection>

      {/* MUSIC */}
      <RevealSection><section id="music" className="py-20 px-4 bg-gradient-to-b from-transparent via-purple-800/30 to-transparent">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold text-center mb-4 bg-gradient-to-r from-cyan-300 to-purple-400 bg-clip-text text-transparent">🎵 My Musical Adventure 🎵</h2>
          <p className="text-center text-purple-200 mb-12 text-lg">Click to hear real instrument sounds!</p>
          <div className="grid md:grid-cols-3 gap-6 mt-8">
            {[
              { icon: '🎵', name: 'Clarinet', desc: 'My jazzy friend!', status: 'Learning', color: 'from-blue-500 to-indigo-600', instrument: 'clarinet' as const, melody: [
                { freq: 261.63, dur: 0.4 }, { freq: 293.66, dur: 0.3 }, { freq: 329.63, dur: 0.4 },
                { freq: 349.23, dur: 0.3 }, { freq: 392.0, dur: 0.5 },
              ]},
              { icon: '🎶', name: 'Recorder', desc: 'My first instrument!', status: 'Playing', color: 'from-green-500 to-teal-600', instrument: 'recorder' as const, melody: [
                { freq: 523.25, dur: 0.3 }, { freq: 493.88, dur: 0.3 }, { freq: 440.0, dur: 0.4 },
                { freq: 392.0, dur: 0.3 }, { freq: 349.23, dur: 0.5 },
              ]},
              { icon: '🎹', name: 'Piano', desc: '32 keys to play!', status: 'Practicing', color: 'from-purple-500 to-pink-600', isPiano: true, melody: [
                { freq: 261.63, dur: 0.3 }, { freq: 329.63, dur: 0.3 }, { freq: 392.0, dur: 0.4 },
                { freq: 523.25, dur: 0.3 }, { freq: 392.0, dur: 0.3 }, { freq: 329.63, dur: 0.5 },
              ]},
            ].map((item, i) => (
              <TiltCard key={i}>
                <div className={`p-6 rounded-3xl bg-gradient-to-br ${item.color} text-center shadow-xl cursor-pointer group`}
                     onClick={() => { initAudio(); (item as any).isPiano ? setShowPiano(true) : playMelody(item.melody, 220, item.instrument); }}>
                  <div className="text-6xl mb-4">{item.icon}</div>
                  <h3 className="text-2xl font-bold mb-2">{item.name}</h3>
                  <p className="text-white/80 mb-3">{item.desc}</p>
                  <span className="px-4 py-1 bg-white/20 rounded-full text-sm">{item.status}</span>
                  <p className="text-xs mt-2 text-white/50">🎵 Click to play!</p>
                </div>
              </TiltCard>
            ))}
          </div>
        </div>
      </section></RevealSection>

      {/* TAEKWONDO */}
      <RevealSection><section id="taekwondo" className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold text-center mb-4 bg-gradient-to-r from-red-400 to-orange-400 bg-clip-text text-transparent">🥋 Future Black Belt Hero 🥋</h2>
          <p className="text-center text-orange-200 mb-12 text-lg">Power, discipline, and awesome kicks!</p>
          <div className="flex justify-center items-center gap-4 mb-12">
            {[
              { belt: 'White', color: 'bg-gray-100', active: false },
              { belt: 'Yellow', color: 'bg-yellow-400', active: true },
              { belt: 'Green', color: 'bg-green-500', active: false },
              { belt: 'Blue', color: 'bg-blue-500', active: false },
              { belt: 'Red', color: 'bg-red-500', active: false },
              { belt: 'Black', color: 'bg-gray-900', active: false },
            ].map((item, i) => (
              <div key={i} className="flex flex-col items-center">
                <div className={`w-8 h-12 rounded ${item.color} ${item.active ? 'ring-4 ring-yellow-300 scale-125' : 'opacity-50'} transition-all`} />
                <span className="text-xs mt-2 text-white/70">{item.belt}</span>
              </div>
            ))}
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { icon: '🦵', move: 'High Kick', desc: 'Sky-high power!', sound: 'kick' as const },
              { icon: '👊', move: 'Punch Combo', desc: 'Fast and strong!', sound: 'punch' as const },
              { icon: '🛡️', move: 'Blocking', desc: 'Super defense!', sound: 'block' as const },
            ].map((item, i) => (
              <TiltCard key={i}>
                <div className="p-6 rounded-3xl bg-gradient-to-br from-red-600 to-orange-700 text-center shadow-lg cursor-pointer hover:scale-105 transition"
                     onClick={() => { initAudio(); playNote(100, 0.3, item.sound); }}>
                  <div className="text-5xl mb-3">{item.icon}</div>
                  <h3 className="text-xl font-bold">{item.move}</h3>
                  <p className="text-white/80">{item.desc}</p>
                  <p className="text-xs mt-2 text-white/50">🔊 Click for sound!</p>
                </div>
              </TiltCard>
            ))}
          </div>
        </div>
      </section></RevealSection>

      {/* POKÉMON */}
      <RevealSection><section id="pokemon" className="py-20 px-4 bg-gradient-to-b from-transparent via-yellow-800/20 to-transparent">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold text-center mb-12 bg-gradient-to-r from-yellow-300 to-blue-400 bg-clip-text text-transparent">⚡ Pokémon Collection ⚡</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { name: 'Pikachu', file: 'pikachu.png', type: 'Electric', color: 'from-yellow-300 to-yellow-500' },
              { name: 'Charmander', file: 'charmander.png', type: 'Fire', color: 'from-orange-400 to-red-500' },
              { name: 'Squirtle', file: 'squirtle.png', type: 'Water', color: 'from-blue-400 to-blue-600' },
              { name: 'Bulbasaur', file: 'bulbasaur.png', type: 'Grass', color: 'from-green-400 to-green-600' },
              { name: 'Eevee', file: 'eevee.png', type: 'Normal', color: 'from-amber-400 to-orange-500' },
              { name: 'Jigglypuff', file: 'jigglypuff.png', type: 'Fairy', color: 'from-pink-300 to-pink-500' },
              { name: 'Charizard', file: 'charizard.png', type: 'Fire/Flying', color: 'from-red-500 to-orange-600' },
              { name: 'Mewtwo', file: 'mewtwo.png', type: 'Psychic', color: 'from-purple-400 to-purple-600' },
            ].map((item, i) => (
              <TiltCard key={i}>
                <div className={`p-4 rounded-2xl bg-gradient-to-br ${item.color} shadow-lg cursor-pointer group`}
                     onClick={(e) => triggerPokeEffect(item.type, e)}>
                  <div className="relative w-full aspect-square mb-2">
                    <Image src={`/images/pokemon/${item.file}`} alt={item.name} fill className="object-contain drop-shadow-xl group-hover:scale-110 transition-transform" />
                  </div>
                  <div className="text-center">
                    <div className="font-bold">{item.name}</div>
                    <div className="text-xs opacity-80">{item.type} ⚡</div>
                  </div>
                </div>
              </TiltCard>
            ))}
          </div>
        </div>
      </section></RevealSection>

      {/* ARTWORK - 小金魚逃走了 */}
      <RevealSection><section id="artwork" className="py-20 px-4 bg-gradient-to-b from-transparent via-orange-800/20 to-transparent">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-orange-300 to-yellow-400 bg-clip-text text-transparent">🐟 小金魚逃走了 🐟</h2>
          <p className="text-orange-200 mb-8 text-lg">Jayden&apos;s awesome space art! Click to listen to the story!</p>
          <div className="max-w-md mx-auto">
            <a href="https://www.hkcot.com/goldfish/" target="_blank" rel="noopener noreferrer"
               className="block rounded-3xl shadow-2xl hover:scale-105 transition-all duration-300 group overflow-hidden">
              <div className="relative">
                <Image src="/images/goldfish-artwork.jpg" alt="Jayden's Space Art" width={400} height={400} className="w-full h-auto" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-6">
                  <span className="text-white text-xl font-bold">🎧 Click to listen to the story!</span>
                </div>
              </div>
            </a>
          </div>
        </div>
      </section></RevealSection>

      {/* SPIDER-MAN */}
      <RevealSection><section id="spiderman" className="py-20 px-4 bg-gradient-to-b from-transparent via-red-800/20 to-transparent">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold text-center mb-12 bg-gradient-to-r from-red-400 to-blue-400 bg-clip-text text-transparent">🕷️ Spider-Man Heroes 🕷️</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5].map(i => (
              <TiltCard key={i}>
                <div className="p-4 rounded-2xl bg-gradient-to-br from-red-600/30 to-blue-800/30 backdrop-blur shadow-xl cursor-pointer group">
                  <div className="relative w-full aspect-square">
                    <Image src={`/images/spiderman/spiderman_${i}.png`} alt={`Spider-Man ${i}`} fill className="object-contain drop-shadow-2xl group-hover:scale-110 transition-transform" />
                  </div>
                </div>
              </TiltCard>
            ))}
          </div>
          <p className="text-center text-red-200 mt-6 text-lg">Your friendly neighborhood hero! 🕸️</p>
        </div>
      </section></RevealSection>

      {/* VIRTUAL PIKACHU */}
      <RevealSection><section id="pikachu" className="py-20 px-4 bg-gradient-to-b from-transparent via-yellow-800/20 to-transparent">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold text-center mb-12 bg-gradient-to-r from-yellow-300 to-orange-400 bg-clip-text text-transparent">⚡ My Pet Pikachu ⚡</h2>
          <div className="max-w-md mx-auto bg-white/10 backdrop-blur rounded-3xl p-8">
            <VirtualPikachu />
          </div>
        </div>
      </section></RevealSection>

      {/* MINI GAMES */}
      <RevealSection><section id="games" className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold text-center mb-12 bg-gradient-to-r from-green-300 to-cyan-400 bg-clip-text text-transparent">🎮 Mini Games 🎮</h2>
          <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-white/10 backdrop-blur rounded-3xl p-6"><h3 className="text-2xl font-bold text-center mb-4">🧠 Memory Match</h3><MemoryGame /></div>
            <div className="bg-white/10 backdrop-blur rounded-3xl p-6"><h3 className="text-2xl font-bold text-center mb-4">⭐ Catch the Stars</h3><StarCatchGame /></div>
          </div>
        </div>
      </section></RevealSection>

      {/* DRAWING */}
      <RevealSection><section id="art" className="py-20 px-4 bg-gradient-to-b from-transparent via-pink-800/20 to-transparent">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold text-center mb-12 bg-gradient-to-r from-pink-300 to-purple-400 bg-clip-text text-transparent">🎨 Draw Something! 🎨</h2>
          <div className="max-w-md mx-auto bg-white/10 backdrop-blur rounded-3xl p-6">
            <DrawingCanvas />
          </div>
        </div>
      </section></RevealSection>

      {/* DREAMS */}
      <RevealSection><section id="dreams" className="py-20 px-4 bg-gradient-to-b from-transparent via-indigo-800/30 to-transparent">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-bold mb-12 bg-gradient-to-r from-indigo-300 to-purple-400 bg-clip-text text-transparent">✨ My Dreams ✨</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { icon: '🦸', dream: 'Be a Superhero', desc: 'Just like Spider-Man!' },
              { icon: '🎵', dream: 'Play Amazing Music', desc: 'Concerts for everyone!' },
              { icon: '🥋', dream: 'Black Belt Champion', desc: 'Strongest kicks ever!' },
            ].map((item, i) => (
              <TiltCard key={i}>
                <div className="p-6 rounded-3xl bg-gradient-to-br from-indigo-600/50 to-purple-700/50 backdrop-blur">
                  <div className="text-6xl mb-4">{item.icon}</div>
                  <h3 className="text-xl font-bold mb-2">{item.dream}</h3>
                  <p className="text-white/70">{item.desc}</p>
                </div>
              </TiltCard>
            ))}
          </div>
        </div>
      </section></RevealSection>

      {/* FOOTER */}
      <footer className="py-12 text-center text-purple-300">
        <p className="text-lg">Made with ❤️ for Jayden — The Little Superhero</p>
        <p className="text-sm mt-2 opacity-60">⚡ Keep being amazing! ⚡</p>
      </footer>

      {/* PIANO POPUP */}
      {showPiano && <PianoKeyboard onClose={() => setShowPiano(false)} playNote={playNote} />}

      {/* POKEMON EFFECT */}
      {pokeEffect && <PokemonEffect type={pokeEffect.type} x={pokeEffect.x} y={pokeEffect.y} onDone={() => setPokeEffect(null)} />}
    </div>
  );
}
