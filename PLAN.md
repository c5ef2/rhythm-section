# Rhythm Practice App — Implementation Plan

## Context

Greenfield project in `/workspace` (currently just a devcontainer, empty `RhythmSection.iml`, and a hand-drawn `UI mockup.jpeg`). The user wants a browser-based rhythm practice tool. Core value: generate a random rhythm in 4/4 constrained to selected note lengths, display it in standard notation, and let the user loop it against a metronome with an optional audio playback for reference.

Primary outcome: a single-page web app that musicians can use to practice reading and internalising rhythms, with shareable presets via URL so a teacher can send an exercise to a student on another device.

## Stack & tooling

- **SvelteKit + Svelte 5** (runes) with `@sveltejs/adapter-static` — deploys as a static site, no backend needed.
- **Vite** (built into SvelteKit) — dev server and preview bound to port **8473**.
- **GitHub Actions** workflow for automatic build + deploy to GitHub Pages on push to `main`.
- **TypeScript** throughout.
- **VexFlow** (`vexflow` npm) for staff notation + beaming + tuplets + ties.
- **spessasynth_lib** + General User GS SoundFont (lazy-loaded on first audio enable) for drum / fretless bass / metronome sounds.
- **Vitest** for unit tests, **Playwright** for one e2e smoke test. Per user's dev-practices memory: TDD, write failing test first.
- **ESLint + Prettier** (SvelteKit defaults); no Java tooling (Spotless) since this is JS/TS.

## Feature scope (MVP)

From answered questions:

| Area | Decision |
|------|----------|
| Time signature | Fixed 4/4 |
| Bars | 1 or 2 |
| Note lengths | whole, half, quarter, eighth, eighth-triplet, sixteenth + dotted half/quarter/eighth |
| Ties | Yes — notes may cross beat boundaries, rendered as tied pairs |
| Rests | Yes, interleaved with notes |
| Tuplet mixing | Per-beat: each beat is either binary or triplet, never mixed within a beat |
| Metronome | on/off, division (half/quarter/eighth/triplet/sixteenth), emphasize-first-beat toggle |
| Rhythm playback | Default OFF; user toggles on. User picks drum OR fretless bass. |
| Count-in | One bar of metronome before playback start |
| Highlight | Currently playing note highlighted in staff |
| Persistence | localStorage for all settings |
| Share | URL hash encodes settings + seed (deterministic regen on other device) |
| Transport | Play / Pause / Regenerate |

## Directory layout

```
/workspace/
├── package.json
├── svelte.config.js
├── vite.config.ts
├── tsconfig.json
├── playwright.config.ts
├── .github/
│   └── workflows/
│       └── deploy.yml        # build + deploy to GitHub Pages on push to main
├── static/
│   └── soundfont/            # GeneralUserGS (lazy fetch, not bundled into JS)
├── src/
│   ├── app.html
│   ├── routes/+page.svelte   # single page
│   ├── lib/
│   │   ├── rhythm/
│   │   │   ├── types.ts      # NoteLength, RhythmEvent, Bar
│   │   │   ├── generator.ts  # seeded generator
│   │   │   └── generator.test.ts
│   │   ├── audio/
│   │   │   ├── scheduler.ts  # Chris Wilson look-ahead scheduler
│   │   │   ├── synth.ts      # spessasynth_lib wrapper, lazy SF2 load
│   │   │   ├── metronome.ts  # click event builder
│   │   │   └── scheduler.test.ts
│   │   ├── notation/
│   │   │   └── render.ts     # VexFlow render + node-ref map for highlight
│   │   ├── state/
│   │   │   ├── settings.svelte.ts  # Svelte 5 rune state + localStorage sync
│   │   │   └── share.ts            # encode/decode URL hash
│   │   ├── rng/
│   │   │   └── seeded.ts     # mulberry32 PRNG
│   │   └── components/
│   │       ├── Transport.svelte
│   │       ├── SettingsPanel.svelte
│   │       ├── NoteLengthPicker.svelte
│   │       └── Staff.svelte  # mounts VexFlow, drives highlight
└── tests/
    └── smoke.spec.ts         # Playwright
```

## Key design points

### 1. Rhythm generator (`src/lib/rhythm/generator.ts`)

Input:
```ts
{ bars: 1|2, allowedLengths: NoteLength[], allowRests: true, seed: number }
```

