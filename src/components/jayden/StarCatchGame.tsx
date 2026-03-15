'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type StarItem = { id: number; x: number; y: number; size: number; bornAt: number; fading: boolean };

export default function StarCatchGame() {
  const [active, setActive] = useState(false);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(25);
  const [stars, setStars] = useState<StarItem[]>([]);
  const [popups, setPopups] = useState<{ id: number; x: number; y: number }[]>([]);
  const starId = useRef(0);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const addTimeout = useCallback((fn: () => void, ms: number) => {
    const timeout = setTimeout(fn, ms);
    timeoutsRef.current.push(timeout);
    return timeout;
  }, []);

  const clearAllTimeouts = useCallback(() => {
    timeoutsRef.current.forEach(timeout => clearTimeout(timeout));
    timeoutsRef.current = [];
  }, []);

  const removeStar = useCallback((id: number) => {
    setStars(previous => previous.filter(star => star.id !== id));
  }, []);

  const catchStar = useCallback((id: number, x: number, y: number) => {
    setScore(previous => previous + 1);
    setStars(previous => previous.filter(star => star.id !== id));
    const popupId = Date.now() + Math.random();
    setPopups(previous => [...previous, { id: popupId, x, y }]);
    addTimeout(() => {
      setPopups(previous => previous.filter(popup => popup.id !== popupId));
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
    setStars(previous => {
      if (previous.length >= 3) return previous;
      return [...previous, nextStar];
    });
    addTimeout(() => {
      setStars(previous => previous.map(star => (star.id === id ? { ...star, fading: true } : star)));
    }, 1800);
    addTimeout(() => removeStar(id), 2500);
  }, [removeStar, addTimeout]);

  useEffect(() => {
    if (!active) return;
    spawnStar();
    const timer = setInterval(() => {
      setTimeLeft(previous => {
        if (previous <= 1) {
          setActive(false);
          return 0;
        }
        return previous - 1;
      });
    }, 1000);
    const starSpawner = setInterval(spawnStar, 1100);
    return () => {
      clearInterval(timer);
      clearInterval(starSpawner);
      clearAllTimeouts();
    };
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
          {stars.map(star => (
            <button
              key={star.id}
              onTouchStart={(event) => { event.preventDefault(); catchStar(star.id, star.x, star.y); }}
              onClick={() => catchStar(star.id, star.x, star.y)}
              className={`absolute rounded-full flex items-center justify-center transition-all duration-500 touch-none ${star.fading ? 'opacity-0 scale-75' : 'opacity-100 scale-100'} animate-pulse`}
              style={{
                left: `${star.x}%`,
                top: `${star.y}%`,
                width: `${star.size}px`,
                height: `${star.size}px`,
                transform: `translate(-50%, -50%) scale(${star.fading ? 0.75 : 1})`,
                background: 'radial-gradient(circle, rgba(255,245,157,0.95) 0%, rgba(255,196,0,0.85) 55%, rgba(255,145,0,0.2) 100%)',
                boxShadow: '0 0 24px rgba(255, 221, 87, 0.6)',
                touchAction: 'manipulation',
              }}
            >
              <span className="text-3xl leading-none">⭐</span>
            </button>
          ))}
          {popups.map(popup => (
            <div
              key={popup.id}
              className="absolute pointer-events-none text-xl font-extrabold text-yellow-200 animate-bounce"
              style={{ left: `${popup.x}%`, top: `${popup.y}%`, transform: 'translate(-50%, -130%)', textShadow: '0 0 8px rgba(255,200,0,0.8)' }}
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
