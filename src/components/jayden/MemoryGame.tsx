'use client';

import { useCallback, useState } from 'react';

const MEMORY_EMOJIS = ['🕷️', '⚡', '🎵', '🥋', '⭐', '🎨', '🎮', '🍕'];

export default function MemoryGame() {
  const createCards = useCallback(() => (
    [...MEMORY_EMOJIS, ...MEMORY_EMOJIS]
      .sort(() => Math.random() - 0.5)
      .map((emoji, index) => ({ id: index, emoji, matched: false }))
  ), []);

  const [cards, setCards] = useState<{ id: number; emoji: string; matched: boolean }[]>(() => createCards());
  const [selected, setSelected] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [locked, setLocked] = useState(false);

  const initCards = useCallback(() => {
    setCards(createCards());
    setSelected([]);
    setMoves(0);
    setLocked(false);
  }, [createCards]);

  const flip = useCallback((index: number) => {
    if (locked || selected.length >= 2 || cards[index].matched || selected.includes(index)) return;

    const nextSelected = [...selected, index];
    setSelected(nextSelected);

    if (nextSelected.length !== 2) return;

    setMoves(previous => previous + 1);
    setLocked(true);
    const [first, second] = nextSelected;
    if (cards[first].emoji === cards[second].emoji) {
      setCards(currentCards => currentCards.map((card, currentIndex) => (
        currentIndex === first || currentIndex === second ? { ...card, matched: true } : card
      )));
      setSelected([]);
      setLocked(false);
      return;
    }

    window.setTimeout(() => {
      setSelected([]);
      setLocked(false);
    }, 800);
  }, [locked, selected, cards]);

  const won = cards.length > 0 && cards.every(card => card.matched);

  return (
    <div className="text-center">
      <div className="mb-3 flex items-center justify-center gap-4">
        <span className="text-lg font-bold text-yellow-300">Moves: {moves}</span>
        <button onClick={initCards} className="px-3 py-1 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-semibold transition-colors">
          Restart
        </button>
      </div>
      <div className="grid grid-cols-4 gap-3 max-w-sm mx-auto">
        {cards.map((card, index) => (
          <button
            key={card.id}
            onClick={() => flip(index)}
            className={`aspect-square rounded-xl text-3xl transition-all ${
              card.matched
                ? 'bg-green-500/40 ring-2 ring-green-400 scale-90'
                : selected.includes(index)
                  ? 'bg-purple-500 border-2 border-purple-300 scale-105'
                  : 'bg-indigo-600 hover:bg-indigo-500 hover:scale-105'
            }`}
          >
            {card.matched || selected.includes(index) ? card.emoji : '❓'}
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
