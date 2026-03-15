# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Jayden's World** — an interactive personal website for a 4-year-old from Hong Kong, built with Next.js 16, React 19, and TypeScript. Features mini-games (Memory Match, Star Catcher, Spider-Man Web Shooter, Monkey Banana), an interactive piano with real instrument samples, a virtual Pikachu pet, a drawing canvas, K-pop dancing section, and animated scroll effects.

## Commands

```bash
npm run dev       # Development server at localhost:3000
npm run build     # Production build (uses webpack: next build --webpack)
npm run start     # Start production server
npm run lint      # ESLint
```

No test framework is configured.

## Architecture

### Monolithic Client Component

The entire app lives in a single file: `src/app/page.tsx` (~1300 lines, `'use client'`). All React components, hooks, game logic, and animations are defined here. The root layout (`src/app/layout.tsx`) only provides metadata, font, and a `window.ethereum` polyfill to prevent third-party script errors.

### Audio System

The `useAudio()` hook at the top of `page.tsx` handles all sound:

- **iOS Safari compatibility**: AudioContext is created lazily and unlocked on first user gesture (`initAudio()`). Must be called synchronously inside a touch/click handler.
- **Sample playback**: Real MP3 samples for piano, clarinet, recorder loaded from `/public/sounds/`. Base frequency for all samples is 261.63 Hz (middle C). Pitch shifting via `playbackRate` to achieve different notes.
- **Synthesized sounds**: Kick, punch, block use Web Audio API oscillators + noise buffers.
- **Key pattern**: `initAudio()` unlocks context, then `playNote(freq, duration, instrument)` plays. Call `initAudio()` on every interaction (it's a no-op after first unlock).

### Key Libraries

| Library | Purpose |
|---------|---------|
| GSAP + ScrollTrigger | Scroll-driven animations |
| Framer Motion | UI animations (floating emojis, transitions) |
| Lenis | Smooth scrolling |
| Three.js + React Three Fiber | 3D graphics |
| Tone.js + Howler.js | Audio (supplements Web Audio API) |
| Zustand | State management (minimal usage) |
| Tailwind CSS v4 | Styling via `@tailwindcss/postcss` |

### CSS & Animations (`src/app/globals.css`)

Custom CSS animations defined as utility classes: `.reveal-section`/`.revealed` (scroll reveal), `.animate-float-up`, `.animate-dance`, `.animate-sparkle`, `.card-glow`, `.text-glow`, `.magnetic-btn`, plus custom scrollbar styling.

### Asset Structure

- `/public/sounds/` — MP3 samples for piano, clarinet, recorder
- `/public/images/spiderman/` — Spider-Man character images
- `/public/images/pokemon/` — Pikachu, Magikarp, Psyduck
- `/public/images/kpop/` — Dance silhouettes
- `/public/images/food/` — Dim sum images

## Key Patterns

- All interactive components use `useState`/`useRef`/`useCallback` — no external state management beyond minimal Zustand
- Animations combine GSAP ScrollTrigger for scroll effects and Framer Motion for component-level animations
- The ethereum polyfill in `layout.tsx` prevents `TypeError` from browser extensions injecting into `window.ethereum`
