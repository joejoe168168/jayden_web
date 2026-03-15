'use client';

export type InstrumentName = 'piano' | 'clarinet' | 'recorder' | 'kick' | 'punch' | 'block';

export type PianoKey = {
  note: string;
  freq: number;
  white: boolean;
  black: boolean;
  whiteIndex: number;
};

export type PlayNoteFn = (freq: number, duration: number, instrument?: InstrumentName) => void;
