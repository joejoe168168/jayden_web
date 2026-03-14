'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';

// ===== TYPES =====
type SparkleData = { left: string; top: string; animationDelay: string };

// ===== AUDIO ENGINE (Web Audio API - no files needed) =====
function useAudio() {
  const ctxRef = useRef<AudioContext | null>(null);
  const getCtx = useCallback(() => {
    if (!ctxRef.current) ctxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    return ctxRef.current;
  }, []);

  const playNote = useCallback((freq: number, duration: number, type: OscillatorType = 'triangle') => {
    try {
      const ctx = getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) { /* silent fail */ }
  }, [getCtx]);

  const playMelody = useCallback((notes: number[], tempo: number = 200) => {
    notes.forEach((freq, i) => {
      setTimeout(() => playNote(freq, 0.3), i * tempo);
    });
  }, [playNote]);

  return { playNote, playMelody };
}

// ===== PIANO KEYBOARD =====
function PianoKeyboard({ onClose, playNote }: { onClose: () => void; playNote: (f: number, d: number) => void }) {
  const keys = [
    { note: 'C4', freq: 261.63, white: true }, { note: 'C#4', freq: 277.18, white: false },
    { note: 'D4', freq: 293.66, white: true }, { note: 'D#4', freq: 311.13, white: false },
    { note: 'E4', freq: 329.63, white: true },
    { note: 'F4', freq: 349.23, white: true }, { note: 'F#4', freq: 369.99, white: false },
    { note: 'G4', freq: 392.0, white: true }, { note: 'G#4', freq: 415.3, white: false },
    { note: 'A4', freq: 440.0, white: true }, { note: 'A#4', freq: 466.16, white: false },
    { note: 'B4', freq: 493.88, white: true },
    { note: 'C5', freq: 523.25, white: true },
  ];

  return (
    <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-gradient-to-b from-gray-900 to-gray-800 rounded-3xl p-8 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-2xl font-bold text-white">🎹 Piano</h3>
          <button onClick={onClose} className="text-white/60 hover:text-white text-2xl">✕</button>
        </div>
        <div className="relative flex">
          {keys.filter(k => k.white).map((k) => (
            <button key={k.note}
              onMouseDown={() => playNote(k.freq, 0.5)}
              className="w-12 h-40 bg-gradient-to-b from-white to-gray-100 rounded-b-lg border border-gray-300 mx-0.5 hover:from-yellow-100 hover:to-yellow-200 active:scale-95 transition-all shadow-md" />
          ))}
          {keys.filter(k => !k.white).map((k, i) => {
            const blackPositions = [0.75, 1.75, 3.75, 4.75, 5.75, 7.75, 8.75];
            return (
              <button key={k.note}
                onMouseDown={() => playNote(k.freq, 0.5)}
                className="absolute w-8 h-24 bg-gradient-to-b from-gray-800 to-black rounded-b-lg hover:from-purple-900 hover:to-purple-800 active:scale-95 transition-all shadow-lg z-10"
                style={{ left: `${blackPositions[i] * 52}px` }} />
            );
          })}
        </div>
        <p className="text-white/40 text-center mt-4 text-sm">Click keys to play!</p>
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
        }}>⚡</span>
      ))}
      <span className="absolute text-2xl transition-all duration-100" style={{ left: pos.x - 12, top: pos.y - 12 }}>⚡</span>
    </div>
  );
}

// ===== SCROLL PROGRESS =====
function ScrollProgress() {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(h > 0 ? window.scrollY / h : 0);
    };
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return <div className="fixed top-0 left-0 h-1 bg-gradient-to-r from-pink-500 via-yellow-400 via-green-400 via-blue-400 to-purple-500 z-[100] transition-all duration-100" style={{ width: `${progress * 100}%` }} />;
}

