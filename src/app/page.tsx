'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';

import type { InstrumentName } from '@/components/jayden/types';

// ===== TYPES =====
type SparkleData = { left: string; top: string; animationDelay: string };
type AboutCard = { icon?: string; title: string; value: string; color: string; isFlag?: boolean };
type FoodCard = { name: string; emoji: string; desc: string; color: string; isSiuMai?: boolean };
type MusicCard = {
  icon: string;
  name: string;
  desc: string;
  status: string;
  color: string;
  samplePath: string;
  isPiano?: boolean;
};

const ABOUT_CARDS: AboutCard[] = [
  { icon: '🎂', title: 'Age', value: '4 Years Old', color: 'from-pink-500 to-rose-500' },
  { title: 'Born', value: 'Hong Kong', color: 'from-blue-500 to-cyan-500', isFlag: true },
  { icon: '⚡', title: 'Superpower', value: 'Being Awesome!', color: 'from-yellow-500 to-orange-500' },
  { icon: '🏃', title: 'Personality', value: 'Active & Energetic', color: 'from-green-500 to-emerald-500' },
  { icon: '😄', title: 'Vibe', value: 'Outgoing & Confident', color: 'from-purple-500 to-violet-500' },
  { icon: '💪', title: 'Special', value: 'Super Handsome', color: 'from-red-500 to-pink-500' },
];

const FOOD_CARDS: FoodCard[] = [
  { name: 'Siu Mai', emoji: '', desc: 'Dim sum champion!', color: 'from-orange-400 to-red-500', isSiuMai: true },
  { name: 'French Fries', emoji: '🍟', desc: 'Crispy & golden!', color: 'from-yellow-400 to-amber-500' },
  { name: 'Chicken', emoji: '🍗', desc: 'Yummy & juicy!', color: 'from-amber-400 to-orange-500' },
  { name: 'Fish Stick', emoji: '🐟', desc: 'Ocean goodness!', color: 'from-blue-400 to-cyan-500' },
];

const MUSIC_CARDS: MusicCard[] = [
  {
    icon: '🎵',
    name: 'Clarinet',
    desc: 'My jazzy friend!',
    status: 'Learning',
    color: 'from-blue-500 to-indigo-600',
    samplePath: '/sounds/clarinet-note.mp3',
  },
  {
    icon: '🎶',
    name: 'Recorder',
    desc: 'My first instrument!',
    status: 'Playing',
    color: 'from-green-500 to-teal-600',
    samplePath: '/sounds/recorder-note.mp3',
  },
  {
    icon: '🎹',
    name: 'Piano',
    desc: '32 keys to play!',
    status: 'Practicing',
    color: 'from-purple-500 to-pink-600',
    samplePath: '/sounds/piano-note.mp3',
    isPiano: true,
  },
];

function useSafeStateRef<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const legacyMediaQuery = mediaQuery as MediaQueryList & {
      addListener?: (listener: (event: MediaQueryListEvent) => void) => void;
      removeListener?: (listener: (event: MediaQueryListEvent) => void) => void;
    };
    const onChange = () => setPrefersReducedMotion(mediaQuery.matches);
    onChange();
    if ('addEventListener' in mediaQuery) {
      mediaQuery.addEventListener('change', onChange);
      return () => mediaQuery.removeEventListener('change', onChange);
    }
    legacyMediaQuery.addListener?.(onChange);
    return () => legacyMediaQuery.removeListener?.(onChange);
  }, []);

  return prefersReducedMotion;
}

function SectionLoader({ label }: { label: string }) {
  return <div className="py-12 text-center text-white/60">{label}</div>;
}

function LazyMount({
  children,
  placeholder,
  rootMargin = '320px',
}: {
  children: React.ReactNode;
  placeholder?: React.ReactNode;
  rootMargin?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    if (shouldRender || !ref.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setShouldRender(true);
      }
    }, { rootMargin });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [rootMargin, shouldRender]);

  return <div ref={ref}>{shouldRender ? children : placeholder ?? <SectionLoader label="Loading..." />}</div>;
}

const PianoKeyboard = dynamic(() => import('@/components/jayden/PianoKeyboard'), {
  ssr: false,
  loading: () => <SectionLoader label="Loading piano..." />,
});
const MemoryGame = dynamic(() => import('@/components/jayden/MemoryGame'), {
  ssr: false,
  loading: () => <SectionLoader label="Loading memory game..." />,
});
const StarCatchGame = dynamic(() => import('@/components/jayden/StarCatchGame'), {
  ssr: false,
  loading: () => <SectionLoader label="Loading star game..." />,
});
const SpiderManWebGame = dynamic(() => import('@/components/jayden/SpiderManWebGame'), {
  ssr: false,
  loading: () => <SectionLoader label="Loading web shooter..." />,
});
const MonkeyBananaGame = dynamic(() => import('@/components/jayden/MonkeyBananaGame'), {
  ssr: false,
  loading: () => <SectionLoader label="Loading banana catch..." />,
});
const DrawingCanvas = dynamic(() => import('@/components/jayden/DrawingCanvas'), {
  ssr: false,
  loading: () => <SectionLoader label="Loading drawing board..." />,
});

