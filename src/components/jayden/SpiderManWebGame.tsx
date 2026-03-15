'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { PlayNoteFn } from './types';

type Props = {
  playNote: PlayNoteFn;
  initAudio: () => void;
};

export default function SpiderManWebGame({ playNote, initAudio }: Props) {
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
    const timeout = setTimeout(fn, ms);
    timeoutsRef.current.push(timeout);
    return timeout;
  }, []);

  const clearAllTimeouts = useCallback(() => {
    timeoutsRef.current.forEach(timeout => clearTimeout(timeout));
    timeoutsRef.current = [];
  }, []);

  const spawnTarget = useCallback(() => {
    idRef.current += 1;
    const targetId = idRef.current;
    const roll = Math.random();
    const isBonus = roll < 0.15;
    const emoji = isBonus ? '💎' : roll < 0.55 ? '🦹' : '🤖';
    const points = isBonus ? 2 : 1;
    setTargets(previous => [...previous.slice(-4), { id: targetId, x: Math.random() * 75 + 10, y: Math.random() * 55 + 15, emoji, points }]);
    addTimeout(() => {
      setTargets(previous => previous.filter(target => target.id !== targetId));
    }, lifetimeRef.current);
  }, [addTimeout]);

  useEffect(() => {
    if (!running) return;
    spawnDelayRef.current = 1200;
    lifetimeRef.current = 2500;

    const timer = setInterval(() => {
      setTimeLeft(previous => {
        if (previous <= 1) {
          setRunning(false);
          return 0;
        }
        return previous - 1;
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
    setScore(previous => previous + points);
    setTargets(previous => previous.filter(target => target.id !== id));
    const splashId = Date.now() + Math.random();
    setSplashes(previous => [...previous, { id: splashId, x, y, text: points >= 2 ? '+2' : '+1' }]);
    addTimeout(() => {
      setSplashes(previous => previous.filter(splash => splash.id !== splashId));
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
              onTouchStart={(event) => { event.preventDefault(); shootWeb(target.id, target.x, target.y, target.points); }}
              onClick={() => shootWeb(target.id, target.x, target.y, target.points)}
              className="absolute -translate-x-1/2 -translate-y-1/2 w-[72px] h-[72px] rounded-full bg-white/15 backdrop-blur flex items-center justify-center text-4xl shadow-xl transition-transform hover:scale-110 active:scale-95 touch-none"
              style={{ left: `${target.x}%`, top: `${target.y}%`, touchAction: 'manipulation' }}
            >
              <span>{target.emoji}</span>
            </button>
          ))}
          {splashes.map(splash => (
            <div key={splash.id} className="absolute pointer-events-none flex flex-col items-center" style={{ left: `${splash.x}%`, top: `${splash.y}%`, transform: 'translate(-50%, -130%)' }}>
              <span className="text-3xl">🕸️</span>
              <span className="text-lg font-extrabold text-cyan-200 animate-bounce" style={{ textShadow: '0 0 8px rgba(0,200,255,0.8)' }}>{splash.text}</span>
            </div>
          ))}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-5xl">🕷️</div>
        </div>
      )}
      {running && <button onClick={stopGame} className="mt-3 px-6 py-2 bg-red-500 rounded-full text-white font-bold">Stop</button>}
    </div>
  );
}
