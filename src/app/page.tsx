'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';

// ===== TYPES =====
type SparkleData = { left: string; top: string; animationDelay: string };
type InstrumentName = 'piano' | 'clarinet' | 'recorder' | 'kick' | 'punch' | 'block';
type NoteEvent = { freq: number; dur: number };
type PianoKey = { note: string; freq: number; white: boolean; black: boolean; whiteIndex: number };
type StarItem = { id: number; x: number; y: number; size: number; bornAt: number; fading: boolean };

// ===== AUDIO ENGINE (Web Audio API - iOS compatible) =====
// iOS Safari rule: AudioContext MUST be created/resumed inside a direct user gesture.
// Strategy: keep one context, unlock it on first gesture, resume on every call.
function useAudio() {
  const ctxRef = useRef<AudioContext | null>(null);
  const unlockedRef = useRef(false);
  const noiseBufferRef = useRef<AudioBuffer | null>(null);
  // Sample cache: keyed by instrument name
  const sampleCacheRef = useRef<Record<string, AudioBuffer>>({});
  const sampleLoadingRef = useRef<Record<string, Promise<AudioBuffer | null>>>({});

  // Base frequencies of each sample (the root pitch recorded in the MP3)
  const SAMPLE_BASE: Record<string, number> = { piano: 261.63, clarinet: 261.63, recorder: 261.63 };

  const loadSample = useCallback(async (instrument: string, ctx: AudioContext): Promise<AudioBuffer | null> => {
    if (sampleCacheRef.current[instrument]) return sampleCacheRef.current[instrument];
    const inflight = sampleLoadingRef.current[instrument];
    if (inflight) return inflight;
    const urls: Record<string, string> = {
      piano: '/sounds/piano-note.mp3',
      clarinet: '/sounds/clarinet-note.mp3',
      recorder: '/sounds/recorder-note.mp3',
    };
    const url = urls[instrument];
    if (!url) return null;
    const p = fetch(url)
      .then(r => r.arrayBuffer())
      .then(ab => ctx.decodeAudioData(ab))
      .then(buf => { sampleCacheRef.current[instrument] = buf; return buf; })
      .catch(() => null);
    sampleLoadingRef.current[instrument] = p;
    return p;
  }, []);

  const getAudioContext = useCallback(() => {
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;
      if (!ctxRef.current) {
        ctxRef.current = new AC();
      }
      return ctxRef.current;
    } catch (_e) {
      return null;
    }
  }, []);

  const getNoiseBuffer = useCallback((ctx: AudioContext) => {
    if (noiseBufferRef.current && noiseBufferRef.current.sampleRate === ctx.sampleRate) {
      return noiseBufferRef.current;
    }
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < channel.length; i += 1) {
      channel[i] = (Math.random() * 2 - 1) * 0.7;
    }
    noiseBufferRef.current = buffer;
    return buffer;
  }, []);

  // Must be called synchronously inside a touch/click handler
  const initAudio = useCallback(() => {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      // Unlock: resume + play a zero-gain buffer synchronously inside the gesture
      if (!unlockedRef.current || ctx.state === 'suspended' || ctx.state === 'interrupted') {
        ctx.resume();
        const buf = ctx.createBuffer(1, 1, ctx.sampleRate);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const g = ctx.createGain();
        g.gain.value = 0.001; // near-silent
        src.connect(g).connect(ctx.destination);
        src.start(0);
        unlockedRef.current = true;
      }
    } catch (_e) {}
  }, [getAudioContext]);

  // Realistic instrument synthesis (uses real MP3 samples for piano/clarinet/recorder)
  const playNote = useCallback((freq: number, duration: number, instrument: InstrumentName = 'piano') => {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      if (ctx.state !== 'running') ctx.resume();

      // --- Real sample playback ---
      if (instrument === 'piano' || instrument === 'clarinet' || instrument === 'recorder') {
        const baseFreq = SAMPLE_BASE[instrument] || 261.63;
        const detuneCents = 1200 * Math.log2(freq / baseFreq);
        loadSample(instrument, ctx).then(buf => {
          if (!buf) return; // fallback handled below via synthesis
          const now = ctx.currentTime + 0.01;
          const src = ctx.createBufferSource();
          src.buffer = buf;
          src.detune.value = detuneCents;
          const gainNode = ctx.createGain();
          gainNode.gain.setValueAtTime(0.85, now);
          gainNode.gain.setValueAtTime(0.85, now + duration);
          gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration + 0.4);
          src.connect(gainNode).connect(ctx.destination);
          src.start(now);
          src.stop(now + duration + 0.5);
        }).catch(() => {/* ignore, synthesis fallback not triggered async */});
        return; // return early; sample path is async above
      }

      const now = ctx.currentTime + 0.01;
      const releaseTail = Math.max(0.08, duration * 0.45);
      const stopAt = now + duration + releaseTail + 0.08;
      const output = ctx.createGain();
      output.gain.value = 0.92;
      output.connect(ctx.destination);

      if (instrument === 'kick') {
        // Kick: low thump
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(50, now + 0.15);
        gain.gain.setValueAtTime(0.6, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.connect(gain).connect(output);
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
        osc.connect(gain).connect(output);
        osc.start(now); osc.stop(now + 0.15);
      } else if (instrument === 'block') {
        // Block: sharp snap
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = 800;
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
        osc.connect(gain).connect(output);
        osc.start(now); osc.stop(now + 0.08);
      }
    } catch (e) { /* silent fail */ }
  }, [getAudioContext, loadSample]);

  // Play melody with instrument
  const playMelody = useCallback((notes: NoteEvent[], tempo: number = 200, instrument: 'piano' | 'clarinet' | 'recorder' = 'piano') => {
    let t = 0;
    notes.forEach((n) => {
      setTimeout(() => playNote(n.freq, Math.max(0.16, n.dur), instrument), t);
      t += Math.max(tempo, n.dur * 760);
    });
  }, [playNote]);

  // Longer kid-friendly melodic motifs inspired by the songs' energy.
  const s = 0.24;
  const sodaPopMelody: NoteEvent[] = [
    { freq: 523.25, dur: s }, { freq: 659.25, dur: s * 0.85 }, { freq: 783.99, dur: s * 0.85 }, { freq: 880.0, dur: s },
    { freq: 783.99, dur: s * 0.85 }, { freq: 659.25, dur: s * 0.85 }, { freq: 587.33, dur: s }, { freq: 523.25, dur: s * 1.5 },
    { freq: 587.33, dur: s }, { freq: 659.25, dur: s }, { freq: 698.46, dur: s }, { freq: 783.99, dur: s * 1.15 },
    { freq: 698.46, dur: s * 0.85 }, { freq: 659.25, dur: s * 0.85 }, { freq: 587.33, dur: s }, { freq: 523.25, dur: s * 1.4 },
    { freq: 523.25, dur: s * 0.75 }, { freq: 587.33, dur: s * 0.75 }, { freq: 659.25, dur: s * 0.75 }, { freq: 783.99, dur: s },
    { freq: 880.0, dur: s }, { freq: 783.99, dur: s }, { freq: 659.25, dur: s }, { freq: 587.33, dur: s * 1.1 },
    { freq: 523.25, dur: s }, { freq: 659.25, dur: s * 0.85 }, { freq: 783.99, dur: s * 0.85 }, { freq: 987.77, dur: s * 1.2 },
    { freq: 880.0, dur: s }, { freq: 783.99, dur: s }, { freq: 698.46, dur: s }, { freq: 659.25, dur: s * 1.2 },
    { freq: 587.33, dur: s }, { freq: 659.25, dur: s }, { freq: 698.46, dur: s }, { freq: 783.99, dur: s },
    { freq: 698.46, dur: s * 0.85 }, { freq: 659.25, dur: s * 0.85 }, { freq: 587.33, dur: s }, { freq: 523.25, dur: s * 1.8 },
  ];

  const g = 0.26;
  const goldenMelody: NoteEvent[] = [
    { freq: 440.0, dur: g }, { freq: 493.88, dur: g * 0.9 }, { freq: 523.25, dur: g * 0.9 }, { freq: 659.25, dur: g * 1.1 },
    { freq: 587.33, dur: g * 0.9 }, { freq: 523.25, dur: g * 0.9 }, { freq: 493.88, dur: g }, { freq: 440.0, dur: g * 1.4 },
    { freq: 440.0, dur: g * 0.8 }, { freq: 493.88, dur: g * 0.8 }, { freq: 523.25, dur: g * 0.8 }, { freq: 587.33, dur: g * 0.9 },
    { freq: 659.25, dur: g * 1.2 }, { freq: 783.99, dur: g }, { freq: 659.25, dur: g }, { freq: 587.33, dur: g * 1.2 },
    { freq: 523.25, dur: g }, { freq: 587.33, dur: g }, { freq: 659.25, dur: g }, { freq: 783.99, dur: g * 1.1 },
    { freq: 880.0, dur: g * 1.1 }, { freq: 783.99, dur: g }, { freq: 659.25, dur: g }, { freq: 523.25, dur: g * 1.25 },
    { freq: 587.33, dur: g }, { freq: 659.25, dur: g }, { freq: 739.99, dur: g }, { freq: 880.0, dur: g * 1.05 },
    { freq: 987.77, dur: g * 1.15 }, { freq: 880.0, dur: g }, { freq: 783.99, dur: g }, { freq: 659.25, dur: g * 1.05 },
    { freq: 523.25, dur: g }, { freq: 659.25, dur: g }, { freq: 783.99, dur: g }, { freq: 880.0, dur: g * 1.15 },
    { freq: 783.99, dur: g }, { freq: 659.25, dur: g }, { freq: 587.33, dur: g }, { freq: 523.25, dur: g * 1.9 },
  ];

  return { playNote, playMelody, sodaPopMelody, goldenMelody, initAudio };
}