// ===== AUDIO ENGINE (Web Audio API - iOS compatible) =====
// iOS Safari rule: AudioContext MUST be created/resumed inside a direct user gesture.
// Strategy: keep one context, unlock it on first gesture, resume on every call.
function useAudio() {
  const ctxRef = useRef<AudioContext | null>(null);
  const unlockedRef = useRef(false);
  const noiseBufferRef = useRef<AudioBuffer | null>(null);
  const clipRequestIdRef = useRef(0);
  // Sample cache: keyed by instrument name
  const sampleCacheRef = useRef<Record<string, AudioBuffer>>({});
  const sampleLoadingRef = useRef<Record<string, Promise<AudioBuffer | null>>>({});
  // Track active sources to stop them on demand
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const activeOscillatorsRef = useRef<OscillatorNode[]>([]);

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
      const AC = window.AudioContext || ('webkitAudioContext' in window ? window.webkitAudioContext : undefined);
      if (!AC) return null;
      if (!ctxRef.current) {
        ctxRef.current = new AC();
      }
      return ctxRef.current;
    } catch {
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
        void ctx.resume().catch(() => undefined);
        const buf = ctx.createBuffer(1, 1, ctx.sampleRate);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const g = ctx.createGain();
        g.gain.value = 0.001; // near-silent
        src.connect(g).connect(ctx.destination);
        src.start(0);
        unlockedRef.current = true;
      }
    } catch {}
  }, [getAudioContext]);

  const stopActiveSounds = useCallback(() => {
    // Stop buffer sources
    activeSourcesRef.current.forEach(src => {
      try { src.stop(); } catch {}
    });
    activeSourcesRef.current = [];
    // Stop oscillator sources
    activeOscillatorsRef.current.forEach(osc => {
      try { osc.stop(); } catch {}
    });
    activeOscillatorsRef.current = [];
  }, []);

  // Stop all currently playing sounds and invalidate pending async clip starts.
  const stopAllSounds = useCallback(() => {
    clipRequestIdRef.current += 1;
    stopActiveSounds();
  }, [stopActiveSounds]);

  const playSynthNote = useCallback((ctx: AudioContext, freq: number, duration: number, instrument: 'piano' | 'clarinet' | 'recorder') => {
    const now = ctx.currentTime + 0.01;
    const release = instrument === 'piano' ? 0.6 : instrument === 'clarinet' ? 0.35 : 0.42;
    const end = now + Math.max(duration, 0.15) + release;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = instrument === 'piano' ? 2800 : instrument === 'clarinet' ? 1800 : 3400;
    filter.Q.value = instrument === 'clarinet' ? 1.2 : 0.7;

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0.0001, now);

    const attack = instrument === 'piano' ? 0.008 : 0.03;
    const peak = instrument === 'piano' ? 0.35 : instrument === 'clarinet' ? 0.22 : 0.18;
    const sustain = instrument === 'piano' ? 0.08 : instrument === 'clarinet' ? 0.14 : 0.11;
    gainNode.gain.exponentialRampToValueAtTime(peak, now + attack);
    gainNode.gain.exponentialRampToValueAtTime(sustain, now + Math.max(duration * 0.45, attack + 0.03));
    gainNode.gain.setValueAtTime(sustain, now + duration);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, end);
    filter.connect(gainNode).connect(ctx.destination);

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const osc1Gain = ctx.createGain();
    const osc2Gain = ctx.createGain();

    if (instrument === 'piano') {
      osc1.type = 'triangle';
      osc2.type = 'sine';
      osc1Gain.gain.value = 0.8;
      osc2Gain.gain.value = 0.35;
    } else if (instrument === 'clarinet') {
      osc1.type = 'square';
      osc2.type = 'sine';
      osc1Gain.gain.value = 0.42;
      osc2Gain.gain.value = 0.18;
    } else {
      osc1.type = 'sine';
      osc2.type = 'triangle';
      osc1Gain.gain.value = 0.5;
      osc2Gain.gain.value = 0.14;
    }

    osc1.frequency.setValueAtTime(freq, now);
    osc2.frequency.setValueAtTime(freq * (instrument === 'piano' ? 2 : 1.005), now);
    if (instrument === 'piano') {
      osc1.detune.setValueAtTime(-3, now);
      osc2.detune.setValueAtTime(4, now);
    }

    osc1.connect(osc1Gain).connect(filter);
    osc2.connect(osc2Gain).connect(filter);

    if (instrument !== 'piano') {
      const vibrato = ctx.createOscillator();
      const vibratoGain = ctx.createGain();
      vibrato.frequency.value = instrument === 'clarinet' ? 4.5 : 5.2;
      vibratoGain.gain.value = instrument === 'clarinet' ? 6 : 9;
      vibrato.connect(vibratoGain);
      vibratoGain.connect(osc1.frequency);
      vibratoGain.connect(osc2.frequency);
      vibrato.start(now);
      vibrato.stop(end);
      activeOscillatorsRef.current.push(vibrato);
      vibrato.onended = () => {
        activeOscillatorsRef.current = activeOscillatorsRef.current.filter(activeOsc => activeOsc !== vibrato);
      };
    }

    osc1.start(now);
    osc2.start(now);
    osc1.stop(end);
    osc2.stop(end);
    activeOscillatorsRef.current.push(osc1, osc2);
    const cleanup = (osc: OscillatorNode) => {
      activeOscillatorsRef.current = activeOscillatorsRef.current.filter(activeOsc => activeOsc !== osc);
    };
    osc1.onended = () => cleanup(osc1);
    osc2.onended = () => cleanup(osc2);
  }, []);

  const playPercussionFallback = useCallback((ctx: AudioContext, instrument: 'kick' | 'punch' | 'block', duration: number) => {
    const now = ctx.currentTime + 0.01;
    const end = now + Math.max(duration, 0.18) + 0.22;

    if (instrument === 'kick') {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.exponentialRampToValueAtTime(42, now + 0.18);
      gainNode.gain.setValueAtTime(0.9, now);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
      osc.connect(gainNode).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.22);
      activeOscillatorsRef.current.push(osc);
      osc.onended = () => {
        activeOscillatorsRef.current = activeOscillatorsRef.current.filter(activeOsc => activeOsc !== osc);
      };
      return;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = getNoiseBuffer(ctx);
    const bandPass = ctx.createBiquadFilter();
    bandPass.type = 'bandpass';
    bandPass.frequency.value = instrument === 'punch' ? 720 : 1400;
    bandPass.Q.value = 1.4;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.5, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, end);

    const tone = ctx.createOscillator();
    tone.type = instrument === 'punch' ? 'triangle' : 'square';
    tone.frequency.setValueAtTime(instrument === 'punch' ? 120 : 410, now);
    tone.frequency.exponentialRampToValueAtTime(instrument === 'punch' ? 70 : 180, end);
    const toneGain = ctx.createGain();
    toneGain.gain.setValueAtTime(instrument === 'punch' ? 0.45 : 0.18, now);
    toneGain.gain.exponentialRampToValueAtTime(0.0001, end);

    noise.connect(bandPass).connect(noiseGain).connect(ctx.destination);
    tone.connect(toneGain).connect(ctx.destination);
    noise.start(now);
    noise.stop(end);
    tone.start(now);
    tone.stop(end);

    activeSourcesRef.current.push(noise);
    activeOscillatorsRef.current.push(tone);
    noise.onended = () => {
      activeSourcesRef.current = activeSourcesRef.current.filter(src => src !== noise);
    };
    tone.onended = () => {
      activeOscillatorsRef.current = activeOscillatorsRef.current.filter(activeOsc => activeOsc !== tone);
    };
  }, [getNoiseBuffer]);

  const playNote = useCallback((freq: number, duration: number, instrument: InstrumentName = 'piano') => {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      if (ctx.state !== 'running') {
        void ctx.resume().catch(() => undefined);
      }

      const isTonal = instrument === 'piano' || instrument === 'clarinet' || instrument === 'recorder';
      const isCombat = instrument === 'kick' || instrument === 'punch' || instrument === 'block';
      if (isTonal) {
        playSynthNote(ctx, freq, duration, instrument);
        return;
      }
      if (isCombat) {
        loadSample(instrument, ctx).then(buf => {
          if (!buf) {
            playPercussionFallback(ctx, instrument, duration);
            return;
          }
          const now = ctx.currentTime + 0.01;
          const src = ctx.createBufferSource();
          src.buffer = buf;
          const gainNode = ctx.createGain();
          const clipDuration = Math.min(buf.duration, Math.max(duration + 0.4, 0.7));
          gainNode.gain.setValueAtTime(0.9, now);
          gainNode.gain.setValueAtTime(0.9, now + Math.max(clipDuration - 0.15, 0.2));
          gainNode.gain.exponentialRampToValueAtTime(0.0001, now + clipDuration);
          src.connect(gainNode).connect(ctx.destination);
          src.start(now);
          src.stop(now + clipDuration);
          activeSourcesRef.current.push(src);
          src.onended = () => {
            activeSourcesRef.current = activeSourcesRef.current.filter(s => s !== src);
          };
        }).catch(() => {});
        return;
      }
    } catch { /* silent fail */ }
  }, [getAudioContext, loadSample, playPercussionFallback, playSynthNote]);

  // Play a sound clip from a URL path (max duration in seconds, default 5)
  const playSoundClip = useCallback((url: string, maxDuration: number = 5) => {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      if (ctx.state !== 'running') {
        void ctx.resume().catch(() => undefined);
      }
      const requestId = clipRequestIdRef.current + 1;
      clipRequestIdRef.current = requestId;
      stopActiveSounds();
      loadSample(url, ctx).then(buf => {
        if (!buf || clipRequestIdRef.current !== requestId) return;
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
    } catch {}
  }, [getAudioContext, loadSample, stopActiveSounds]);

  return { playNote, playSoundClip, initAudio, stopAllSounds };
}

