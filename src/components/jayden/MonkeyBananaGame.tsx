'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export default function MonkeyBananaGame() {
  const [running, setRunning] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [misses, setMisses] = useState(0);
  const [monkeyX, setMonkeyX] = useState(50);
  const [bananasSnapshot, setBananasSnapshot] = useState<{ id: number; x: number; y: number; speed: number }[]>([]);

  const bananasRef = useRef<{ id: number; x: number; y: number; speed: number }[]>([]);
  const monkeyXRef = useRef(50);
  const monkeyTargetXRef = useRef(50);
  const runningRef = useRef(false);
  const lastFrameRef = useRef(0);
  const spawnTimerRef = useRef(0);
  const rafRef = useRef(0);
  const idRef = useRef(0);
  const scoreRef = useRef(0);
  const missesRef = useRef(0);
  const arenaRef = useRef<HTMLDivElement>(null);
  const draggingPointerIdRef = useRef<number | null>(null);

  const setMonkeyTarget = useCallback((percent: number) => {
    const next = Math.max(8, Math.min(92, percent));
    monkeyTargetXRef.current = next;
    if (!runningRef.current) {
      monkeyXRef.current = next;
      setMonkeyX(next);
    }
  }, []);

  const stopGame = useCallback((finished: boolean) => {
    runningRef.current = false;
    setRunning(false);
    setGameOver(finished);
    setBananasSnapshot([]);
  }, []);

  const gameLoop = useCallback(function gameLoopFrame(timestamp: number) {
    if (!runningRef.current) return;

    if (lastFrameRef.current === 0) {
      lastFrameRef.current = timestamp;
      rafRef.current = requestAnimationFrame(gameLoopFrame);
      return;
    }

    const deltaTime = Math.min((timestamp - lastFrameRef.current) / 1000, 0.1);
    lastFrameRef.current = timestamp;

    const smoothing = Math.min(1, deltaTime * 12);
    monkeyXRef.current += (monkeyTargetXRef.current - monkeyXRef.current) * smoothing;
    setMonkeyX(monkeyXRef.current);

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
    const nextBananas: typeof bananasRef.current = [];

    for (const banana of bananasRef.current) {
      const nextY = banana.y + banana.speed * deltaTime;
      if (nextY >= 72 && nextY <= 95 && Math.abs(banana.x - monkeyXRef.current) <= 16) {
        caught += 1;
      } else if (nextY > 95) {
        dropped += 1;
      } else {
        nextBananas.push({ ...banana, y: nextY });
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
        stopGame(true);
        return;
      }
    }

    setBananasSnapshot([...bananasRef.current]);
    rafRef.current = requestAnimationFrame(gameLoopFrame);
  }, [stopGame]);

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
    monkeyXRef.current = 50;
    monkeyTargetXRef.current = 50;
    setMonkeyX(50);
    setRunning(true);
  }, []);

  const handlePointer = useCallback((clientX: number) => {
    if (!arenaRef.current) return;
    const rect = arenaRef.current.getBoundingClientRect();
    setMonkeyTarget(((clientX - rect.left) / rect.width) * 100);
  }, [setMonkeyTarget]);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    draggingPointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    handlePointer(event.clientX);
  }, [handlePointer]);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse' && draggingPointerIdRef.current !== event.pointerId) return;
    handlePointer(event.clientX);
  }, [handlePointer]);

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (draggingPointerIdRef.current === event.pointerId) {
      draggingPointerIdRef.current = null;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

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
          className="relative h-80 rounded-3xl overflow-hidden border border-white/10 bg-gradient-to-b from-cyan-400 via-green-500 to-green-800 touch-none cursor-ew-resize"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          <div className="absolute inset-x-0 top-3 text-center text-white/80 text-sm font-medium drop-shadow">Move finger or mouse to catch bananas!</div>
          {bananasSnapshot.map(item => (
            <div
              key={item.id}
              className="absolute -translate-x-1/2 text-3xl"
              style={{ left: `${item.x}%`, top: `${item.y}%`, transform: `translateX(-50%) rotate(${(item.x % 30) - 15}deg)` }}
            >
              🍌
            </div>
          ))}
          <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-amber-900/60 via-green-900/30 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-4 bg-green-900/50" />
          <div className="absolute -translate-x-1/2 -translate-y-1/2 text-5xl will-change-transform" style={{ left: `${monkeyX}%`, top: '84%' }}>🐵</div>
        </div>
      )}
      {running && <button onClick={() => stopGame(true)} className="mt-3 px-6 py-2 bg-red-500 rounded-full text-white font-bold">Stop</button>}
    </div>
  );
}