Algorithm (per beat, 4 beats × `bars`):
1. Pick beat type based on user's allowed lengths: **triplet** if only triplet-8th is selected for this beat slot, **binary** otherwise. If both triplet and binary lengths are allowed, weight 30/70.
2. Fill the beat:
   - **Binary beat** = 4 sixteenth-slots. Choose partitions from allowed durations that sum to 4 slots (e.g. `[4]=quarter`, `[2,2]=two 8ths`, `[3,1]=dotted-8th+16th`, `[1,1,1,1]=four 16ths`, `[2,1,1]`, etc.). Sample uniformly among legal partitions.
   - **Triplet beat** = 3 triplet-8th slots; always three triplet-8ths (or rests).
3. After filling beats, with configurable probability (hard-coded ~20% for MVP) convert some note events to rests.
4. **Tie pass**: with ~15% probability merge two adjacent notes (if same position modulo binary/triplet) into a single longer tied note. Renderer inserts the tie.
5. Notes longer than one beat (half, whole, dotted) consume multiple consecutive binary beats — chosen first at the bar-level partition step.

Deterministic: seeded mulberry32 PRNG. Same seed + settings ⇒ same bar.

### 2. Audio scheduler (`src/lib/audio/scheduler.ts`)

Chris Wilson look-ahead pattern (well-known reference: `https://web.dev/articles/audio-scheduling`):
- `setInterval(25ms)` runs `scheduleAheadTime = 100ms` of events in advance into a queue.
- Each event has an `audioContext.currentTime + offset` stamp.
- For each scheduled event:
  - **Metronome click** → trigger woodblock/clave sample via SpessaSynth.
  - **Rhythm hit** (if rhythm audio on) → trigger drum or bass note.
  - Append to `ui-events` queue (tagged with rhythm-event index) for rAF highlight loop to consume.
- **Highlight loop**: `requestAnimationFrame` reads `audioContext.currentTime`, pops ui-events whose time ≤ now, sets `currentEventIndex` state → `Staff.svelte` toggles CSS class on VexFlow node.
- **Pause** = stop the scheduler tick, keep `currentEventIndex`, save elapsed. **Resume** re-seeds start time.
- **Count-in** = one bar of metronome-only clicks inserted before the rhythm timeline.

### 3. SpessaSynth integration (`src/lib/audio/synth.ts`)

- Lazy-init on first user click of Play or metronome-on.
- Fetch `GeneralUser GS.sf3` from `static/soundfont/`, pass to worklet.
- Channels:
  - Ch 9 (GM drums): standard kit — kick (36) for rhythm-drum, woodblock (76) for metronome sub-beat, claves (75) for downbeat accent.
  - Ch 0: fretless bass (GM patch 35), fixed pitch E2 (40) for rhythm-bass mode.
- User picks rhythm instrument: drum (kick) vs bass (E2). Metronome always uses woodblock/clave.

### 4. Notation (`src/lib/notation/render.ts`)

- VexFlow `EasyScore` for construction; for triplets use `Tuplet`; for ties use `StaveTie`.
- Expose a `Map<rhythmEventIndex, SVGElement>` so the highlight loop can find the node to re-class. VexFlow `StaveNote.getAttribute('el')` (or `tickable.getSVGElement()` in 5.x) gives the group element.
- Rerender only on regenerate or settings change — highlighting is pure CSS class toggling, no rerender.

### 5. State, persistence, share (`src/lib/state/`)

- `settings.svelte.ts` exposes a single `$state` object. An `$effect` serialises to `localStorage` under key `rhythm-section:v1`.
- On load: read `window.location.hash` first (share takes precedence), else localStorage, else defaults.
- `share.ts`: `encode(settings) → base64url(JSON.stringify(settings))` written to `location.hash`; `decode()` reverse. Seed stored as a plain integer.
- Copy-share button writes `window.location.href` to clipboard.

### 6. UI layout (matches mockup)