// ===== PIANO KEYBOARD (mobile: 16 white keys, desktop: 3 octaves) =====
function PianoKeyboard({ onClose, playNote, initAudio }: { onClose: () => void; playNote: (f: number, d: number, inst?: InstrumentName) => void; initAudio: () => void }) {
  const [isPhone, setIsPhone] = useState(false);
  useEffect(() => {
    const checkScreen = () => {
      setIsPhone(window.innerWidth < 768 || /iPhone|iPod|Android.*Mobile/i.test(navigator.userAgent));
    };
    checkScreen();
    window.addEventListener('resize', checkScreen);
    return () => window.removeEventListener('resize', checkScreen);
  }, []);

  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  const generateKeys = (): PianoKey[] => {
    const startMidi = isPhone ? 60 : 48;
    const endMidi = isPhone ? 86 : 84;
    let whiteIndex = 0;
    const keys: PianoKey[] = [];

    for (let midi = startMidi; midi <= endMidi; midi += 1) {
      const semitone = midi % 12;
      const note = noteNames[semitone];
      const octave = Math.floor(midi / 12) - 1;
      const white = !note.includes('#');
      keys.push({
        note: `${note}${octave}`,
        freq: 440 * Math.pow(2, (midi - 69) / 12),
        white,
        black: !white,
        whiteIndex: white ? whiteIndex++ : Math.max(0, whiteIndex - 1),
      });
    }

    return keys;
  };

  const allKeys = generateKeys();
  const whiteKeys = allKeys.filter(k => k.white);
  const blackKeys = allKeys.filter(k => k.black);
  const keyWidth = isPhone ? 42 : 38;
  const keyGap = 2;
  const blackWidth = Math.round(keyWidth * 0.62);

  const getBlackKeyLeft = (key: PianoKey) => ((key.whiteIndex + 1) * (keyWidth + keyGap)) - Math.round(blackWidth / 2);

  const handleWhiteKey = (freq: number) => {
    initAudio();
    playNote(freq, 0.6, 'piano');
  };
  const handleBlackKey = (freq: number) => {
    initAudio();
    playNote(freq, 0.5, 'piano');
  };

  const totalWhiteKeys = whiteKeys.length;
  const pianoWidth = totalWhiteKeys * (keyWidth + keyGap);

  return (
    <div className="fixed inset-0 z-[9000] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900 rounded-t-3xl sm:rounded-3xl p-4 pb-8 sm:pb-4 shadow-2xl w-full max-w-5xl" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-xl font-bold text-white">🎹 Piano</h3>
          <button onClick={onClose} className="text-white/60 hover:text-white text-2xl px-3">✕</button>
        </div>
        {/* Scrollable piano keys */}
        <div className="overflow-x-auto pb-2">
          <div className="relative flex" style={{ width: `${pianoWidth}px`, minWidth: `${pianoWidth}px` }}>
            {whiteKeys.map((k) => (
              <button key={k.note}
                onTouchStart={(e) => { e.preventDefault(); handleWhiteKey(k.freq); }}
                onMouseDown={() => handleWhiteKey(k.freq)}
                className={`bg-gradient-to-b from-white via-gray-50 to-gray-200 border border-gray-300 mx-[1px] rounded-b-lg active:from-yellow-200 active:to-yellow-400 active:scale-95 transition-all shadow-md flex-shrink-0`}
                style={{ width: `${keyWidth}px`, height: isPhone ? '170px' : '180px' }}
              />
            ))}
            {blackKeys.map((k) => (
              <button key={k.note}
                onTouchStart={(e) => { e.preventDefault(); handleBlackKey(k.freq); }}
                onMouseDown={() => handleBlackKey(k.freq)}
                className={`absolute bg-gradient-to-b from-gray-700 to-black rounded-b-lg active:from-purple-700 active:to-purple-900 active:scale-95 transition-all shadow-lg z-10`}
                style={{
                  width: `${blackWidth}px`,
                  height: isPhone ? '100px' : '110px',
                  left: `${getBlackKeyLeft(k)}px`,
                }}
              />
            ))}
          </div>
        </div>
        <p className="text-white/40 text-center mt-3 text-sm">{isPhone ? '16 white keys · two scales · swipe to scroll' : '3 octaves: C3 → C6'} 🎵</p>
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
      trailId.current += 1;
      const id = trailId.current;
      setPos({ x: e.clientX, y: e.clientY });
      setTrails(prev => [...prev.slice(-8), { x: e.clientX, y: e.clientY, id }]);
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
  const [timeLeft, setTimeLeft] = useState(25);
  const [stars, setStars] = useState<StarItem[]>([]);
  const starId = useRef(0);

  const removeStar = useCallback((id: number) => {
    setStars(prev => prev.filter(star => star.id !== id));
  }, []);

  const catchStar = useCallback((id: number) => {
    setScore(sc => sc + 1);
    setStars(prev => prev.filter(star => star.id !== id));
  }, []);

  const spawnStar = useCallback(() => {
    starId.current += 1;
    const id = starId.current;
    const nextStar: StarItem = {
      id,
      x: Math.random() * 72 + 10,
      y: Math.random() * 55 + 12,
      size: Math.random() * 10 + 54,
      bornAt: Date.now(),
      fading: false,
    };
    setStars(prev => {
      if (prev.length >= 3) return prev;
      return [...prev, nextStar];
    });
    window.setTimeout(() => {
      setStars(prev => prev.map(star => (star.id === id ? { ...star, fading: true } : star)));
    }, 1800);
    window.setTimeout(() => removeStar(id), 2500);
  }, [removeStar]);

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { setActive(false); return 0; }
        return t - 1;
      });
    }, 1000);
    const starSpawner = setInterval(() => {
      spawnStar();
    }, 1100);
    return () => { clearInterval(timer); clearInterval(starSpawner); };
  }, [active, spawnStar]);

  const startGame = () => { setActive(true); setScore(0); setTimeLeft(25); setStars([]); };

  return (
    <div className="text-center">
      <div className="flex justify-center gap-6 mb-4">
        <div className="text-xl font-bold text-yellow-300">⭐ {score}</div>
        <div className={`text-xl font-bold ${timeLeft <= 5 ? 'text-red-400 animate-pulse' : 'text-white'}`}>⏱️ {timeLeft}s</div>
      </div>
      <p className="text-sm text-white/70 mb-4">Tap or touch the glowing stars. They appear one by one and stay catchable.</p>
      {!active && timeLeft === 25 ? (
        <button onClick={startGame} className="px-8 py-3 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-full font-bold text-xl hover:scale-110 transition">⭐ Start Game!</button>
      ) : !active && timeLeft === 0 ? (
        <div>
          <div className="text-2xl font-bold text-green-400 mb-3">🎉 Time&apos;s Up!</div>
          <div className="text-lg text-white mb-4">You caught {score} stars!</div>
          <button onClick={startGame} className="px-8 py-3 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-full font-bold text-xl hover:scale-110 transition">🔄 Play Again!</button>
        </div>
      ) : (
        <div className="relative w-full h-72 bg-gradient-to-b from-indigo-900 via-indigo-800 to-purple-900 rounded-2xl overflow-hidden border border-white/10">
          <div className="absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-white/10 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-pink-500/20 to-transparent" />
          {stars.map(s => (
            <button
              key={s.id}
              onTouchStart={(e) => { e.preventDefault(); catchStar(s.id); }}
              onClick={() => catchStar(s.id)}
              className={`absolute rounded-full flex items-center justify-center transition-all duration-500 touch-none ${s.fading ? 'opacity-0 scale-75' : 'opacity-100 scale-100'} animate-pulse`}
              style={{
                left: `${s.x}%`,
                top: `${s.y}%`,
                width: `${s.size}px`,
                height: `${s.size}px`,
                transform: `translate(-50%, -50%) scale(${s.fading ? 0.75 : 1})`,
                background: 'radial-gradient(circle, rgba(255,245,157,0.95) 0%, rgba(255,196,0,0.85) 55%, rgba(255,145,0,0.2) 100%)',
                boxShadow: '0 0 24px rgba(255, 221, 87, 0.6)',
                touchAction: 'manipulation',
              }}
            >
              <span className="text-3xl leading-none">⭐</span>
            </button>
          ))}
        </div>
      )}
      {active && <button onClick={() => { setActive(false); setTimeLeft(25); setStars([]); }} className="mt-3 px-6 py-2 bg-red-500 rounded-full text-white font-bold">Stop</button>}
    </div>
  );
}