// ===== POKEMON EFFECTS =====
function PokemonEffect({ type, x, y, onDone, reducedMotion = false }: { type: string; x: number; y: number; onDone: () => void; reducedMotion?: boolean }) {
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
      <div className={`text-6xl ${reducedMotion ? '' : 'animate-ping'}`}>{fx.emoji}</div>
      <div className={`text-lg font-bold text-center bg-gradient-to-r ${fx.color} bg-clip-text text-transparent ${reducedMotion ? '' : 'animate-bounce'}`}>{fx.label}</div>
      {Array.from({ length: 8 }).map((_, i) => (
        <span key={i} className={`absolute text-2xl ${reducedMotion ? '' : 'animate-ping'}`} style={{
          left: `${Math.cos(i * 45 * Math.PI / 180) * 60}px`,
          top: `${Math.sin(i * 45 * Math.PI / 180) * 60}px`,
          animationDelay: `${i * 0.1}s`,
        }}>{fx.emoji}</span>
      ))}
    </div>
  );
}

// ===== CUSTOM CURSOR =====
function CustomCursor({ disabled }: { disabled: boolean }) {
  const cursorRef = useRef<HTMLDivElement>(null);
  const trailRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const positions = useRef<{ x: number; y: number }[]>(Array.from({ length: 6 }, () => ({ x: -50, y: -50 })));
  const posIdx = useRef(0);

  useEffect(() => {
    if (disabled) return;

    let rafId = 0;
    let active = false;
    let idleTimer = 0;

    const update = () => {
      if (!active) return;
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

    const stopLoop = () => {
      active = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
    };

    const startLoop = () => {
      if (active) return;
      active = true;
      rafId = requestAnimationFrame(update);
    };

    const move = (e: MouseEvent) => {
      posIdx.current = (posIdx.current + 1) % positions.current.length;
      positions.current[posIdx.current] = { x: e.clientX, y: e.clientY };
      startLoop();
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(stopLoop, 120);
    };
    const onVisibilityChange = () => {
      if (document.hidden) stopLoop();
    };

    window.addEventListener('mousemove', move);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('mousemove', move);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.clearTimeout(idleTimer);
      stopLoop();
    };
  }, [disabled]);

  if (disabled) return null;

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
  return Array.from({ length: count }, (_, index) => ({
    left: `${(index * 17.7 + 9) % 100}%`,
    top: `${(index * 23.5 + 14) % 100}%`,
    animationDelay: `${(index * 0.37) % 5}s`,
  }));
}

