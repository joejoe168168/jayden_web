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
  // Track active sources to stop them on demand
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const activeOscillatorsRef = useRef<OscillatorNode[]>([]);
  const melodyTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Base frequencies of each sample (the root pitch recorded in the MP3)
  const SAMPLE_BASE: Record<string, number> = { piano: 261.63, clarinet: 261.63, recorder: 261.63, kick: 0, punch: 0, block: 0 };

  const loadSample = useCallback(async (instrument: string, ctx: AudioContext): Promise<AudioBuffer | null> => {
    if (sampleCacheRef.current[instrument]) return sampleCacheRef.current[instrument];
    const inflight = sampleLoadingRef.current[instrument];
    if (inflight) return inflight;
    const urls: Record<string, string> = {
      piano: '/sounds/piano-note.mp3',
      clarinet: '/sounds/clarinet-note.mp3',
      recorder: '/sounds/recorder-note.mp3',
      kick: '/sounds/kick.mp3',
      punch: '/sounds/punch.mp3',
      block: '/sounds/block.mp3',
    };
    const url = instrument.startsWith('/') ? instrument : urls[instrument];
    if (!url) return null;
    const p = fetch(url)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.arrayBuffer();
      })
      .then(ab => {
        // Some browsers need a copy because decodeAudioData detaches the buffer
        const copy = ab.slice(0);
        return ctx.decodeAudioData(copy);
      })
      .then(buf => { sampleCacheRef.current[instrument] = buf; return buf; })
      .catch(() => {
        // Clear failed cache so it can be retried
        delete sampleLoadingRef.current[instrument];
        return null;
      });
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

  // Stop all currently playing sounds
  const stopAllSounds = useCallback(() => {
    // Stop buffer sources
    activeSourcesRef.current.forEach(src => {
      try { src.stop(); } catch (_e) {}
    });
    activeSourcesRef.current = [];
    // Stop oscillator sources
    activeOscillatorsRef.current.forEach(osc => {
      try { osc.stop(); } catch (_e) {}
    });
    activeOscillatorsRef.current = [];
    // Clear melody timeouts
    melodyTimersRef.current.forEach(t => clearTimeout(t));
    melodyTimersRef.current = [];
  }, []);

  // Realistic instrument synthesis (uses real MP3 samples for piano/clarinet/recorder)
  const playNote = useCallback((freq: number, duration: number, instrument: InstrumentName = 'piano') => {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      if (ctx.state !== 'running') ctx.resume();

      // --- Real sample playback ---
      const isTonal = instrument === 'piano' || instrument === 'clarinet' || instrument === 'recorder';
      const isCombat = instrument === 'kick' || instrument === 'punch' || instrument === 'block';
      if (isTonal || isCombat) {
        const baseFreq = SAMPLE_BASE[instrument] || 261.63;
        const detuneCents = isTonal ? 1200 * Math.log2(freq / baseFreq) : 0;
        loadSample(instrument, ctx).then(buf => {
          if (!buf) return;
          const now = ctx.currentTime + 0.01;
          const src = ctx.createBufferSource();
          src.buffer = buf;
          if (isTonal) src.detune.value = detuneCents;
          const gainNode = ctx.createGain();
          gainNode.gain.setValueAtTime(0.85, now);
          if (isTonal) {
            gainNode.gain.setValueAtTime(0.85, now + duration);
            gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration + 0.4);
            src.connect(gainNode).connect(ctx.destination);
            src.start(now);
            src.stop(now + duration + 0.5);
          } else {
            src.connect(gainNode).connect(ctx.destination);
            src.start(now);
          }
          activeSourcesRef.current.push(src);
          src.onended = () => {
            activeSourcesRef.current = activeSourcesRef.current.filter(s => s !== src);
          };
        }).catch(() => {});
        return;
      }
    } catch (e) { /* silent fail */ }
  }, [getAudioContext, loadSample]);

  // Play melody with instrument
  const playMelody = useCallback((notes: NoteEvent[], tempo: number = 200, instrument: 'piano' | 'clarinet' | 'recorder' = 'piano') => {
    stopAllSounds(); // stop any previous melody/sounds
    let t = 0;
    notes.forEach((n) => {
      const timer = setTimeout(() => playNote(n.freq, Math.max(0.16, n.dur), instrument), t);
      melodyTimersRef.current.push(timer);
      t += Math.max(tempo, n.dur * 760);
    });
  }, [playNote, stopAllSounds]);

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

  // Play a sound clip from a URL path (max duration in seconds, default 5)
  const playSoundClip = useCallback((url: string, maxDuration: number = 5) => {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      if (ctx.state !== 'running') ctx.resume();
      stopAllSounds();
      loadSample(url, ctx).then(buf => {
        if (!buf) return;
        const now = ctx.currentTime + 0.01;
        const dur = Math.min(maxDuration, buf.duration);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const gainNode = ctx.createGain();
        gainNode.gain.setValueAtTime(0.9, now);
        gainNode.gain.setValueAtTime(0.9, now + dur - 0.3);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, now + dur);
        src.connect(gainNode).connect(ctx.destination);
        src.start(now);
        src.stop(now + dur);
        activeSourcesRef.current.push(src);
        src.onended = () => { activeSourcesRef.current = activeSourcesRef.current.filter(s => s !== src); };
      }).catch(() => {});
    } catch (_e) {}
  }, [getAudioContext, loadSample, stopAllSounds]);

  return { playNote, playMelody, playSoundClip, sodaPopMelody, goldenMelody, initAudio, stopAllSounds };
}