// ===== SPIDER-MAN TAP GAME =====
function SpiderManWebGame({ playNote, initAudio }: { playNote: (freq: number, duration: number, instrument?: InstrumentName) => void; initAudio: () => void }) {
  const [running, setRunning] = useState(false);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(20);
  const [targets, setTargets] = useState<{ id: number; x: number; y: number; emoji: string }[]>([]);
  const idRef = useRef(0);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          setRunning(false);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    const spawner = setInterval(() => {
      idRef.current += 1;
      const targetId = idRef.current;
      const emoji = Math.random() > 0.45 ? '🦹' : '🤖';
      setTargets(prev => [...prev.slice(-4), { id: targetId, x: Math.random() * 76 + 8, y: Math.random() * 50 + 14, emoji }]);
      window.setTimeout(() => {
        setTargets(prev => prev.filter(target => target.id !== targetId));
      }, 2200);
    }, 950);
    return () => {
      clearInterval(timer);
      clearInterval(spawner);
    };
  }, [running]);

  const start = () => {
    setRunning(true);
    setScore(0);
    setTimeLeft(20);
    setTargets([]);
  };

  const shootWeb = (id: number) => {
    initAudio();
    playNote(720, 0.12, 'block');
    setScore(prev => prev + 1);
    setTargets(prev => prev.filter(target => target.id !== id));
  };

  return (
    <div className="text-center">
      <div className="flex justify-center gap-6 mb-4 text-lg font-bold">
        <span className="text-cyan-300">🕸️ {score}</span>
        <span className={timeLeft <= 5 && running ? 'text-yellow-300 animate-pulse' : 'text-white'}>⏱️ {timeLeft}s</span>
      </div>
      {!running && timeLeft === 20 ? (
        <button onClick={start} className="px-6 py-3 rounded-full bg-gradient-to-r from-red-500 to-blue-500 font-bold hover:scale-105 transition">Start Web Shooter</button>
      ) : !running && timeLeft === 0 ? (
        <div>
          <div className="text-2xl font-bold text-green-300 mb-2">City saved!</div>
          <div className="text-white mb-4">You trapped {score} bad guys.</div>
          <button onClick={start} className="px-6 py-3 rounded-full bg-gradient-to-r from-red-500 to-blue-500 font-bold hover:scale-105 transition">Play Again</button>
        </div>
      ) : (
        <div className="relative h-72 rounded-3xl overflow-hidden border border-white/10 bg-gradient-to-b from-sky-500 via-blue-700 to-slate-900">
          <div className="absolute inset-x-0 bottom-0 h-16 bg-[linear-gradient(90deg,rgba(255,255,255,0.2)_0_12px,transparent_12px_24px)] opacity-25" />
          <div className="absolute inset-x-0 top-4 text-center text-white/70 text-sm">Tap the bad guys before they escape the skyline.</div>
          {targets.map(target => (
              <button
              key={target.id}
              onTouchStart={(e) => { e.preventDefault(); shootWeb(target.id); }}
              onClick={() => shootWeb(target.id)}
              className="absolute -translate-x-1/2 -translate-y-1/2 w-16 h-16 md:w-[72px] md:h-[72px] rounded-full bg-white/15 backdrop-blur flex items-center justify-center text-4xl shadow-xl transition-transform hover:scale-110 active:scale-95 touch-none"
              style={{ left: `${target.x}%`, top: `${target.y}%`, touchAction: 'manipulation' }}
            >
              <span>{target.emoji}</span>
            </button>
          ))}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-5xl">🕷️</div>
        </div>
      )}
    </div>
  );
}