// ===== LOADING SCREEN =====
function LoadingScreen({ onFinish }: { onFinish: () => void }) {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setProgress(p => {
        if (p >= 100) { clearInterval(timer); setTimeout(onFinish, 300); return 100; }
        return p + 4;
      });
    }, 40);
    return () => clearInterval(timer);
  }, [onFinish]);
  return (
    <div className="fixed inset-0 bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 z-[10000] flex flex-col items-center justify-center">
      <div className="text-8xl mb-6 animate-bounce">⚡</div>
      <h1 className="text-4xl font-bold text-white mb-4">Jayden&apos;s World</h1>
      <div className="w-64 h-3 bg-white/20 rounded-full overflow-hidden">
        <div className="h-full bg-gradient-to-r from-yellow-400 to-pink-500 rounded-full transition-all duration-200" style={{ width: `${progress}%` }} />
      </div>
      <p className="text-white/60 mt-3 text-sm">Loading magic... {progress}%</p>
    </div>
  );
}

// ===== NAV DOTS =====
function NavDots({ sections, active }: { sections: string[]; active: number }) {
  const scrollTo = (i: number) => document.getElementById(sections[i])?.scrollIntoView({ behavior: 'smooth' });
  return (
    <nav className="fixed right-4 top-1/2 -translate-y-1/2 z-50 hidden md:flex flex-col gap-3">
      {sections.map((_, i) => (
        <button key={i} onClick={() => scrollTo(i)}
          className={`w-3 h-3 rounded-full transition-all duration-300 ${i === active ? 'bg-white scale-125 shadow-lg shadow-white/50' : 'bg-white/30 hover:bg-white/60'}`} />
      ))}
    </nav>
  );
}