// ===== PIANO KEYBOARD (mobile: 2 octaves, desktop: 3 octaves) =====
function PianoKeyboard({ onClose, playNote, initAudio, stopAllSounds }: { onClose: () => void; playNote: (f: number, d: number, inst?: InstrumentName) => void; initAudio: () => void; stopAllSounds: () => void }) {
  const [isPhone, setIsPhone] = useState(false);
  const [instrument, setInstrument] = useState<'piano' | 'clarinet' | 'recorder'>('piano');
  const [activeKeys, setActiveKeys] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

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
    const endMidi = isPhone ? 84 : 84;
    let whiteIndex = 0;
    const keys: PianoKey[] = [];
    for (let midi = startMidi; midi <= endMidi; midi += 1) {
      const semitone = midi % 12;
      const note = noteNames[semitone];
      const octave = Math.floor(midi / 12) - 1;
      const white = !note.includes('#');
      keys.push({ note: `${note}${octave}`, freq: 440 * Math.pow(2, (midi - 69) / 12), white, black: !white, whiteIndex: white ? whiteIndex++ : Math.max(0, whiteIndex - 1) });
    }
    return keys;
  };

  const allKeys = generateKeys();
  const whiteKeys = allKeys.filter(k => k.white);
  const blackKeys = allKeys.filter(k => k.black);
  const keyWidth = isPhone ? 44 : 40;
  const keyGap = 1;
  const blackWidth = Math.round(keyWidth * 0.58);
  const whiteHeight = isPhone ? 180 : 200;
  const blackHeight = isPhone ? 110 : 125;

  const getBlackKeyLeft = (key: PianoKey) => ((key.whiteIndex + 1) * (keyWidth + keyGap)) - Math.round(blackWidth / 2);

  const pressKey = useCallback((note: string, freq: number, isBlack: boolean) => {
    initAudio();
    playNote(freq, isBlack ? 0.5 : 0.6, instrument);
    setActiveKeys(prev => new Set(prev).add(note));
    setTimeout(() => setActiveKeys(prev => { const s = new Set(prev); s.delete(note); return s; }), 200);
  }, [initAudio, playNote, instrument]);

  // Keyboard mapping: computer keys → MIDI notes (starting at C4 = midi 60)
  const keyboardMap = useRef<Record<string, { note: string; freq: number; isBlack: boolean }>>({});
  useEffect(() => {
    const map: Record<string, { note: string; freq: number; isBlack: boolean }> = {};
    // Bottom row: white keys C4-B4, top row: sharps
    const whiteRow = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', "'"];
    const blackRow = ['w', 'e', '', 't', 'y', 'u', '', 'o', 'p'];
    const c4Keys = allKeys.filter(k => {
      const midi = Math.round(12 * Math.log2(k.freq / 440) + 69);
      return midi >= 60 && midi <= 76;
    });
    const c4White = c4Keys.filter(k => k.white);
    const c4Black = c4Keys.filter(k => k.black);
    c4White.forEach((k, i) => { if (whiteRow[i]) map[whiteRow[i]] = { note: k.note, freq: k.freq, isBlack: false }; });
    c4Black.forEach((k, i) => { if (blackRow[i]) map[blackRow[i]] = { note: k.note, freq: k.freq, isBlack: true }; });
    keyboardMap.current = map;
  }, [allKeys]);

  useEffect(() => {
    const pressed = new Set<string>();
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const key = e.key.toLowerCase();
      if (key === 'escape') { onClose(); return; }
      const mapping = keyboardMap.current[key];
      if (mapping && !pressed.has(key)) {
        pressed.add(key);
        pressKey(mapping.note, mapping.freq, mapping.isBlack);
      }
    };
    const up = (e: KeyboardEvent) => { pressed.delete(e.key.toLowerCase()); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [pressKey, onClose]);

  // Auto-scroll to middle on mount
  useEffect(() => {
    if (scrollRef.current) {
      const container = scrollRef.current;
      const scrollTarget = (container.scrollWidth - container.clientWidth) / 2;
      container.scrollLeft = scrollTarget;
    }
  }, [isPhone]);

  const totalWhiteKeys = whiteKeys.length;
  const pianoWidth = totalWhiteKeys * (keyWidth + keyGap);

  const getNoteLetter = (note: string) => note.replace(/[0-9]/g, '');
  const getNoteOctave = (note: string) => note.replace(/[^0-9]/g, '');

  return (
    <div className="fixed inset-0 z-[9000] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md" onClick={onClose}>
      <div className="bg-gradient-to-b from-gray-900 via-gray-850 to-gray-950 rounded-t-3xl sm:rounded-3xl p-4 pb-8 sm:pb-5 shadow-2xl w-full max-w-5xl border border-white/10" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-xl font-bold text-white">🎹 Virtual Piano</h3>
          <button onClick={onClose} className="text-white/60 hover:text-white text-2xl px-3 hover:rotate-90 transition-transform">✕</button>
        </div>
        {/* Instrument selector */}
        <div className="flex justify-center gap-2 mb-4">
          {(['piano', 'clarinet', 'recorder'] as const).map((inst) => (
            <button key={inst}
              onClick={() => { stopAllSounds(); setInstrument(inst); }}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                instrument === inst
                  ? 'bg-white text-gray-900 shadow-lg scale-105'
                  : 'bg-white/10 text-white/60 hover:bg-white/20 hover:text-white/90'
              }`}
            >
              {inst === 'piano' ? '🎹 Piano' : inst === 'clarinet' ? '🎵 Clarinet' : '🎶 Recorder'}
            </button>
          ))}
        </div>
        {/* Piano keys */}
        <div ref={scrollRef} className="overflow-x-auto pb-2 scrollbar-thin" style={{ scrollbarWidth: 'thin' }}>
          <div className="relative flex select-none" style={{ width: `${pianoWidth}px`, minWidth: `${pianoWidth}px` }}>
            {/* White keys */}
            {whiteKeys.map((k) => {
              const isActive = activeKeys.has(k.note);
              const letter = getNoteLetter(k.note);
              const octave = getNoteOctave(k.note);
              const isC = letter === 'C';
              return (
                <button key={k.note}
                  onTouchStart={(e) => { e.preventDefault(); pressKey(k.note, k.freq, false); }}
                  onMouseDown={() => pressKey(k.note, k.freq, false)}
                  className={`relative border rounded-b-lg transition-all duration-75 flex-shrink-0 flex flex-col items-center justify-end pb-2 ${
                    isActive
                      ? 'bg-gradient-to-b from-yellow-100 to-yellow-300 border-yellow-400 scale-[0.97] shadow-inner'
                      : 'bg-gradient-to-b from-white via-gray-50 to-gray-100 border-gray-300 hover:from-gray-50 hover:to-gray-200 shadow-md'
                  } ${isC ? 'border-l-2 border-l-gray-400' : ''}`}
                  style={{ width: `${keyWidth}px`, height: `${whiteHeight}px`, margin: `0 ${keyGap / 2}px` }}
                >
                  <span className={`text-[10px] font-bold select-none ${isActive ? 'text-yellow-700' : isC ? 'text-gray-800' : 'text-gray-400'}`}>
                    {letter}
                  </span>
                  {isC && <span className={`text-[8px] select-none ${isActive ? 'text-yellow-600' : 'text-gray-300'}`}>{octave}</span>}
                </button>
              );
            })}
            {/* Black keys */}
            {blackKeys.map((k) => {
              const isActive = activeKeys.has(k.note);
              return (
                <button key={k.note}
                  onTouchStart={(e) => { e.preventDefault(); pressKey(k.note, k.freq, true); }}
                  onMouseDown={() => pressKey(k.note, k.freq, true)}
                  className={`absolute rounded-b-lg transition-all duration-75 z-10 ${
                    isActive
                      ? 'bg-gradient-to-b from-purple-600 to-purple-800 shadow-inner scale-[0.97]'
                      : 'bg-gradient-to-b from-gray-600 via-gray-800 to-black hover:from-gray-500 hover:to-gray-900 shadow-lg'
                  }`}
                  style={{
                    width: `${blackWidth}px`,
                    height: `${blackHeight}px`,
                    left: `${getBlackKeyLeft(k)}px`,
                  }}
                />
              );
            })}
          </div>
        </div>
        {/* Footer info */}
        <div className="flex justify-between items-center mt-3 px-1">
          <p className="text-white/30 text-xs">{isPhone ? 'Swipe to scroll · Tap to play' : 'Use keyboard: A-L for white keys, W-P for sharps'}</p>
          <p className="text-white/30 text-xs">{isPhone ? '2 octaves: C4 → C5' : '3 octaves: C3 → C5'} 🎵</p>
        </div>
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
  const cursorRef = useRef<HTMLDivElement>(null);
  const trailRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const positions = useRef<{ x: number; y: number }[]>(Array.from({ length: 6 }, () => ({ x: -50, y: -50 })));
  const posIdx = useRef(0);

  useEffect(() => {
    let rafId = 0;
    const update = () => {
      const main = cursorRef.current;
      if (main) {
        const p = positions.current[posIdx.current % positions.current.length];
        main.style.transform = `translate(${p.x - 15}px, ${p.y - 15}px)`;
      }
      trailRefs.current.forEach((el, i) => {
        if (!el) return;
        const idx = (posIdx.current - (i + 1) * 2 + positions.current.length * 100) % positions.current.length;
        const tp = positions.current[idx];
        el.style.transform = `translate(${tp.x - 10}px, ${tp.y - 10}px) scale(${(i + 1) / trailRefs.current.length})`;
        el.style.opacity = `${(i + 1) / trailRefs.current.length * 0.5}`;
      });
      rafId = requestAnimationFrame(update);
    };
    const move = (e: MouseEvent) => {
      posIdx.current = (posIdx.current + 1) % positions.current.length;
      positions.current[posIdx.current] = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('mousemove', move);
    rafId = requestAnimationFrame(update);
    return () => { window.removeEventListener('mousemove', move); cancelAnimationFrame(rafId); };
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-[9999] hidden md:block">
      {Array.from({ length: 4 }).map((_, i) => (
        <span key={i} ref={el => { trailRefs.current[i] = el; }} className="absolute text-lg" style={{ left: 0, top: 0, willChange: 'transform, opacity' }}>⭐</span>
      ))}
      <div ref={cursorRef} className="absolute text-3xl" style={{ left: 0, top: 0, willChange: 'transform' }}>⚡</div>
    </div>
  );
}

// ===== SCROLL PROGRESS =====
function ScrollProgress() {
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      if (barRef.current) barRef.current.style.width = `${h > 0 ? (window.scrollY / h) * 100 : 0}%`;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return <div ref={barRef} className="fixed top-0 left-0 h-1 bg-gradient-to-r from-pink-500 via-purple-500 to-blue-500 z-[100]" style={{ width: '0%' }} />;
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
        <div className="relative w-40 h-72 mx-auto mb-4">
          <Image src="/images/jay.jpg" alt="Jayden" fill className={`object-contain drop-shadow-2xl transition-all duration-500 ${progress < 100 ? 'animate-pulse scale-95' : 'scale-110'}`} priority />
        </div>
        <h1 className="text-3xl font-bold text-white mb-4">Jayden&apos;s World</h1>
        <div className="w-64 h-3 bg-purple-800 rounded-full overflow-hidden mx-auto"><div className="h-full bg-gradient-to-r from-pink-500 to-yellow-500 transition-all" style={{ width: `${progress}%` }} /></div>
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
  const [top] = useState(() => `${20 + Math.random() * 60}%`);
  return <span className="absolute text-4xl animate-bounce pointer-events-none opacity-30" style={{ left, top, animationDelay: `${delay}s`, animationDuration: '3s' }}>{emoji}</span>;
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
  const [hunger, setHunger] = useState(10);
  const [energy, setEnergy] = useState(80);
  const [happiness, setHappiness] = useState(70);
  const [sleeping, setSleeping] = useState(false);
  const [actionText, setActionText] = useState<string | null>(null);
  const actionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showAction = useCallback((text: string) => {
    if (actionTimeoutRef.current) clearTimeout(actionTimeoutRef.current);
    setActionText(text);
    actionTimeoutRef.current = setTimeout(() => setActionText(null), 1500);
  }, []);

  const hungerRef = useRef(hunger);
  const energyRef = useRef(energy);
  hungerRef.current = hunger;
  energyRef.current = energy;

  useEffect(() => {
    const interval = setInterval(() => {
      setHunger(h => Math.min(100, h + (sleeping ? 1 : 2)));
      setEnergy(e => sleeping ? Math.min(100, e + 20) : Math.max(0, e - 1));
      setHappiness(prev => {
        let target = 50;
        if (hungerRef.current > 75) target -= 15;
        if (energyRef.current < 15) target -= 15;
        if (prev > target) return Math.max(0, prev - 1);
        if (prev < target) return Math.min(100, prev + 1);
        return prev;
      });
    }, 3000);
    return () => clearInterval(interval);
  }, [sleeping]);

  const mood = sleeping ? 'sleeping'
    : energy < 15 ? 'exhausted'
    : hunger > 75 ? 'hungry'
    : happiness < 30 ? 'sad'
    : happiness > 70 ? 'happy'
    : 'neutral';

  const feed = useCallback(() => {
    if (sleeping) return;
    setHunger(h => Math.max(0, h - 20));
    setHappiness(h => Math.min(100, h + 5));
    showAction('Yummy! 🍎');
  }, [sleeping, showAction]);

  const play = useCallback(() => {
    if (sleeping || energy < 15) return;
    setHappiness(h => Math.min(100, h + 15));
    setEnergy(e => Math.max(0, e - 15));
    setHunger(h => Math.min(100, h + 5));
    showAction('Wheee! ⚡');
  }, [sleeping, energy, showAction]);

  const pet = useCallback(() => {
    setHappiness(h => Math.min(100, h + 8));
    showAction(sleeping ? 'Zzz...' : 'Pika~! 💕');
  }, [sleeping, showAction]);

  const toggleSleep = useCallback(() => {
    setSleeping(s => !s);
    showAction(sleeping ? 'Pika!' : 'Zzz...');
  }, [sleeping, showAction]);

  const canFeed = !sleeping;
  const canPlay = !sleeping && energy >= 15;

  const imageWrapperClass = mood === 'happy' ? 'animate-bounce'
    : mood === 'sleeping' ? 'grayscale-50 scale-90'
    : mood === 'hungry' ? 'animate-pulse border-2 border-red-400 rounded-full'
    : mood === 'sad' ? 'grayscale scale-75'
    : mood === 'exhausted' ? 'grayscale-75 opacity-60'
    : '';

  const imageWrapperStyle = mood === 'happy'
    ? { filter: 'drop-shadow(0 0 20px rgba(250, 204, 21, 0.7))' }
    : {};

  return (
    <div className="text-center">
      <div className="relative inline-block mb-4 cursor-pointer" onClick={pet}>
        <div className={`transition-all duration-500 ${imageWrapperClass}`} style={imageWrapperStyle}>
          <Image src="/images/pokemon/pikachu.png" alt="Pikachu" width={160} height={160} className="mx-auto" />
        </div>
        {mood === 'sleeping' && (
          <span className="absolute -top-2 -right-2 text-3xl animate-pulse">💤</span>
        )}
        {actionText && (
          <div className="absolute -top-8 left-1/2 -translate-x-1/2 text-2xl font-bold text-yellow-300 animate-bounce whitespace-nowrap">
            {actionText}
          </div>
        )}
      </div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div>
          <span className="text-sm">🍎 Hunger</span>
          <div className="h-3 bg-gray-700 rounded-full mt-1">
            <div className={`h-full rounded-full transition-all ${hunger > 75 ? 'bg-red-500' : hunger > 40 ? 'bg-orange-400' : 'bg-green-500'}`} style={{ width: `${hunger}%` }} />
          </div>
        </div>
        <div>
          <span className="text-sm">⚡ Energy</span>
          <div className="h-3 bg-gray-700 rounded-full mt-1">
            <div className="h-full bg-yellow-500 rounded-full transition-all" style={{ width: `${energy}%` }} />
          </div>
        </div>
        <div>
          <span className="text-sm">💕 Happy</span>
          <div className="h-3 bg-gray-700 rounded-full mt-1">
            <div className="h-full bg-pink-500 rounded-full transition-all" style={{ width: `${happiness}%` }} />
          </div>
        </div>
      </div>
      <div className="flex justify-center gap-3 flex-wrap">
        <button onClick={feed} disabled={!canFeed} className={`px-4 py-2 bg-green-500 rounded-full transition ${canFeed ? 'hover:scale-110' : 'opacity-50 cursor-not-allowed'}`}>🍎 Feed</button>
        <button onClick={play} disabled={!canPlay} className={`px-4 py-2 bg-yellow-500 rounded-full transition text-black ${canPlay ? 'hover:scale-110' : 'opacity-50 cursor-not-allowed'}`}>🎾 Play</button>
        <button onClick={pet} className="px-4 py-2 bg-pink-500 rounded-full hover:scale-110 transition">🤗 Pet</button>
        <button onClick={toggleSleep} className="px-4 py-2 bg-indigo-500 rounded-full hover:scale-110 transition">{sleeping ? '☀️ Wake' : '😴 Sleep'}</button>
      </div>
    </div>
  );
}

// ===== MEMORY GAME =====
const MEMORY_EMOJIS = ['🕷️', '⚡', '🎵', '🥋', '⭐', '🎨', '🎮', '🍕'];
function MemoryGame() {
  const [cards, setCards] = useState<{ id: number; emoji: string; matched: boolean }[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [locked, setLocked] = useState(false);

  const initCards = useCallback(() => {
    const d = [...MEMORY_EMOJIS, ...MEMORY_EMOJIS]
      .sort(() => Math.random() - 0.5)
      .map((emoji, i) => ({ id: i, emoji, matched: false }));
    setCards(d);
    setSelected([]);
    setMoves(0);
    setLocked(false);
  }, []);

  useEffect(() => { initCards(); }, [initCards]);

  useEffect(() => {
    if (selected.length === 2) {
      setMoves(m => m + 1);
      setLocked(true);
      const [a, b] = selected;
      if (cards[a].emoji === cards[b].emoji) {
        setCards(c => c.map((card, i) => (i === a || i === b ? { ...card, matched: true } : card)));
        setSelected([]);
        setLocked(false);
      } else {
        setTimeout(() => { setSelected([]); setLocked(false); }, 800);
      }
    }
  }, [selected, cards]);

  const flip = useCallback((i: number) => {
    if (locked) return;
    if (selected.length >= 2) return;
    if (cards[i].matched) return;
    if (selected.includes(i)) return;
    setSelected(s => [...s, i]);
  }, [locked, selected, cards]);

  const won = cards.length > 0 && cards.every(c => c.matched);

  return (
    <div className="text-center">
      <div className="mb-3 flex items-center justify-center gap-4">
        <span className="text-lg font-bold text-yellow-300">Moves: {moves}</span>
        <button onClick={initCards} className="px-3 py-1 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-semibold transition-colors">
          Restart
        </button>
      </div>
      <div className="grid grid-cols-4 gap-3 max-w-sm mx-auto">
        {cards.map((c, i) => (
          <button
            key={c.id}
            onClick={() => flip(i)}
            className={`aspect-square rounded-xl text-3xl transition-all ${
              c.matched
                ? 'bg-green-500/40 ring-2 ring-green-400 scale-90'
                : selected.includes(i)
                ? 'bg-purple-500 border-2 border-purple-300 scale-105'
                : 'bg-indigo-600 hover:bg-indigo-500 hover:scale-105'
            }`}
          >
            {c.matched || selected.includes(i) ? c.emoji : '❓'}
          </button>
        ))}
      </div>
      {won && (
        <div className="mt-4 text-green-400 font-bold animate-bounce">
          <div className="text-xl">🎉 You Won in {moves} moves!</div>
          <button onClick={initCards} className="mt-2 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white font-semibold transition-colors">
            Play Again
          </button>
        </div>
      )}
    </div>
  );
}

// ===== STAR CATCH GAME =====
function StarCatchGame() {
  const [active, setActive] = useState(false);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(25);
  const [stars, setStars] = useState<StarItem[]>([]);
  const [popups, setPopups] = useState<{id:number;x:number;y:number}[]>([]);
  const starId = useRef(0);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const addTimeout = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms);
    timeoutsRef.current.push(t);
    return t;
  }, []);

  const clearAllTimeouts = useCallback(() => {
    timeoutsRef.current.forEach(t => clearTimeout(t));
    timeoutsRef.current = [];
  }, []);

  const removeStar = useCallback((id: number) => {
    setStars(prev => prev.filter(star => star.id !== id));
  }, []);

  const catchStar = useCallback((id: number, x: number, y: number) => {
    setScore(sc => sc + 1);
    setStars(prev => prev.filter(star => star.id !== id));
    const popupId = Date.now() + Math.random();
    setPopups(prev => [...prev, { id: popupId, x, y }]);
    addTimeout(() => {
      setPopups(prev => prev.filter(p => p.id !== popupId));
    }, 600);
  }, [addTimeout]);

  const spawnStar = useCallback(() => {
    starId.current += 1;
    const id = starId.current;
    const nextStar: StarItem = {
      id,
      x: Math.random() * 76 + 12,
      y: Math.random() * 60 + 15,
      size: Math.random() * 10 + 70,
      bornAt: Date.now(),
      fading: false,
    };
    setStars(prev => {
      if (prev.length >= 3) return prev;
      return [...prev, nextStar];
    });
    addTimeout(() => {
      setStars(prev => prev.map(star => (star.id === id ? { ...star, fading: true } : star)));
    }, 1800);
    addTimeout(() => removeStar(id), 2500);
  }, [removeStar, addTimeout]);

  useEffect(() => {
    if (!active) return;
    spawnStar();
    const timer = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { setActive(false); return 0; }
        return t - 1;
      });
    }, 1000);
    const starSpawner = setInterval(() => {
      spawnStar();
    }, 1100);
    return () => { clearInterval(timer); clearInterval(starSpawner); clearAllTimeouts(); };
  }, [active, spawnStar, clearAllTimeouts]);

  const startGame = () => {
    clearAllTimeouts();
    setActive(true);
    setScore(0);
    setTimeLeft(25);
    setStars([]);
    setPopups([]);
  };

  const stopGame = () => {
    clearAllTimeouts();
    setActive(false);
    setTimeLeft(25);
    setScore(0);
    setStars([]);
    setPopups([]);
  };

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
        <div className="relative w-full h-80 bg-gradient-to-b from-indigo-900 via-indigo-800 to-purple-900 rounded-2xl overflow-hidden border border-white/10">
          <div className="absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-white/10 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-pink-500/20 to-transparent" />
          {stars.map(s => (
            <button
              key={s.id}
              onTouchStart={(e) => { e.preventDefault(); catchStar(s.id, s.x, s.y); }}
              onClick={() => catchStar(s.id, s.x, s.y)}
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
          {popups.map(p => (
            <div
              key={p.id}
              className="absolute pointer-events-none text-xl font-extrabold text-yellow-200 animate-bounce"
              style={{ left: `${p.x}%`, top: `${p.y}%`, transform: 'translate(-50%, -130%)', textShadow: '0 0 8px rgba(255,200,0,0.8)' }}
            >
              +1
            </div>
          ))}
        </div>
      )}
      {active && <button onClick={stopGame} className="mt-3 px-6 py-2 bg-red-500 rounded-full text-white font-bold">Stop</button>}
    </div>
  );
}

// ===== SPIDER-MAN TAP GAME =====
function SpiderManWebGame({ playNote, initAudio }: { playNote: (freq: number, duration: number, instrument?: InstrumentName) => void; initAudio: () => void }) {
  const [running, setRunning] = useState(false);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(20);
  const [targets, setTargets] = useState<{ id: number; x: number; y: number; emoji: string; points: number }[]>([]);
  const [splashes, setSplashes] = useState<{ id: number; x: number; y: number; text: string }[]>([]);
  const idRef = useRef(0);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const spawnDelayRef = useRef(1200);
  const lifetimeRef = useRef(2500);

  const addTimeout = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms);
    timeoutsRef.current.push(t);
    return t;
  }, []);

  const clearAllTimeouts = useCallback(() => {
    timeoutsRef.current.forEach(t => clearTimeout(t));
    timeoutsRef.current = [];
  }, []);

  const spawnTarget = useCallback(() => {
    idRef.current += 1;
    const targetId = idRef.current;
    const roll = Math.random();
    const isBonus = roll < 0.15;
    const emoji = isBonus ? '💎' : roll < 0.55 ? '🦹' : '🤖';
    const points = isBonus ? 2 : 1;
    setTargets(prev => [...prev.slice(-4), { id: targetId, x: Math.random() * 75 + 10, y: Math.random() * 55 + 15, emoji, points }]);
    const lifetime = lifetimeRef.current;
    addTimeout(() => {
      setTargets(prev => prev.filter(target => target.id !== targetId));
    }, lifetime);
  }, [addTimeout]);

  useEffect(() => {
    if (!running) return;
    spawnDelayRef.current = 1200;
    lifetimeRef.current = 2500;

    const timer = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          setRunning(false);
          return 0;
        }
        return t - 1;
      });
    }, 1000);

    const difficultyTimer = setInterval(() => {
      spawnDelayRef.current = Math.max(500, spawnDelayRef.current - 100);
      lifetimeRef.current = Math.max(1200, lifetimeRef.current - 150);
    }, 5000);

    let spawnTimeout: ReturnType<typeof setTimeout>;
    const scheduleSpawn = () => {
      spawnTarget();
      spawnTimeout = setTimeout(scheduleSpawn, spawnDelayRef.current);
      timeoutsRef.current.push(spawnTimeout);
    };
    scheduleSpawn();

    return () => {
      clearInterval(timer);
      clearInterval(difficultyTimer);
      clearAllTimeouts();
    };
  }, [running, spawnTarget, clearAllTimeouts]);

  const start = () => {
    clearAllTimeouts();
    setRunning(true);
    setScore(0);
    setTimeLeft(20);
    setTargets([]);
    setSplashes([]);
  };

  const stopGame = () => {
    clearAllTimeouts();
    setRunning(false);
    setTimeLeft(20);
    setScore(0);
    setTargets([]);
    setSplashes([]);
  };

  const shootWeb = useCallback((id: number, x: number, y: number, points: number) => {
    initAudio();
    playNote(720, 0.12, 'block');
    setScore(prev => prev + points);
    setTargets(prev => prev.filter(target => target.id !== id));
    const splashId = Date.now() + Math.random();
    setSplashes(prev => [...prev, { id: splashId, x, y, text: points >= 2 ? '+2' : '+1' }]);
    addTimeout(() => {
      setSplashes(prev => prev.filter(s => s.id !== splashId));
    }, 500);
  }, [initAudio, playNote, addTimeout]);

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
        <div className="relative h-80 rounded-3xl overflow-hidden border border-white/10 bg-gradient-to-b from-sky-500 via-blue-700 to-slate-900">
          <div className="absolute inset-x-0 bottom-0 h-16 bg-[linear-gradient(90deg,rgba(255,255,255,0.2)_0_12px,transparent_12px_24px)] opacity-25" />
          <div className="absolute inset-x-0 top-4 text-center text-white/70 text-sm">Tap the bad guys before they escape the skyline.</div>
          {targets.map(target => (
            <button
              key={target.id}
              onTouchStart={(e) => { e.preventDefault(); shootWeb(target.id, target.x, target.y, target.points); }}
              onClick={() => shootWeb(target.id, target.x, target.y, target.points)}
              className="absolute -translate-x-1/2 -translate-y-1/2 w-[72px] h-[72px] rounded-full bg-white/15 backdrop-blur flex items-center justify-center text-4xl shadow-xl transition-transform hover:scale-110 active:scale-95 touch-none"
              style={{ left: `${target.x}%`, top: `${target.y}%`, touchAction: 'manipulation' }}
            >
              <span>{target.emoji}</span>
            </button>
          ))}
          {splashes.map(s => (
            <div key={s.id} className="absolute pointer-events-none flex flex-col items-center" style={{ left: `${s.x}%`, top: `${s.y}%`, transform: 'translate(-50%, -130%)' }}>
              <span className="text-3xl">🕸️</span>
              <span className="text-lg font-extrabold text-cyan-200 animate-bounce" style={{ textShadow: '0 0 8px rgba(0,200,255,0.8)' }}>{s.text}</span>
            </div>
          ))}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-5xl">🕷️</div>
        </div>
      )}
      {running && <button onClick={stopGame} className="mt-3 px-6 py-2 bg-red-500 rounded-full text-white font-bold">Stop</button>}
    </div>
  );
}

// ===== MONKEY BANANA GAME =====
function MonkeyBananaGame() {
  const [running, setRunning] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [misses, setMisses] = useState(0);
  const [monkeyX, setMonkeyX] = useState(50);
  const [bananasSnapshot, setBananasSnapshot] = useState<{ id: number; x: number; y: number; speed: number }[]>([]);

  const bananasRef = useRef<{ id: number; x: number; y: number; speed: number }[]>([]);
  const monkeyXRef = useRef(50);
  const runningRef = useRef(false);
  const lastFrameRef = useRef(0);
  const spawnTimerRef = useRef(0);
  const rafRef = useRef(0);
  const idRef = useRef(0);
  const scoreRef = useRef(0);
  const missesRef = useRef(0);
  const arenaRef = useRef<HTMLDivElement>(null);

  const moveMonkey = useCallback((percent: number) => {
    const next = Math.max(8, Math.min(92, percent));
    monkeyXRef.current = next;
    setMonkeyX(next);
  }, []);

  const gameLoop = useCallback((timestamp: number) => {
    if (!runningRef.current) return;

    if (lastFrameRef.current === 0) {
      lastFrameRef.current = timestamp;
      rafRef.current = requestAnimationFrame(gameLoop);
      return;
    }

    const deltaTime = Math.min((timestamp - lastFrameRef.current) / 1000, 0.1);
    lastFrameRef.current = timestamp;

    spawnTimerRef.current += deltaTime;
    if (spawnTimerRef.current >= 0.9 && bananasRef.current.length < 8) {
      spawnTimerRef.current = 0;
      idRef.current += 1;
      bananasRef.current.push({
        id: idRef.current,
        x: Math.random() * 78 + 11,
        y: 2,
        speed: Math.random() * 40 + 80,
      });
    }

    let caught = 0;
    let dropped = 0;
    const mx = monkeyXRef.current;
    const nextBananas: typeof bananasRef.current = [];

    for (const b of bananasRef.current) {
      const nextY = b.y + b.speed * deltaTime;
      if (nextY >= 72 && nextY <= 95 && Math.abs(b.x - mx) <= 16) {
        caught += 1;
      } else if (nextY > 95) {
        dropped += 1;
      } else {
        nextBananas.push({ ...b, y: nextY });
      }
    }

    bananasRef.current = nextBananas;

    if (caught) {
      scoreRef.current += caught;
      setScore(scoreRef.current);
    }
    if (dropped) {
      missesRef.current += dropped;
      setMisses(missesRef.current);
      if (missesRef.current >= 5) {
        runningRef.current = false;
        setRunning(false);
        setGameOver(true);
        setBananasSnapshot([]);
        return;
      }
    }

    setBananasSnapshot([...bananasRef.current]);
    rafRef.current = requestAnimationFrame(gameLoop);
  }, []);

  useEffect(() => {
    if (running) {
      runningRef.current = true;
      lastFrameRef.current = 0;
      spawnTimerRef.current = 0;
      rafRef.current = requestAnimationFrame(gameLoop);
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [running, gameLoop]);

  const start = useCallback(() => {
    bananasRef.current = [];
    scoreRef.current = 0;
    missesRef.current = 0;
    idRef.current = 0;
    setScore(0);
    setMisses(0);
    setBananasSnapshot([]);
    setGameOver(false);
    moveMonkey(50);
    setRunning(true);
  }, [moveMonkey]);

  const handleTouch = useCallback((clientX: number) => {
    if (!arenaRef.current) return;
    const rect = arenaRef.current.getBoundingClientRect();
    moveMonkey(((clientX - rect.left) / rect.width) * 100);
  }, [moveMonkey]);

  return (
    <div className="text-center">
      <div className="flex justify-center gap-6 mb-4 text-lg font-bold">
        <span className="text-yellow-300">🍌 {score}</span>
        <span className={misses >= 3 ? 'text-red-300 animate-pulse' : 'text-white'}>💨 Misses {misses}/5</span>
      </div>
      {!running && !gameOver ? (
        <button onClick={start} className="px-6 py-3 rounded-full bg-gradient-to-r from-lime-400 to-yellow-400 text-black font-bold hover:scale-105 transition">Start Banana Catch</button>
      ) : gameOver ? (
        <div>
          <div className="text-2xl font-bold text-green-300 mb-2">Monkey snack time finished!</div>
          <div className="text-white mb-4">You caught {score} bananas.</div>
          <button onClick={start} className="px-6 py-3 rounded-full bg-gradient-to-r from-lime-400 to-yellow-400 text-black font-bold hover:scale-105 transition">Play Again</button>
        </div>
      ) : (
        <div
          ref={arenaRef}
          className="relative h-80 rounded-3xl overflow-hidden border border-white/10 bg-gradient-to-b from-cyan-400 via-green-500 to-green-800 touch-none cursor-none"
          onMouseMove={(e) => handleTouch(e.clientX)}
          onTouchStart={(e) => { e.preventDefault(); handleTouch(e.touches[0].clientX); }}
          onTouchMove={(e) => { e.preventDefault(); handleTouch(e.touches[0].clientX); }}
        >
          <div className="absolute inset-x-0 top-3 text-center text-white/80 text-sm font-medium drop-shadow">Move finger or mouse to catch bananas!</div>
          {bananasSnapshot.map(item => (
            <div
              key={item.id}
              className="absolute -translate-x-1/2 text-3xl"
              style={{ left: `${item.x}%`, top: `${item.y}%`, transform: `translateX(-50%) rotate(${(item.x % 30) - 15}deg)` }}
            >🍌</div>
          ))}
          <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-amber-900/60 via-green-900/30 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-4 bg-green-900/50" />
          <div className="absolute -translate-x-1/2 -translate-y-1/2 text-5xl transition-[left] duration-75" style={{ left: `${monkeyX}%`, top: '84%' }}>🐵</div>
        </div>
      )}
      {running && <button onClick={() => { runningRef.current = false; setRunning(false); setGameOver(true); setBananasSnapshot([]); }} className="mt-3 px-6 py-2 bg-red-500 rounded-full text-white font-bold">Stop</button>}
    </div>
  );
}

// ===== DRAWING CANVAS =====
function DrawingCanvas() {
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
    const prev = historyRef.current[historyRef.current.length - 1];
    ctx.putImageData(prev, 0, 0);
  };

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

  const placeStamp = (pos: { x: number; y: number }) => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.font = `${brushSize * 5}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(stamp, pos.x, pos.y);
  };

  const start = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const pos = getPos(e);
    if (tool === 'stamp') {
      placeStamp(pos);
      saveState();
      return;
    }
    setDrawing(true);
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) {
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
    ctx.lineWidth = tool === 'eraser' ? brushSize * 3 : brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    lastPoint.current = pos;
  };

  const end = (e?: React.MouseEvent | React.TouchEvent) => {
    if (e) e.preventDefault();
    if (drawing) saveState();
    setDrawing(false);
    lastPoint.current = null;
  };

  const clear = () => {
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx && canvasRef.current) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      saveState();
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
      {/* Color palette */}
      <div className="flex flex-wrap justify-center gap-1.5 mb-3">
        {colors.map(c => (
          <button key={c} onClick={() => { setColor(c); setTool('brush'); }}
            className={`w-8 h-8 rounded-full border-2 transition-all ${color === c && tool === 'brush' ? 'border-yellow-300 scale-125 shadow-lg shadow-yellow-300/50' : 'border-white/20 hover:scale-110'}`}
            style={{ backgroundColor: c }} />
        ))}
      </div>
      {/* Tools row */}
      <div className="flex flex-wrap justify-center gap-1.5 mb-3">
        {brushSizes.map(b => (
          <button key={b.size} onClick={() => { setBrushSize(b.size); if (tool === 'stamp') setTool('brush'); }}
            className={`w-9 h-9 rounded-full font-bold flex items-center justify-center transition-all ${brushSize === b.size && tool !== 'stamp' ? 'bg-yellow-400 text-black scale-110' : 'bg-white/10 text-white hover:bg-white/20'}`}>
            {b.label}
          </button>
        ))}
        <div className="w-px h-9 bg-white/20 mx-1" />
        <button onClick={() => setTool('brush')} className={`px-3 py-1.5 rounded-full font-bold text-sm transition-all ${tool === 'brush' ? 'bg-pink-500 scale-105' : 'bg-white/10 hover:bg-white/20'}`}>🖌️</button>
        <button onClick={() => setTool('eraser')} className={`px-3 py-1.5 rounded-full font-bold text-sm transition-all ${tool === 'eraser' ? 'bg-cyan-500 text-black scale-105' : 'bg-white/10 hover:bg-white/20'}`}>🧽</button>
        <button onClick={() => setTool('stamp')} className={`px-3 py-1.5 rounded-full font-bold text-sm transition-all ${tool === 'stamp' ? 'bg-purple-500 scale-105' : 'bg-white/10 hover:bg-white/20'}`}>🎨</button>
      </div>
      {/* Stamp picker (shown when stamp tool active) */}
      {tool === 'stamp' && (
        <div className="flex flex-wrap justify-center gap-1.5 mb-3">
          {stamps.map(s => (
            <button key={s} onClick={() => setStamp(s)}
              className={`w-10 h-10 rounded-xl text-xl flex items-center justify-center transition-all ${stamp === s ? 'bg-purple-500 scale-110 ring-2 ring-purple-300' : 'bg-white/10 hover:bg-white/20'}`}>
              {s}
            </button>
          ))}
        </div>
      )}
      {/* Canvas */}
      <canvas ref={canvasRef} width={480} height={360}
        className="bg-white rounded-2xl mx-auto cursor-crosshair touch-none w-full max-w-[480px] shadow-xl shadow-black/30 border-2 border-white/20"
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end} />
      {/* Action buttons */}
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <button onClick={undo} className="px-4 py-2 bg-orange-500 rounded-full text-white font-bold hover:scale-105 transition">↩️ Undo</button>
        <button onClick={clear} className="px-4 py-2 bg-red-500 rounded-full text-white font-bold hover:scale-105 transition">🗑️ Clear</button>
        <button onClick={save} className="px-4 py-2 bg-green-500 rounded-full text-white font-bold hover:scale-105 transition">💾 Save</button>
      </div>
    </div>
  );
}