// ===== MONKEY BANANA GAME =====
function MonkeyBananaGame() {
  const [running, setRunning] = useState(false);
  const [score, setScore] = useState(0);
  const [misses, setMisses] = useState(0);
  const [monkeyX, setMonkeyX] = useState(50);
  const [bananas, setBananas] = useState<{ id: number; x: number; y: number; speed: number }[]>([]);
  const monkeyXRef = useRef(50);
  const idRef = useRef(0);
  const arenaRef = useRef<HTMLDivElement>(null);

  const moveMonkey = useCallback((percent: number) => {
    const next = Math.max(8, Math.min(92, percent));
    monkeyXRef.current = next;
    setMonkeyX(next);
  }, []);

  useEffect(() => {
    if (!running) return;
    const dropper = setInterval(() => {
      setBananas(prev => {
        let caught = 0;
        let dropped = 0;
        const next = prev.flatMap(item => {
          const nextY = item.y + item.speed;
          if (nextY >= 82) {
            if (Math.abs(item.x - monkeyXRef.current) <= 14) {
              caught += 1;
            } else {
              dropped += 1;
            }
            return [];
          }
          return [{ ...item, y: nextY }];
        });
        if (caught) setScore(current => current + caught);
        if (dropped) setMisses(current => current + dropped);
        return next;
      });
    }, 90);
    const spawner = setInterval(() => {
      idRef.current += 1;
      setBananas(prev => [...prev.slice(-7), { id: idRef.current, x: Math.random() * 78 + 8, y: 2, speed: Math.random() * 2.2 + 2.4 }]);
    }, 1000);
    return () => {
      clearInterval(dropper);
      clearInterval(spawner);
    };
  }, [running]);

  useEffect(() => {
    if (misses >= 5) {
      setRunning(false);
    }
  }, [misses]);

  const start = () => {
    setRunning(true);
    setScore(0);
    setMisses(0);
    setBananas([]);
    moveMonkey(50);
  };

  const moveFromClientX = (clientX: number) => {
    if (!arenaRef.current) return;
    const rect = arenaRef.current.getBoundingClientRect();
    moveMonkey(((clientX - rect.left) / rect.width) * 100);
  };

  return (
    <div className="text-center">
      <div className="flex justify-center gap-6 mb-4 text-lg font-bold">
        <span className="text-yellow-300">🍌 {score}</span>
        <span className={misses >= 3 ? 'text-red-300 animate-pulse' : 'text-white'}>💨 Misses {misses}/5</span>
      </div>
      {!running && score === 0 && misses === 0 ? (
        <button onClick={start} className="px-6 py-3 rounded-full bg-gradient-to-r from-lime-400 to-yellow-400 text-black font-bold hover:scale-105 transition">Start Banana Catch</button>
      ) : !running ? (
        <div>
          <div className="text-2xl font-bold text-green-300 mb-2">Monkey snack time finished!</div>
          <div className="text-white mb-4">You caught {score} bananas.</div>
          <button onClick={start} className="px-6 py-3 rounded-full bg-gradient-to-r from-lime-400 to-yellow-400 text-black font-bold hover:scale-105 transition">Play Again</button>
        </div>
      ) : (
        <>
          <div
            ref={arenaRef}
            className="relative h-72 rounded-3xl overflow-hidden border border-white/10 bg-gradient-to-b from-cyan-300 via-green-400 to-green-700 touch-none"
            onMouseMove={(e) => moveFromClientX(e.clientX)}
            onClick={(e) => moveFromClientX(e.clientX)}
            onTouchStart={(e) => moveFromClientX(e.touches[0].clientX)}
            onTouchMove={(e) => {
              e.preventDefault();
              moveFromClientX(e.touches[0].clientX);
            }}
          >
            <div className="absolute inset-x-0 top-4 text-center text-black/70 text-sm font-medium">Move the monkey under the bananas.</div>
            {bananas.map(item => (
              <div key={item.id} className="absolute -translate-x-1/2 text-4xl" style={{ left: `${item.x}%`, top: `${item.y}%` }}>🍌</div>
            ))}
            <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-amber-900/50 to-transparent" />
            <div className="absolute bottom-3 -translate-x-1/2 text-6xl transition-all duration-150" style={{ left: `${monkeyX}%` }}>🐵</div>
          </div>
          <div className="flex justify-center gap-3 mt-4">
            <button onClick={() => moveMonkey(monkeyX - 10)} className="px-4 py-2 rounded-full bg-black/20 font-bold">⬅️</button>
            <button onClick={() => moveMonkey(monkeyX + 10)} className="px-4 py-2 rounded-full bg-black/20 font-bold">➡️</button>
          </div>
        </>
      )}
    </div>
  );
}