function Sparkle({ style }: { style: SparkleData }) {
  return <span className="absolute text-yellow-300 text-xl animate-pulse pointer-events-none z-0" style={style}>✨</span>;
}

function JayPortrait({ className, priority = false }: { className: string; priority?: boolean }) {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return (
      <div className="w-full h-full rounded-3xl border border-white/20 bg-white/10 backdrop-blur flex items-center justify-center text-center text-white/80 px-4">
        Jayden
      </div>
    );
  }

  return (
    <Image
      src="/images/jay.jpg"
      alt="Jayden"
      fill
      sizes="(max-width: 768px) 14rem, 18rem"
      priority={priority}
      onError={() => setHasError(true)}
      className={className}
    />
  );
}

// ===== LOADING SCREEN =====
function LoadingScreen({ onFinish }: { onFinish: () => void }) {
  const [imageReady, setImageReady] = useState(false);
  const [minimumDelayPassed, setMinimumDelayPassed] = useState(false);

  useEffect(() => {
    const preloadImage = new window.Image();
    preloadImage.src = '/images/jay.jpg';
    preloadImage.onload = () => setImageReady(true);
    preloadImage.onerror = () => setImageReady(true);
    const timer = window.setTimeout(() => setMinimumDelayPassed(true), 250);
    return () => {
      preloadImage.onload = null;
      preloadImage.onerror = null;
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (imageReady && minimumDelayPassed) {
      const finishTimer = window.setTimeout(onFinish, 80);
      return () => window.clearTimeout(finishTimer);
    }
  }, [imageReady, minimumDelayPassed, onFinish]);

  const ready = imageReady && minimumDelayPassed;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center">
      <div className="text-center">
        <div className="relative w-40 h-72 mx-auto mb-4">
          <JayPortrait className={`object-contain drop-shadow-2xl transition-all duration-500 ${ready ? 'scale-105 opacity-100' : 'animate-pulse scale-95 opacity-90'}`} priority />
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">Jayden&apos;s World</h1>
        <div className="w-64 h-3 bg-purple-800/80 rounded-full overflow-hidden mx-auto">
          <div className={`h-full bg-gradient-to-r from-pink-500 to-yellow-500 transition-all duration-300 ${ready ? 'w-full' : 'w-2/3 animate-pulse'}`} />
        </div>
        <p className="text-purple-200 mt-3 text-sm">{ready ? 'Ready!' : 'Loading the adventure...'}</p>
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
function FloatingEmoji({ emoji, delay, left, disabled = false }: { emoji: string; delay: number; left: string; disabled?: boolean }) {
  const [top] = useState(() => `${20 + Math.random() * 60}%`);
  if (disabled) return null;
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
function VirtualPikachu({ reducedMotion = false }: { reducedMotion?: boolean }) {
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

  const hungerRef = useSafeStateRef(hunger);
  const energyRef = useSafeStateRef(energy);

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
  }, [sleeping, hungerRef, energyRef]);

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

  const imageWrapperClass = mood === 'happy' ? (reducedMotion ? '' : 'animate-bounce')
    : mood === 'sleeping' ? 'grayscale-50 scale-90'
    : mood === 'hungry' ? `${reducedMotion ? '' : 'animate-pulse '}border-2 border-red-400 rounded-full`
    : mood === 'sad' ? 'grayscale scale-75'
    : mood === 'exhausted' ? 'grayscale-75 opacity-60'
    : '';

  const imageWrapperStyle = mood === 'happy'
    ? { filter: 'drop-shadow(0 0 20px rgba(250, 204, 21, 0.7))' }
    : {};

  return (
    <div className="text-center">
      <button type="button" className="relative inline-block mb-4 cursor-pointer" onClick={pet} aria-label="Pet Pikachu">
        <div className={`transition-all duration-500 ${imageWrapperClass}`} style={imageWrapperStyle}>
          <Image src="/images/pokemon/pikachu.webp" alt="Pikachu" width={160} height={160} sizes="160px" className="mx-auto" />
        </div>
        {mood === 'sleeping' && (
          <span className={`absolute -top-2 -right-2 text-3xl ${reducedMotion ? '' : 'animate-pulse'}`}>💤</span>
        )}
        {actionText && (
          <div className={`absolute -top-8 left-1/2 -translate-x-1/2 text-2xl font-bold text-yellow-300 whitespace-nowrap ${reducedMotion ? '' : 'animate-bounce'}`}>
            {actionText}
          </div>
        )}
      </button>
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

function SpotifyEmbedCard({
  title,
  subtitle,
  emoji,
  colorClass,
  trackId,
  reducedMotion = false,
}: {
  title: string;
  subtitle: string;
  emoji: string;
  colorClass: string;
  trackId: string;
  reducedMotion?: boolean;
}) {
  const [loaded, setLoaded] = useState(false);

  return (
    <TiltCard>
      <div className={`p-6 rounded-3xl bg-gradient-to-br ${colorClass} shadow-2xl relative overflow-hidden`}>
        <div className={`text-6xl mb-4 text-center ${reducedMotion ? '' : 'animate-bounce'}`}>{emoji}</div>
        <h3 className="text-3xl font-bold text-center mb-1">{title}</h3>
        <p className="text-center text-sm opacity-70 mb-4">{subtitle}</p>
        {loaded ? (
          <iframe
            style={{ borderRadius: '12px' }}
            src={`https://open.spotify.com/embed/track/${trackId}`}
            width="100%"
            height="152"
            frameBorder={0}
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="lazy"
          />
        ) : (
          <button
            type="button"
            onClick={() => setLoaded(true)}
            className="w-full h-[152px] rounded-xl border border-white/20 bg-black/20 backdrop-blur text-white/90 font-semibold hover:bg-black/30 transition"
          >
            Load Spotify Player
          </button>
        )}
      </div>
    </TiltCard>
  );
}

// ===== MAIN HOME =====
const SECTION_IDS = ['hero', 'about', 'food', 'kpop', 'music', 'taekwondo', 'pokemon', 'artwork', 'spiderman', 'pikachu', 'games', 'art', 'dreams'];
export default function Home() {
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState(0);
  const [showPiano, setShowPiano] = useState(false);
  const [pokeEffect, setPokeEffect] = useState<{ type: string; x: number; y: number } | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const sparkles = useSparkles(prefersReducedMotion ? 0 : 12);
  const { playNote, playSoundClip, initAudio, stopAllSounds } = useAudio();

  const triggerPokeEffect = (type: string, e: React.MouseEvent, pokemonName?: string) => {
    initAudio();
    setPokeEffect({ type, x: e.clientX, y: e.clientY });
    if (pokemonName) {
      playSoundClip(`/sounds/pokemon/${pokemonName.toLowerCase()}.mp3`, 5);
    }
  };

  useEffect(() => {
    if (loading) return;

    const obs = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) { const i = SECTION_IDS.indexOf(e.target.id); if (i >= 0) setActiveSection(i); } });
    }, { threshold: 0.3 });
    SECTION_IDS.forEach(id => { const el = document.getElementById(id); if (el) obs.observe(el); });

    const warmAudio = () => { initAudio(); };
    document.addEventListener('pointerdown', warmAudio, { once: true });

    return () => {
      obs.disconnect();
      document.removeEventListener('pointerdown', warmAudio);
    };
  }, [loading, initAudio]);

  if (loading) return <LoadingScreen onFinish={() => setLoading(false)} />;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 text-white overflow-x-hidden">
      <CustomCursor disabled={prefersReducedMotion} />
      <ScrollProgress />
      <NavDots sections={SECTION_IDS} active={activeSection} />
      {sparkles.map((s, i) => <Sparkle key={i} style={s} />)}

      {/* HERO */}
      <section id="hero" className="relative min-h-screen flex items-center justify-center px-4">
        <FloatingEmoji emoji="⚡" delay={0} left="10%" disabled={prefersReducedMotion} />
        <FloatingEmoji emoji="🎮" delay={0.5} left="20%" disabled={prefersReducedMotion} />
        <FloatingEmoji emoji="🕷️" delay={1} left="80%" disabled={prefersReducedMotion} />
        <FloatingEmoji emoji="🎵" delay={1.5} left="70%" disabled={prefersReducedMotion} />
        <FloatingEmoji emoji="🥋" delay={2} left="90%" disabled={prefersReducedMotion} />
        <FloatingEmoji emoji="⭐" delay={0.3} left="5%" disabled={prefersReducedMotion} />
        <FloatingEmoji emoji="💫" delay={0.8} left="85%" disabled={prefersReducedMotion} />
        <FloatingEmoji emoji="🌟" delay={1.2} left="15%" disabled={prefersReducedMotion} />
        <div className="flex flex-col md:flex-row items-center gap-8 z-10">
          <div className="relative w-48 h-80 md:w-56 md:h-96 flex-shrink-0">
            <JayPortrait className="object-contain drop-shadow-[0_0_30px_rgba(236,72,153,0.5)] hover:scale-105 transition-transform duration-500" priority />
          </div>
          <div className="text-center md:text-left">
            <h1 className={`text-5xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-yellow-300 via-pink-400 to-purple-400 bg-clip-text text-transparent ${prefersReducedMotion ? '' : 'animate-pulse'}`}>
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
            {ABOUT_CARDS.map((item, i) => (
              <TiltCard key={i}>
                <div className={`p-6 rounded-3xl bg-gradient-to-br ${item.color} shadow-lg`}>
                  {item.isFlag ? (
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
            {FOOD_CARDS.map((item, i) => (
              <TiltCard key={i}>
                <div className={`p-6 rounded-3xl bg-gradient-to-br ${item.color} shadow-xl text-center`}>
                  {item.isSiuMai ? (
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
            <SpotifyEmbedCard title="Soda Pop" subtitle="Catchy beats! 🎶" emoji="🥤" colorClass="from-cyan-400 to-blue-500" trackId="02sy7FAs8dkDNYsHp4Ul3f" reducedMotion={prefersReducedMotion} />
            <SpotifyEmbedCard title="Golden" subtitle="My favorite! ✨" emoji="⭐" colorClass="from-yellow-400 to-amber-500" trackId="1CPZ5BxNNd0n0nF4Orb9JS" reducedMotion={prefersReducedMotion} />
          </div>
          <div className="flex justify-center gap-3 mt-8">
            <span className={`px-4 py-2 bg-pink-500/30 rounded-full text-sm ${prefersReducedMotion ? '' : 'animate-pulse'}`}>🎧 Loves K-pop</span>
            <span className={`px-4 py-2 bg-purple-500/30 rounded-full text-sm ${prefersReducedMotion ? '' : 'animate-pulse'}`} style={{ animationDelay: '0.5s' }}>🌟 Future star</span>
          </div>
        </div>
      </section></RevealSection>

      {/* MUSIC */}
      <RevealSection><section id="music" className="py-20 px-4 bg-gradient-to-b from-transparent via-purple-800/30 to-transparent">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold text-center mb-4 bg-gradient-to-r from-cyan-300 to-purple-400 bg-clip-text text-transparent">🎵 My Musical Adventure 🎵</h2>
          <p className="text-center text-purple-200 mb-12 text-lg">Click to hear the real instrument samples and open the piano!</p>
          <div className="grid md:grid-cols-3 gap-6 mt-8">
            {MUSIC_CARDS.map((item, i) => (
              <TiltCard key={i}>
                <div className={`p-6 rounded-3xl bg-gradient-to-br ${item.color} text-center shadow-xl group`}>
                  <button
                    type="button"
                    onClick={() => { initAudio(); stopAllSounds(); playSoundClip(item.samplePath, item.isPiano ? 2.2 : 1.8); }}
                    className="w-full cursor-pointer"
                  >
                    <div className="text-6xl mb-4">{item.icon}</div>
                    <h3 className="text-2xl font-bold mb-2">{item.name}</h3>
                    <p className="text-white/80 mb-3">{item.desc}</p>
                    <span className="px-4 py-1 bg-white/20 rounded-full text-sm">{item.status}</span>
                    <p className="text-xs mt-2 text-white/50">🎵 Click to hear the real sample!</p>
                  </button>
                  {item.isPiano && (
                    <button
                      type="button"
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
                <div className={`w-8 h-12 rounded ${item.color} ${item.active ? 'ring-4 ring-white scale-125 shadow-lg shadow-white/40' : item.next ? `opacity-70 ring-2 ring-yellow-300/50 ${prefersReducedMotion ? '' : 'animate-pulse'}` : 'opacity-30'} transition-all`} />
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
                <button
                  type="button"
                  className="w-full p-6 rounded-3xl bg-gradient-to-br from-red-600 to-orange-700 text-center shadow-lg cursor-pointer hover:scale-105 transition"
                  onClick={() => { initAudio(); playNote(100, 0.3, item.sound); }}
                >
                  <div className="text-5xl mb-3">{item.icon}</div>
                  <h3 className="text-xl font-bold">{item.move}</h3>
                  <p className="text-white/80">{item.desc}</p>
                  <p className="text-xs mt-2 text-white/50">🔊 Click for sound!</p>
                </button>
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
              { name: 'Pikachu', file: 'pikachu.webp', type: 'Electric', color: 'from-yellow-300 to-yellow-500' },
              { name: 'Charmander', file: 'charmander.webp', type: 'Fire', color: 'from-orange-400 to-red-500' },
              { name: 'Squirtle', file: 'squirtle.webp', type: 'Water', color: 'from-blue-400 to-blue-600' },
              { name: 'Bulbasaur', file: 'bulbasaur.webp', type: 'Grass', color: 'from-green-400 to-green-600' },
              { name: 'Eevee', file: 'eevee.webp', type: 'Normal', color: 'from-amber-400 to-orange-500' },
              { name: 'Jigglypuff', file: 'jigglypuff.webp', type: 'Fairy', color: 'from-pink-300 to-pink-500' },
              { name: 'Charizard', file: 'charizard.webp', type: 'Fire/Flying', color: 'from-red-500 to-orange-600' },
              { name: 'Mewtwo', file: 'mewtwo.webp', type: 'Psychic', color: 'from-purple-400 to-purple-600' },
            ].map((item, i) => (
              <TiltCard key={i}>
                <button
                  type="button"
                  className={`w-full p-4 rounded-2xl bg-gradient-to-br ${item.color} shadow-lg cursor-pointer group`}
                  onClick={(e) => triggerPokeEffect(item.type, e, item.name)}
                >
                  <div className="relative w-full aspect-square mb-2">
                    <Image src={`/images/pokemon/${item.file}`} alt={item.name} fill sizes="(max-width: 768px) 44vw, 220px" quality={70} className="object-contain drop-shadow-xl group-hover:scale-110 transition-transform" />
                  </div>
                  <div className="text-center">
                    <div className="font-bold">{item.name}</div>
                    <div className="text-xs opacity-80">{item.type} · Tap to hear!</div>
                  </div>
                </button>
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
                <Image src="/images/goldfish-artwork.jpg" alt="Jayden's Space Art" width={400} height={400} sizes="(max-width: 768px) 88vw, 400px" quality={78} className="w-full h-auto" />
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
                <button
                  type="button"
                  className="w-[calc(50vw-2rem)] md:w-56 p-4 rounded-2xl bg-gradient-to-br from-red-600/30 to-blue-800/30 backdrop-blur shadow-xl cursor-pointer group relative overflow-hidden"
                  onClick={() => { initAudio(); playSoundClip(item.sound, 5); }}
                >
                  <div className="relative w-full aspect-square">
                    <Image src={`/images/spiderman/spiderman_${item.id}.webp`} alt={item.name} fill sizes="(max-width: 768px) 42vw, 224px" quality={70} className="object-contain drop-shadow-2xl group-hover:scale-110 transition-transform" />
                  </div>
                  <p className="text-center text-sm font-bold mt-2 text-white/80">{item.name}</p>
                  <p className="text-center text-xs text-white/50 mt-1">{item.quote} Tap to hear!</p>
                  <div className="absolute inset-0 bg-gradient-to-t from-red-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl pointer-events-none" />
                </button>
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
            <VirtualPikachu reducedMotion={prefersReducedMotion} />
          </div>
        </div>
      </section></RevealSection>

      {/* MINI GAMES */}
      <RevealSection><section id="games" className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold text-center mb-12 bg-gradient-to-r from-green-300 to-cyan-400 bg-clip-text text-transparent">🎮 Mini Games 🎮</h2>
          <div className="grid lg:grid-cols-2 gap-8">
            <div className="bg-white/10 backdrop-blur rounded-3xl p-6"><h3 className="text-2xl font-bold text-center mb-4">🧠 Memory Match</h3><LazyMount placeholder={<SectionLoader label="Memory game ready below..." />}><MemoryGame /></LazyMount></div>
            <div className="bg-white/10 backdrop-blur rounded-3xl p-6"><h3 className="text-2xl font-bold text-center mb-4">⭐ Catch the Stars</h3><LazyMount placeholder={<SectionLoader label="Star game ready below..." />}><StarCatchGame /></LazyMount></div>
            <div className="bg-white/10 backdrop-blur rounded-3xl p-6"><h3 className="text-2xl font-bold text-center mb-4">🕷️ Spider-Man Web Shooter</h3><LazyMount placeholder={<SectionLoader label="Web shooter ready below..." />}><SpiderManWebGame playNote={playNote} initAudio={initAudio} /></LazyMount></div>
            <div className="bg-white/10 backdrop-blur rounded-3xl p-6"><h3 className="text-2xl font-bold text-center mb-4">🐵 Monkey Banana Catch</h3><LazyMount placeholder={<SectionLoader label="Banana catch ready below..." />}><MonkeyBananaGame /></LazyMount></div>
          </div>
        </div>
      </section></RevealSection>

      {/* DRAWING */}
      <RevealSection><section id="art" className="py-20 px-4 bg-gradient-to-b from-transparent via-pink-800/20 to-transparent">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold text-center mb-12 bg-gradient-to-r from-pink-300 to-purple-400 bg-clip-text text-transparent">🎨 Draw Something! 🎨</h2>
          <div className="max-w-xl mx-auto bg-white/10 backdrop-blur rounded-3xl p-6">
            <LazyMount placeholder={<SectionLoader label="Drawing board ready below..." />}><DrawingCanvas /></LazyMount>
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
        <button onClick={() => window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' })} className="mt-6 px-6 py-3 bg-gradient-to-r from-pink-500 to-purple-500 rounded-full text-white font-bold hover:scale-110 transition-all shadow-lg shadow-pink-500/30">
          🚀 Back to Top!
        </button>
      </footer>

      {/* PIANO POPUP */}
      {showPiano && <PianoKeyboard onClose={() => { setShowPiano(false); stopAllSounds(); }} playNote={playNote} initAudio={initAudio} />}

      {/* POKEMON EFFECT */}
      {pokeEffect && <PokemonEffect type={pokeEffect.type} x={pokeEffect.x} y={pokeEffect.y} onDone={() => setPokeEffect(null)} reducedMotion={prefersReducedMotion} />}
    </div>
  );
}
