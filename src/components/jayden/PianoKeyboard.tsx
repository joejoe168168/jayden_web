'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { PianoKey, PlayNoteFn } from './types';

type Props = {
  onClose: () => void;
  playNote: PlayNoteFn;
  initAudio: () => void;
};

export default function PianoKeyboard({ onClose, playNote, initAudio }: Props) {
  const [isPhone, setIsPhone] = useState(false);
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
    const endMidi = 84;
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
  const whiteKeys = allKeys.filter(key => key.white);
  const blackKeys = allKeys.filter(key => key.black);
  const keyWidth = isPhone ? 44 : 40;
  const keyGap = 1;
  const blackWidth = Math.round(keyWidth * 0.58);
  const whiteHeight = isPhone ? 180 : 200;
  const blackHeight = isPhone ? 110 : 125;

  const getBlackKeyLeft = (key: PianoKey) => ((key.whiteIndex + 1) * (keyWidth + keyGap)) - Math.round(blackWidth / 2);

  const pressKey = useCallback((note: string, freq: number, isBlack: boolean) => {
    initAudio();
    playNote(freq, isBlack ? 0.5 : 0.6, 'piano');
    setActiveKeys(prev => new Set(prev).add(note));
    window.setTimeout(() => {
      setActiveKeys(prev => {
        const next = new Set(prev);
        next.delete(note);
        return next;
      });
    }, 200);
  }, [initAudio, playNote]);

  const keyboardMap = useRef<Record<string, { note: string; freq: number; isBlack: boolean }>>({});
  useEffect(() => {
    const map: Record<string, { note: string; freq: number; isBlack: boolean }> = {};
    const whiteRow = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', "'"];
    const blackRow = ['w', 'e', '', 't', 'y', 'u', '', 'o', 'p'];
    const c4Keys = allKeys.filter(key => {
      const midi = Math.round(12 * Math.log2(key.freq / 440) + 69);
      return midi >= 60 && midi <= 76;
    });
    const c4White = c4Keys.filter(key => key.white);
    const c4Black = c4Keys.filter(key => key.black);
    c4White.forEach((key, index) => {
      if (whiteRow[index]) map[whiteRow[index]] = { note: key.note, freq: key.freq, isBlack: false };
    });
    c4Black.forEach((key, index) => {
      if (blackRow[index]) map[blackRow[index]] = { note: key.note, freq: key.freq, isBlack: true };
    });
    keyboardMap.current = map;
  }, [allKeys]);

  useEffect(() => {
    const pressed = new Set<string>();
    const down = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const key = event.key.toLowerCase();
      if (key === 'escape') {
        onClose();
        return;
      }
      const mapping = keyboardMap.current[key];
      if (mapping && !pressed.has(key)) {
        pressed.add(key);
        pressKey(mapping.note, mapping.freq, mapping.isBlack);
      }
    };
    const up = (event: KeyboardEvent) => {
      pressed.delete(event.key.toLowerCase());
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [pressKey, onClose]);

  useEffect(() => {
    if (!scrollRef.current) return;
    const container = scrollRef.current;
    container.scrollLeft = (container.scrollWidth - container.clientWidth) / 2;
  }, [isPhone]);

  const pianoWidth = whiteKeys.length * (keyWidth + keyGap);
  const getNoteLetter = (note: string) => note.replace(/[0-9]/g, '');
  const getNoteOctave = (note: string) => note.replace(/[^0-9]/g, '');

  return (
    <div className="fixed inset-0 z-[9000] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md" onClick={onClose}>
      <div className="bg-gradient-to-b from-gray-900 via-gray-850 to-gray-950 rounded-t-3xl sm:rounded-3xl p-4 pb-8 sm:pb-5 shadow-2xl w-full max-w-5xl border border-white/10" onClick={event => event.stopPropagation()}>
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-xl font-bold text-white">🎹 Virtual Piano</h3>
          <button onClick={onClose} className="text-white/60 hover:text-white text-2xl px-3 hover:rotate-90 transition-transform">✕</button>
        </div>
        <div className="flex justify-center mb-4">
          <div className="px-4 py-1.5 rounded-full bg-white/10 text-white/80 text-sm font-medium border border-white/10">
            Piano sound enabled for reliable playback
          </div>
        </div>
        <div ref={scrollRef} className="overflow-x-auto pb-2 scrollbar-thin" style={{ scrollbarWidth: 'thin' }}>
          <div className="relative flex select-none" style={{ width: `${pianoWidth}px`, minWidth: `${pianoWidth}px` }}>
            {whiteKeys.map(key => {
              const isActive = activeKeys.has(key.note);
              const letter = getNoteLetter(key.note);
              const octave = getNoteOctave(key.note);
              const isC = letter === 'C';

              return (
                <button
                  key={key.note}
                  onTouchStart={(event) => { event.preventDefault(); pressKey(key.note, key.freq, false); }}
                  onMouseDown={() => pressKey(key.note, key.freq, false)}
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
            {blackKeys.map(key => {
              const isActive = activeKeys.has(key.note);
              return (
                <button
                  key={key.note}
                  onTouchStart={(event) => { event.preventDefault(); pressKey(key.note, key.freq, true); }}
                  onMouseDown={() => pressKey(key.note, key.freq, true)}
                  className={`absolute rounded-b-lg transition-all duration-75 z-10 ${
                    isActive
                      ? 'bg-gradient-to-b from-purple-600 to-purple-800 shadow-inner scale-[0.97]'
                      : 'bg-gradient-to-b from-gray-600 via-gray-800 to-black hover:from-gray-500 hover:to-gray-900 shadow-lg'
                  }`}
                  style={{
                    width: `${blackWidth}px`,
                    height: `${blackHeight}px`,
                    left: `${getBlackKeyLeft(key)}px`,
                  }}
                />
              );
            })}
          </div>
        </div>
        <div className="flex justify-between items-center mt-3 px-1">
          <p className="text-white/30 text-xs">{isPhone ? 'Swipe to scroll · Tap to play' : 'Use keyboard: A-L for white keys, W-P for sharps'}</p>
          <p className="text-white/30 text-xs">{isPhone ? '2 octaves: C4 → C6' : '3 octaves: C3 → C6'} 🎵</p>
        </div>
      </div>
    </div>
  );
}