// ===== DRAWING CANVAS =====
function DrawingCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const [color, setColor] = useState('#000000');
  const [brushSize, setBrushSize] = useState(6);
  const [tool, setTool] = useState<'brush' | 'eraser'>('brush');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      return {
        x: ((e.touches[0].clientX - rect.left) / rect.width) * canvas.width,
        y: ((e.touches[0].clientY - rect.top) / rect.height) * canvas.height,
      };
    }
    return {
      x: ((e.nativeEvent.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.nativeEvent.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const start = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setDrawing(true);
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) {
      const pos = getPos(e);
      ctx.strokeStyle = tool === 'eraser' ? '#ffffff' : color;
      ctx.lineWidth = brushSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      lastPoint.current = pos;
    }
  };

  const move = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing || !canvasRef.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e);
    const from = lastPoint.current ?? pos;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = tool === 'eraser' ? '#ffffff' : color;
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    lastPoint.current = pos;
  };

  const end = (e?: React.MouseEvent | React.TouchEvent) => {
    if (e) e.preventDefault();
    setDrawing(false);
    lastPoint.current = null;
  };

  const clear = () => {
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx && canvasRef.current) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  };

  const save = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = 'jayden-drawing.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const colors = ['#000000', '#ff69b4', '#ff3b30', '#ff9500', '#ffd60a', '#34c759', '#00c7be', '#0a84ff', '#8e44ad', '#6b4f2c'];
  return (
    <div className="text-center">
      <div className="flex flex-wrap justify-center gap-2 mb-4">
        {colors.map(c => (
          <button
            key={c}
            onClick={() => { setColor(c); setTool('brush'); }}
            className={`w-9 h-9 rounded-full border-2 ${color === c && tool === 'brush' ? 'border-yellow-300 scale-110' : 'border-white/20'} transition`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
      <div className="flex flex-wrap justify-center gap-2 mb-4">
        {[4, 8, 14].map(size => (
          <button
            key={size}
            onClick={() => setBrushSize(size)}
            className={`px-3 py-2 rounded-full font-bold ${brushSize === size ? 'bg-yellow-400 text-black' : 'bg-white/10 text-white'}`}
          >
            {size}px
          </button>
        ))}
        <button onClick={() => setTool('brush')} className={`px-3 py-2 rounded-full font-bold ${tool === 'brush' ? 'bg-pink-500' : 'bg-white/10'}`}>🖌️ Brush</button>
        <button onClick={() => setTool('eraser')} className={`px-3 py-2 rounded-full font-bold ${tool === 'eraser' ? 'bg-cyan-500 text-black' : 'bg-white/10'}`}>🧽 Eraser</button>
      </div>
      <canvas ref={canvasRef} width={340} height={260} className="bg-white rounded-2xl mx-auto cursor-crosshair touch-none w-full max-w-[340px] shadow-lg"
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end} />
      <div className="mt-4 flex flex-wrap justify-center gap-3">
        <button onClick={clear} className="px-5 py-2 bg-red-500 rounded-full text-white font-bold">🗑️ Clear</button>
        <button onClick={save} className="px-5 py-2 bg-green-500 rounded-full text-white font-bold">💾 Save</button>
      </div>
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
    
    // iOS audio warm-up on first touch
    const warmAudio = () => { initAudio(); };
    document.addEventListener('touchstart', warmAudio, { once: true });
    document.addEventListener('touchend', warmAudio, { once: true });
    
    return () => {
      obs.disconnect();
      document.removeEventListener('touchstart', warmAudio);
      document.removeEventListener('touchend', warmAudio);
    };
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
            {/* Soda Pop */}
            <TiltCard>
              <div className="p-6 rounded-3xl bg-gradient-to-br from-cyan-400 to-blue-500 shadow-2xl relative overflow-hidden">
                <div className="text-6xl mb-4 text-center animate-bounce">🥤</div>
                <h3 className="text-3xl font-bold text-center mb-1">Soda Pop</h3>
                <p className="text-center text-sm opacity-70 mb-4">Catchy beats! 🎶</p>
                <iframe style={{ borderRadius: '12px' }} src="https://open.spotify.com/embed/track/02sy7FAs8dkDNYsHp4Ul3f" width="100%" height="152" frameBorder={0} allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy" />
              </div>
            </TiltCard>
            {/* Golden */}
            <TiltCard>
              <div className="p-6 rounded-3xl bg-gradient-to-br from-yellow-400 to-amber-500 shadow-2xl relative overflow-hidden">
                <div className="text-6xl mb-4 text-center animate-bounce">⭐</div>
                <h3 className="text-3xl font-bold text-center mb-1">Golden</h3>
                <p className="text-center text-sm opacity-70 mb-4">My favorite! ✨</p>
                <iframe style={{ borderRadius: '12px' }} src="https://open.spotify.com/embed/track/1CPZ5BxNNd0n0nF4Orb9JS" width="100%" height="152" frameBorder={0} allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy" />
              </div>
            </TiltCard>
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
                { freq: 261.63, dur: 0.32 }, { freq: 293.66, dur: 0.28 }, { freq: 329.63, dur: 0.34 }, { freq: 392.0, dur: 0.45 },
                { freq: 349.23, dur: 0.3 }, { freq: 329.63, dur: 0.28 }, { freq: 293.66, dur: 0.3 }, { freq: 392.0, dur: 0.48 },
                { freq: 440.0, dur: 0.36 }, { freq: 392.0, dur: 0.5 },
              ]},
              { icon: '🎶', name: 'Recorder', desc: 'My first instrument!', status: 'Playing', color: 'from-green-500 to-teal-600', instrument: 'recorder' as const, melody: [
                { freq: 523.25, dur: 0.28 }, { freq: 587.33, dur: 0.28 }, { freq: 659.25, dur: 0.34 }, { freq: 587.33, dur: 0.28 },
                { freq: 523.25, dur: 0.28 }, { freq: 493.88, dur: 0.3 }, { freq: 440.0, dur: 0.34 }, { freq: 392.0, dur: 0.3 },
                { freq: 349.23, dur: 0.5 },
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
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold text-center mb-12 bg-gradient-to-r from-green-300 to-cyan-400 bg-clip-text text-transparent">🎮 Mini Games 🎮</h2>
          <div className="grid lg:grid-cols-2 gap-8">
            <div className="bg-white/10 backdrop-blur rounded-3xl p-6"><h3 className="text-2xl font-bold text-center mb-4">🧠 Memory Match</h3><MemoryGame /></div>
            <div className="bg-white/10 backdrop-blur rounded-3xl p-6"><h3 className="text-2xl font-bold text-center mb-4">⭐ Catch the Stars</h3><StarCatchGame /></div>
            <div className="bg-white/10 backdrop-blur rounded-3xl p-6"><h3 className="text-2xl font-bold text-center mb-4">🕷️ Spider-Man Web Shooter</h3><SpiderManWebGame playNote={playNote} initAudio={initAudio} /></div>
            <div className="bg-white/10 backdrop-blur rounded-3xl p-6"><h3 className="text-2xl font-bold text-center mb-4">🐵 Monkey Banana Catch</h3><MonkeyBananaGame /></div>
          </div>
        </div>
      </section></RevealSection>

      {/* DRAWING */}
      <RevealSection><section id="art" className="py-20 px-4 bg-gradient-to-b from-transparent via-pink-800/20 to-transparent">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold text-center mb-12 bg-gradient-to-r from-pink-300 to-purple-400 bg-clip-text text-transparent">🎨 Draw Something! 🎨</h2>
          <div className="max-w-xl mx-auto bg-white/10 backdrop-blur rounded-3xl p-6">
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
      {showPiano && <PianoKeyboard onClose={() => setShowPiano(false)} playNote={playNote} initAudio={initAudio} />}

      {/* POKEMON EFFECT */}
      {pokeEffect && <PokemonEffect type={pokeEffect.type} x={pokeEffect.x} y={pokeEffect.y} onDone={() => setPokeEffect(null)} />}
    </div>
  );
}