// ===== MAIN HOME =====
const SECTION_IDS = ['hero', 'about', 'food', 'kpop', 'music', 'taekwondo', 'pokemon', 'artwork', 'spiderman', 'pikachu', 'games', 'art', 'dreams'];
export default function Home() {
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState(0);
  const [showPiano, setShowPiano] = useState(false);
  const [pokeEffect, setPokeEffect] = useState<{ type: string; x: number; y: number } | null>(null);
  const sparkles = useSparkles(30);
  const { playNote, playMelody, playSoundClip, sodaPopMelody, goldenMelody, initAudio, stopAllSounds } = useAudio();

  const triggerPokeEffect = (type: string, e: React.MouseEvent, pokemonName?: string) => {
    initAudio();
    setPokeEffect({ type, x: e.clientX, y: e.clientY });
    if (pokemonName) {
      playSoundClip(`/sounds/pokemon/${pokemonName.toLowerCase()}.mp3`, 5);
    }
  };

  useEffect(() => {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) { const i = SECTION_IDS.indexOf(e.target.id); if (i >= 0) setActiveSection(i); } });
    }, { threshold: 0.3 });
    SECTION_IDS.forEach(id => { const el = document.getElementById(id); if (el) obs.observe(el); });
    
    // iOS audio warm-up on first touch
    const warmAudio = () => { initAudio(); };
    document.addEventListener('touchstart', warmAudio, { once: true });
    document.addEventListener('touchend', warmAudio, { once: true });
    
    return () => {
      obs.disconnect();
      document.removeEventListener('touchstart', warmAudio);
      document.removeEventListener('touchend', warmAudio);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <LoadingScreen onFinish={() => setLoading(false)} />;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 text-white overflow-x-hidden">
      <CustomCursor />
      <ScrollProgress />
      <NavDots sections={SECTION_IDS} active={activeSection} />
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
        <div className="flex flex-col md:flex-row items-center gap-8 z-10">
          <div className="relative w-48 h-80 md:w-56 md:h-96 flex-shrink-0">
            <Image src="/images/jay.jpg" alt="Jayden" fill className="object-contain drop-shadow-[0_0_30px_rgba(236,72,153,0.5)] hover:scale-105 transition-transform duration-500" priority />
          </div>
          <div className="text-center md:text-left">
            <h1 className="text-5xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-yellow-300 via-pink-400 to-purple-400 bg-clip-text text-transparent animate-pulse">
              ✨ Welcome to Jayden&apos;s World ✨
            </h1>
            <p className="text-xl md:text-2xl mb-8 text-purple-200">I&apos;m Jayden — a 4-year-old superhero from Hong Kong! 🇭🇰</p>
            <p className="text-lg mb-8 text-pink-300">I love Pokémon ⚡, Spider-Man 🕷️, music 🎵, taekwondo 🥋, and K-pop 🎤</p>
            <a href="#about" className="px-10 py-4 bg-gradient-to-r from-pink-500 via-purple-500 to-blue-500 rounded-full text-xl font-bold hover:scale-110 transition-all duration-300 shadow-lg shadow-pink-500/50 inline-block magnetic-btn">
              🚀 Start the Adventure!
            </a>
          </div>
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
              { icon: '🎹', name: 'Piano', desc: '32 keys to play!', status: 'Practicing', color: 'from-purple-500 to-pink-600', isPiano: true, instrument: 'piano' as const, melody: [
                { freq: 261.63, dur: 0.3 }, { freq: 329.63, dur: 0.3 }, { freq: 392.0, dur: 0.4 },
                { freq: 523.25, dur: 0.3 }, { freq: 392.0, dur: 0.3 }, { freq: 329.63, dur: 0.5 },
              ]},
            ].map((item, i) => (
              <TiltCard key={i}>
                <div className={`p-6 rounded-3xl bg-gradient-to-br ${item.color} text-center shadow-xl cursor-pointer group`}
                     onClick={() => { initAudio(); stopAllSounds(); playMelody(item.melody, 220, item.instrument); }}>
                  <div className="text-6xl mb-4">{item.icon}</div>
                  <h3 className="text-2xl font-bold mb-2">{item.name}</h3>
                  <p className="text-white/80 mb-3">{item.desc}</p>
                  <span className="px-4 py-1 bg-white/20 rounded-full text-sm">{item.status}</span>
                  <p className="text-xs mt-2 text-white/50">🎵 Click to play!</p>
                  {(item as any).isPiano && (
                    <button
                      onClick={(e) => { e.stopPropagation(); initAudio(); stopAllSounds(); setShowPiano(true); }}
                      className="mt-3 px-5 py-2 bg-white/25 hover:bg-white/40 rounded-full text-sm font-semibold transition-all hover:scale-105 backdrop-blur-sm border border-white/20"
                    >🎹 Open Virtual Piano</button>
                  )}
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
              { belt: 'White', color: 'bg-gray-100', active: true, next: false },
              { belt: 'Yellow', color: 'bg-yellow-400', active: false, next: true },
              { belt: 'Green', color: 'bg-green-500', active: false, next: false },
              { belt: 'Blue', color: 'bg-blue-500', active: false, next: false },
              { belt: 'Red', color: 'bg-red-500', active: false, next: false },
              { belt: 'Black', color: 'bg-gray-900', active: false, next: false },
            ].map((item, i) => (
              <div key={i} className="flex flex-col items-center">
                <div className={`w-8 h-12 rounded ${item.color} ${item.active ? 'ring-4 ring-white scale-125 shadow-lg shadow-white/40' : item.next ? 'opacity-70 ring-2 ring-yellow-300/50 animate-pulse' : 'opacity-30'} transition-all`} />
                <span className={`text-xs mt-2 ${item.active ? 'text-white font-bold' : item.next ? 'text-yellow-300/80' : 'text-white/50'}`}>{item.belt}{item.next ? ' ⬆️' : ''}</span>
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
                     onClick={(e) => triggerPokeEffect(item.type, e, item.name)}>
                  <div className="relative w-full aspect-square mb-2">
                    <Image src={`/images/pokemon/${item.file}`} alt={item.name} fill className="object-contain drop-shadow-xl group-hover:scale-110 transition-transform" />
                  </div>
                  <div className="text-center">
                    <div className="font-bold">{item.name}</div>
                    <div className="text-xs opacity-80">{item.type} · Tap to hear!</div>
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
          <div className="flex flex-wrap justify-center gap-6">
            {[
              { id: 1, name: 'Spider-Man', sound: '/sounds/spiderman/spiderman-sound.mp3', quote: '🕸️ Thwip!' },
              { id: 2, name: 'Spider-Man 2099', sound: '/sounds/spiderman/rizzing.mp3', quote: '⚡ Shocking!' },
              { id: 3, name: 'Green Goblin', sound: '/sounds/spiderman/green-goblin.mp3', quote: '💚 Spider-Man!' },
              { id: 4, name: 'J. Jonah Jameson', sound: '/sounds/spiderman/boss-laugh.mp3', quote: '😂 Ha ha ha!' },
              { id: 5, name: 'Electro Battle', sound: '/sounds/spiderman/falling.mp3', quote: '💥 Aaaargh!' },
            ].map(item => (
              <TiltCard key={item.id}>
                <div className="w-[calc(50vw-2rem)] md:w-56 p-4 rounded-2xl bg-gradient-to-br from-red-600/30 to-blue-800/30 backdrop-blur shadow-xl cursor-pointer group relative overflow-hidden"
                     onClick={() => { initAudio(); playSoundClip(item.sound, 5); }}>
                  <div className="relative w-full aspect-square">
                    <Image src={`/images/spiderman/spiderman_${item.id}.png`} alt={item.name} fill className="object-contain drop-shadow-2xl group-hover:scale-110 transition-transform" />
                  </div>
                  <p className="text-center text-sm font-bold mt-2 text-white/80">{item.name}</p>
                  <p className="text-center text-xs text-white/50 mt-1">{item.quote} Tap to hear!</p>
                  <div className="absolute inset-0 bg-gradient-to-t from-red-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl pointer-events-none" />
                </div>
              </TiltCard>
            ))}
          </div>
          <p className="text-center text-red-200 mt-6 text-lg">Your friendly neighborhood hero! 🕸️ Click each one!</p>
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
        <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="mt-6 px-6 py-3 bg-gradient-to-r from-pink-500 to-purple-500 rounded-full text-white font-bold hover:scale-110 transition-all shadow-lg shadow-pink-500/30">
          🚀 Back to Top!
        </button>
      </footer>

      {/* PIANO POPUP */}
      {showPiano && <PianoKeyboard onClose={() => { setShowPiano(false); stopAllSounds(); }} playNote={playNote} initAudio={initAudio} stopAllSounds={stopAllSounds} />}

      {/* POKEMON EFFECT */}
      {pokeEffect && <PokemonEffect type={pokeEffect.type} x={pokeEffect.x} y={pokeEffect.y} onDone={() => setPokeEffect(null)} />}
    </div>
  );
}