```
┌─ Transport bar ─────────────────────────────────────────┐
│  [Play/Pause]  BPM [120▲▼]   Bars [1|2]  [Regenerate]   │
├─ Rhythm ────────────────────────────────────────────────┤
│  Allowed notes: [○][𝅗𝅥][♩][♪][triplet][♬]+dotted   Ties[✓]│
│  Rhythm audio: [off|drum|bass]                          │
├─ Staff (VexFlow) ───────────────────────────────────────┤
│           [ generated bar(s), highlighted note ]        │
├─ Metronome ─────────────────────────────────────────────┤
│  [on/off]  Division [𝅗𝅥|♩|♪|triplet|♬]  Emphasize 1st [✓]│
│  Count-in [✓]                                           │
├─ Share ─────────────────────────────────────────────────┤
│  [Copy share link]                                      │
└─────────────────────────────────────────────────────────┘
```

## Implementation order (TDD, small commits)

Branch: create `feat/rhythm-app` off `main`. Commit after each numbered step below — each commit must leave the tree green (tests pass, app builds). Keep commits small: if a step grows, split it.

1. **Scaffold** — `npm create svelte@latest`, static adapter, TS, Vitest, Playwright. Configure Vite to serve on **port 8473** (`server.port` and `preview.port` in `vite.config.ts`). Commit.
   1a. **GitHub Actions: build + deploy to Pages** — `.github/workflows/deploy.yml` using `actions/configure-pages`, `actions/upload-pages-artifact`, `actions/deploy-pages` on push to `main`. Configure SvelteKit `adapter-static` with `paths.base` derived from repo name (or `BASE_PATH` env set in the workflow) so asset URLs work under `username.github.io/RhythmSection/`. Commit.
2. **Types + seeded RNG** — `rhythm/types.ts`, `rng/seeded.ts` + tests. Commit.
3. **Generator (binary only)** — tests for partition coverage + seed determinism, then impl. Commit.
4. **Generator: add triplet beats, rests, ties**. Commit.
5. **URL encode/decode** — round-trip tests, then impl. Commit.
6. **Settings store + localStorage** — light test of rune state. Commit.
7. **VexFlow render + highlight hooks** — render snapshot test (compare to expected SVG structure for a known seed), no audio yet. Commit.
8. **Web Audio scheduler (metronome only)** — unit-test the event-list builder (pure function); manual browser test for timing. Commit.
9. **SpessaSynth wrapper + soundfont lazy load**. Commit.
10. **Rhythm playback (drum / bass select)**. Commit.
11. **Count-in, pause/resume, regenerate**. Commit.
12. **UI polish: layout per mockup, responsive, keyboard (space = play/pause)**. Commit.
13. **Playwright smoke test**: load page, click play, verify highlight advances, copy share link, open with hash in new page and confirm same rhythm renders. Commit.

## Critical files to create

- `src/lib/rhythm/generator.ts` — hardest correctness problem; TDD here is essential.
- `src/lib/audio/scheduler.ts` — hardest timing problem; keep event list computation pure and testable.
- `src/lib/notation/render.ts` — VexFlow API boundary; most likely source of rendering bugs.
- `src/routes/+page.svelte` — only route.

## Reused libraries / utilities

- `vexflow` — notation.
- `spessasynth_lib` + `spessasynth_core` — synth.
- GeneralUser GS SoundFont (CC BY) — audio bank, hosted under `static/`.
- `mulberry32` PRNG — tiny inline function, no dependency.

## Verification

- **Unit**: `npm run test` — generator is deterministic for fixed seeds; URL round-trips; scheduler builds correct event list for a known rhythm.
- **Manual**:
  1. `npm run dev`, open browser at `http://localhost:8473`.
  2. Set BPM 120, 1 bar, enable eighth + sixteenth + triplet.
  3. Regenerate a few times — check notation renders and beams cleanly.
  4. Metronome on, division = quarter, emphasize first beat — listen for accent on beat 1.
  5. Rhythm audio on → drum → hear kick on each hit; switch to bass → hear E2 with note length.
  6. Click play with count-in on — hear one bar of clicks before highlight starts moving.
  7. Pause mid-bar → resumes from same beat.
  8. Copy share link → open in private window → same settings + same rhythm.
  9. Reload without hash → last settings restored from localStorage.
- **E2E**: Playwright smoke test automates steps 1, 7, 8.

## Open (deferable) items

- Drum-only vs drum+bass layered playback: MVP lets user pick one; layering can come later if desired.
- Mobile layout details: design is single-column so it should work on narrow screens, but will verify on a real phone and adjust as needed.
- Additional time signatures, custom note-length mixes, saved presets list — post-MVP.