// ===== SPARKLES =====
function useSparkles(count: number): SparkleData[] {
  const [sparkles, setSparkles] = useState<SparkleData[]>([]);
  useEffect(() => {
    setSparkles(Array.from({ length: count }).map(() => ({
      left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%`, animationDelay: `${Math.random() * 3}s`,
    })));
  }, [count]);
  return sparkles;
}

function Sparkle({ style }: { style: React.CSSProperties }) {
  return <div className="absolute w-2 h-2 bg-yellow-300 rounded-full animate-ping pointer-events-none" style={style} />;
}

// ===== FLOATING EMOJI =====
function FloatingEmoji({ emoji, delay, left }: { emoji: string; delay: number; left: string }) {
  return (
    <span className="absolute text-4xl animate-bounce opacity-70 pointer-events-none select-none"
      style={{ left, top: '20%', animationDelay: `${delay}s`, animationDuration: '3s' }}>{emoji}</span>
  );
}

// ===== SCROLL REVEAL HOOK =====
function useScrollReveal() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { el.classList.add('revealed'); obs.disconnect(); }
    }, { threshold: 0.15 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return ref;
}

function RevealSection({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useScrollReveal();
  return (
    <div ref={ref} className={`reveal-section ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

// ===== 3D TILT CARD =====
function TiltCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const handleMove = useCallback((e: React.MouseEvent) => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(600px) rotateY(${x * 15}deg) rotateX(${-y * 15}deg) scale(1.05)`;
  }, []);
  const handleLeave = useCallback(() => {
    if (ref.current) ref.current.style.transform = 'perspective(600px) rotateY(0) rotateX(0) scale(1)';
  }, []);
  return (
    <div ref={ref} onMouseMove={handleMove} onMouseLeave={handleLeave} className={`transition-transform duration-200 ${className}`}>
      {children}
    </div>
  );
}

// ===== VIRTUAL PIKACHU =====
function VirtualPikachu() {
  const [mood, setMood] = useState('happy');
  const [hearts, setHearts] = useState<{ id: number }[]>([]);
  const [hunger, setHunger] = useState(80);
  const heartId = useRef(0);

  useEffect(() => {
    const timer = setInterval(() => setHunger(h => Math.max(0, h - 2)), 3000);
    return () => clearInterval(timer);
  }, []);

  const pet = () => {
    setMood('love');
    heartId.current++;
    setHearts(h => [...h.slice(-5), { id: heartId.current }]);
    setTimeout(() => setMood('happy'), 1500);
  };
  const feed = () => { setHunger(h => Math.min(100, h + 20)); setMood('eating'); setTimeout(() => setMood('happy'), 1500); };

  return (
    <div className="text-center p-6">
      <div className="relative inline-block">
        <div onClick={pet} className="text-8xl cursor-pointer hover:scale-110 transition-transform select-none">
          {mood === 'love' ? '🥰' : mood === 'eating' ? '😋' : hunger < 30 ? '😢' : '😊'}
        </div>
        {hearts.map(h => (
          <span key={h.id} className="absolute -top-2 left-1/2 text-2xl animate-float-up">❤️</span>
        ))}
      </div>
      <div className="mt-4 flex justify-center gap-3">
        <button onClick={pet} className="px-4 py-2 bg-pink-500 rounded-full text-white font-bold hover:scale-110 transition">💕 Pet</button>
        <button onClick={feed} className="px-4 py-2 bg-yellow-500 rounded-full text-white font-bold hover:scale-110 transition">🍖 Feed</button>
      </div>
      <div className="mt-3 w-48 mx-auto">
        <div className="text-xs text-white/60 mb-1">Hunger: {hunger}%</div>
        <div className="h-2 bg-white/20 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-500 ${hunger > 50 ? 'bg-green-400' : hunger > 20 ? 'bg-yellow-400' : 'bg-red-400'}`} style={{ width: `${hunger}%` }} />
        </div>
      </div>
    </div>
  );
}

// ===== DRAWING CANVAS =====
function DrawingCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#FF69B4');

  const startDraw = (e: React.MouseEvent) => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
    setIsDrawing(true);
  };
  const draw = (e: React.MouseEvent) => {
    if (!isDrawing) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.lineTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.stroke();
  };
  const endDraw = () => setIsDrawing(false);
  const clear = () => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx || !canvasRef.current) return;
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
  };

  return (
    <div className="text-center">
      <canvas ref={canvasRef} width={350} height={250}
        className="bg-white rounded-2xl cursor-crosshair mx-auto shadow-xl"
        onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw} />
      <div className="flex justify-center gap-2 mt-4">
        {['#FF69B4', '#FFD700', '#00BFFF', '#FF4500', '#32CD32', '#9370DB'].map(c => (
          <button key={c} onClick={() => setColor(c)} className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-125 ${color === c ? 'border-white scale-125' : 'border-transparent'}`} style={{ backgroundColor: c }} />
        ))}
        <button onClick={clear} className="px-4 py-1 bg-white/20 rounded-full text-white text-sm hover:bg-white/30 transition">🗑️ Clear</button>
      </div>
    </div>
  );
}

// ===== MEMORY GAME =====
function MemoryGame() {
  const emojis = ['⚡', '🕷️', '🎵', '🥋', '⭐', '🎮', '💫', '🌟'];
  const [cards, setCards] = useState<string[]>([]);
  const [flipped, setFlipped] = useState<number[]>([]);
  const [matched, setMatched] = useState<number[]>([]);
  const [gameWon, setGameWon] = useState(false);

  useEffect(() => { setCards([...emojis, ...emojis].sort(() => Math.random() - 0.5)); }, []);

  const handleFlip = (index: number) => {
    if (flipped.length === 2 || flipped.includes(index) || matched.includes(index)) return;
    const newFlipped = [...flipped, index];
    setFlipped(newFlipped);
    if (newFlipped.length === 2) {
      if (cards[newFlipped[0]] === cards[newFlipped[1]]) {
        const m = [...matched, ...newFlipped]; setMatched(m); setFlipped([]);
        if (m.length === cards.length) setGameWon(true);
      } else setTimeout(() => setFlipped([]), 1000);
    }
  };
  const reset = () => { setCards([...emojis, ...emojis].sort(() => Math.random() - 0.5)); setMatched([]); setFlipped([]); setGameWon(false); };

  return (
    <div className="text-center">
      {gameWon && <div className="mb-4 text-2xl font-bold text-yellow-300 animate-bounce">🎉 You Won! 🎉</div>}
      <div className="grid grid-cols-4 gap-3 max-w-xs mx-auto">
        {cards.map((emoji, i) => (
          <button key={i} onClick={() => handleFlip(i)}
            className={`aspect-square text-3xl rounded-xl transition-all duration-300 transform ${flipped.includes(i) || matched.includes(i) ? 'bg-gradient-to-br from-purple-500 to-pink-500' : 'bg-gradient-to-br from-blue-600 to-purple-700 hover:scale-105'} ${matched.includes(i) ? 'ring-4 ring-yellow-400' : ''}`}>
            {flipped.includes(i) || matched.includes(i) ? emoji : '❓'}
          </button>
        ))}
      </div>
      <button onClick={reset} className="mt-4 px-6 py-2 bg-pink-500 hover:bg-pink-600 rounded-full text-white font-bold transition">🔄 New Game</button>
    </div>
  );
}

// ===== STAR CATCH GAME =====
function StarCatchGame() {
  const [score, setScore] = useState(0);
  const [stars, setStars] = useState<{ id: number; x: number; y: number }[]>([]);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!active) return;
    const iv = setInterval(() => {
      const s = { id: Date.now(), x: Math.random() * 80 + 10, y: Math.random() * 80 + 10 };
      setStars(p => [...p, s]);
      setTimeout(() => setStars(p => p.filter(x => x.id !== s.id)), 1500);
    }, 800);
    return () => clearInterval(iv);
  }, [active]);

  return (
    <div className="text-center">
      <div className="mb-4 text-xl font-bold text-yellow-300">⭐ Score: {score}</div>
      {!active ? (
        <button onClick={() => { setActive(true); setScore(0); }} className="px-8 py-3 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-full font-bold text-xl hover:scale-110 transition">⭐ Start Game!</button>
      ) : (
        <div className="relative w-full h-64 bg-gradient-to-b from-indigo-900 to-purple-900 rounded-2xl overflow-hidden">
          {stars.map(s => (
            <button key={s.id} onClick={() => { setScore(sc => sc + 1); setStars(p => p.filter(x => x.id !== s.id)); }}
              className="absolute text-3xl animate-ping hover:scale-150 transition" style={{ left: `${s.x}%`, top: `${s.y}%` }}>⭐</button>
          ))}
        </div>
      )}
      {active && <button onClick={() => setActive(false)} className="mt-3 px-6 py-2 bg-red-500 rounded-full text-white font-bold">Stop</button>}
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
  const sectionIds = ['hero', 'about', 'food', 'kpop', 'music', 'taekwondo', 'pokemon', 'spiderman', 'pikachu', 'games', 'art', 'dreams'];
  const { playNote, playMelody } = useAudio();

  // Melodies
  const sodaPopMelody = [523, 587, 659, 698, 784, 698, 659, 587]; // C D E F G F E D
  const goldenMelody = [784, 880, 988, 1047, 988, 880, 784, 659]; // G A B C B A G E
  const clarinetMelody = [262, 294, 330, 349, 392, 349, 330, 294];
  const recorderMelody = [523, 494, 440, 392, 349, 330, 294, 262];
  const pianoMelody = [262, 330, 392, 523, 392, 330, 262, 196];

  const triggerPokeEffect = (type: string, e: React.MouseEvent) => {
    setPokeEffect({ type, x: e.clientX, y: e.clientY });
    // Play sound effect
    const freqs: Record<string, number> = { Electric: 800, Fire: 300, Water: 600, Grass: 400, Normal: 500, Fairy: 900, 'Fire/Flying': 350, Psychic: 700 };
    playNote(freqs[type] || 500, 0.3, 'sawtooth');
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
              { icon: '', title: 'Born', value: 'Hong Kong', color: 'from-blue-500 to-cyan-500', isFlag: true },
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

      {/* FOOD */}
      <RevealSection><section id="food" className="py-20 px-4 bg-gradient-to-b from-transparent via-amber-800/20 to-transparent">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold text-center mb-4 bg-gradient-to-r from-orange-300 to-yellow-400 bg-clip-text text-transparent">🥟 My Favorite Foods 🥟</h2>
          <p className="text-center text-orange-200 mb-12 text-lg">Hong Kong dim sum is the best!</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-2xl mx-auto">
            {[
              { name: '燒賣', en: 'Siu Mai', desc: 'My #1 favorite!', color: 'from-orange-400 to-red-500', image: '/images/food/siumai.svg' },
              { name: '蝦餃', en: 'Har Gow', desc: 'So yummy!', emoji: '🦐', color: 'from-pink-400 to-pink-600' },
            ].map((item, i) => (
              <TiltCard key={i}>
                <div className={`p-8 rounded-3xl bg-gradient-to-br ${item.color} text-center shadow-xl`}>
                  {item.image ? (
                    <div className="relative w-28 h-28 mx-auto mb-4"><Image src={item.image} alt={item.name} fill className="object-contain drop-shadow-xl" /></div>
                  ) : <div className="text-6xl mb-4">{item.emoji}</div>}
                  <h3 className="text-3xl font-bold mb-2">{item.name}</h3>
                  <p className="text-white/80 mb-2">{item.en}</p>
                  <p className="text-sm opacity-70">{item.desc}</p>
                </div>
              </TiltCard>
            ))}
          </div>
        </div>
      </section></RevealSection>

      {/* K-POP */}
      <RevealSection><section id="kpop" className="py-20 px-4 bg-gradient-to-b from-transparent via-pink-800/20 to-transparent overflow-hidden">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold text-center mb-4 bg-gradient-to-r from-pink-400 to-purple-400 bg-clip-text text-transparent">🎤 K-pop Dancing Star 🎤</h2>
          <p className="text-center text-pink-200 mb-12 text-lg">I love dancing to K-pop songs!</p>
          <div className="flex justify-center mb-12">
            <div className="relative">
              <div className="text-8xl animate-dance">🧒</div>
              <span className="absolute -top-4 -left-8 text-3xl animate-float-1">🎵</span>
              <span className="absolute -top-2 -right-10 text-2xl animate-float-2">🎶</span>
              <span className="absolute top-8 -left-12 text-xl animate-float-3">✨</span>
              <span className="absolute top-10 -right-8 text-2xl animate-float-1">⭐</span>
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-8">
            {[
              { song: 'Soda Pop', desc: 'Catchy beats! 🎶', color: 'from-cyan-400 to-blue-500', icon: '🥤', melody: sodaPopMelody },
              { song: 'Golden', desc: 'My favorite! ✨', color: 'from-yellow-400 to-amber-500', icon: '⭐', melody: goldenMelody },
            ].map((item, i) => (
              <TiltCard key={i}>
                <div className={`p-8 rounded-3xl bg-gradient-to-br ${item.color} shadow-2xl relative overflow-hidden group cursor-pointer`}
                     onClick={() => playMelody(item.melody, 180)}>
                  <div className="text-6xl mb-4 text-center animate-bounce">{item.icon}</div>
                  <h3 className="text-3xl font-bold text-center mb-2">{item.song}</h3>
                  <p className="text-center text-sm opacity-70">{item.desc}</p>
                  <p className="text-center text-xs mt-2 text-white/50">🎵 Click to play!</p>
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
          <p className="text-center text-purple-200 mb-12 text-lg">Learning to make beautiful music!</p>
          <div className="grid md:grid-cols-3 gap-6 mt-8">
            {[
              { icon: '🎵', name: 'Clarinet', desc: 'My jazzy friend!', status: 'Learning', color: 'from-blue-500 to-indigo-600', melody: clarinetMelody },
              { icon: '🎶', name: 'Recorder', desc: 'My first instrument!', status: 'Playing', color: 'from-green-500 to-teal-600', melody: recorderMelody },
              { icon: '🎹', name: 'Piano', desc: 'Making melodies!', status: 'Practicing', color: 'from-purple-500 to-pink-600', isPiano: true },
            ].map((item, i) => (
              <TiltCard key={i}>
                <div className={`p-6 rounded-3xl bg-gradient-to-br ${item.color} text-center shadow-xl cursor-pointer group`}
                     onClick={() => (item as any).isPiano ? setShowPiano(true) : playMelody((item as any).melody, 180)}>
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
              { icon: '🦵', move: 'High Kick', desc: 'Sky-high power!' },
              { icon: '👊', move: 'Punch Combo', desc: 'Fast and strong!' },
              { icon: '🛡️', move: 'Blocking', desc: 'Super defense!' },
            ].map((item, i) => (
              <TiltCard key={i}>
                <div className="p-6 rounded-3xl bg-gradient-to-br from-red-600 to-orange-700 text-center shadow-lg">
                  <div className="text-5xl mb-3">{item.icon}</div>
                  <h3 className="text-xl font-bold">{item.move}</h3>
                  <p className="text-white/80">{item.desc}</p>
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
