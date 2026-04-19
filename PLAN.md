# Rhythm Section — Requirements & Design Reference

Browser-based rhythm practice app. A generated rhythm in 4/4 is shown in bass-clef notation and looped against a metronome. The musician reads along; optional audio playback of the rhythm is available for reference. Configurations (and the rhythm seed) are shareable via URL so a teacher can send an exercise to a student on another device.

This document is the living reference for the app's requirements. Keep it in sync whenever behaviour changes.

---

## 1. Stack & infrastructure

- **SvelteKit 2 + Svelte 5 runes**, TypeScript end to end.
- **Vite** dev/preview on port **8473**, binding to `0.0.0.0` so the devcontainer port mapping reaches the browser.
- **@sveltejs/adapter-static**. SSR and prerender are **disabled** for the main page — it renders once client-side so the first paint reflects localStorage. See `src/routes/+page.ts`.
- **GitHub Actions** workflow at `.github/workflows/deploy.yml` builds on push to `main` with `BASE_PATH=/$REPO` and deploys to GitHub Pages.
- **Vitest** for unit tests. Playwright smoke test is on the backlog but not yet implemented.
- **spessasynth_processor.min.js** is copied into `static/` so the AudioWorklet module is served at runtime.

### Dev practices

- TDD: red → green → refactor, write the failing test first.
- Small commits, each self-contained and green. Feature branch off `main`.
- Commit messages focus on the *why*. **No `Co-Authored-By` trailer.**
- `npm run check` and `npm test` both clean before every commit.

---

## 2. Feature inventory

### 2.1 Rhythm generation (`src/lib/rhythm/`)

- Fixed **4/4** time signature.
- **1 or 2 bars** chosen by the user.
- User-selectable note lengths: whole, half, quarter, 8th, 16th, 8th triplet, dotted eighth.
- **Include rests** toggle (≈20 % of events become rests when enabled).
- **Include ties** toggle.
- **Seeded deterministic** output via `mulberry32(seed)`. Regenerate = new seed.
- Triplets and binary never mix **within one beat**. Per-beat choice: triplet if allowed; 30 % weight when both binary and triplet are allowed.
- Generator picks durations only from the user's allowed set. A `canFill` DP table guarantees every pick leaves a remainder that the allowed set can tile — no `forceFit` fallback to sixteenths.
- With **ties off**, picks are capped at the current beat's remaining slots, so no event ever crosses a beat boundary.
- With **ties on**, the generator uses a chain-length cap (see §2.2).
- Long notes that cross beat boundaries are split into per-beat pieces by `splitAtBeatBoundaries` in integer 1/12-of-a-beat units (no floating-point drift across triplets).

### 2.2 Tie chain cap

- A "tied chain" = consecutive events joined by ties (chain length = notes, ties = notes − 1).
- Hard cap: chain length ≤ **3** (at most 2 sequential ties).
- Distribution target: **95 %** of chains are length 2 (one tie), ≤ **5 %** length 3.
- Enforced at pick time: each candidate duration is rejected if placing it would span more beats than the current roll allows.
- Ties come **only** from `splitAtBeatBoundaries`. There is no random tie pass.

### 2.3 Notation (`src/lib/notation/render.ts`, VexFlow 5)

- **No clef.** This is a pure rhythm reader, so the clef space goes to the notes. Each stave row still shows the time signature on the leftmost stave.
- All rhythm notes render on the middle line (`b/4` in VexFlow's default clef) regardless of audio pitch — see §2.7 for the bass audio pitch.
- Every beat is visually self-contained — notes that cross beat boundaries are rendered as tied pieces.
- **Beams flush at absolute beat boundaries.** Beams are built a beat at a time using the absolute unit position, so a beat that starts with a rest doesn't drag the following beam group off the grid. `Beam.generateBeams` still gets to place partial secondary beams for mixed durations (dotted-8 + 16).
- **Triplets** render as a 3-note beam group with a "3" tuplet bracket.
- **Dotted notes** get an explicit dot via `Dot.buildAndAttach`.
- **Ties** are drawn with `StaveTie`. Ties that cross rows (when 2 bars stack vertically) render as **two half-ties** — one trailing off the right of row 1, one leading into the left of row 2 — instead of a diagonal line.
- Beams + tuplets are constructed **before** `voice.draw()`. Otherwise notes render with their flags still visible and each note has both a flag *and* a beam.

### 2.4 Layout (responsive)

- The `Staff` component observes its container with `ResizeObserver` and passes the available width into `renderRhythm`.
- On **wide** viewports, bars render side-by-side.
- **Below ~520 px** and with 2 bars, each bar renders on its **own row** with its own clef + time signature.
- The renderer scales each bar proportionally if the row's natural width exceeds the budget (with a floor so notes stay legible).

### 2.5 Playback

- **BPM snapping**: only the classic Maelzel notches 40–208. The BPM control is a − / value / + stepper; typed/shared values that land off-notch are snapped on load.
- **Play / Pause**, **Regenerate** (new seed), **Share link**. The player **always loops** (seamless restart anchored to the exact cycle end); there is no loop toggle.
- **Count-in** toggle adds one bar of metronome clicks before the rhythm starts (count-in applies only to the first cycle when looping).
- **Loop restart is anchored to the exact cycle end** (`startTime + bars × secPerBar`), not to the last scheduled event's start time, so tempo never rushes between repetitions.
- **Settings apply immediately during playback.** An effect watches the playback-affecting fields; any change tears down the current scheduler and starts a new one in place.
- **Space bar** toggles play/pause when focus is not in an input.
- **Keeps the screen awake** while playing via the Screen Wake Lock API (re-acquires when the tab becomes visible again). Unsupported browsers silently no-op.

### 2.6 Metronome

- On/off toggle.
- **Divisions**: half, quarter, 8th, triplet, 16th (shown as note-icon buttons).
- **Emphasize first beat** toggle; downbeat uses claves / higher oscillator blip, other on-beats use woodblock / mid blip, sub-beats are quieter.
- **Counted beats**: 1 / 2 / 3 / 4 toggle buttons pick which beats click. When division is finer than a quarter (eighths / triplets / sixteenths), every sub-click within a counted beat still fires — counting just beat 1 at eighth division gives two clicks at the start of the bar, not one. At least one beat must stay counted.
- **Count-in** toggle adds one bar of metronome clicks before the rhythm starts (count-in applies only to the first cycle when looping). Lives in the metronome section alongside the other metronome behaviours.

### 2.7 Rhythm audio

- Default **off**; user toggles on per session (persisted).
- **Instrument**: drum (kick) *or* bass (fretless bass at A1).
- When the user loads a `.sf2` / `.sf3` / `.dls` file, the Player swaps from the oscillator synth to a SpessaSynth `WorkletSynthesizer`:
  - Drum = GM kick drum (ch 9, note 36), metronome uses woodblock (76) / claves (75) on the same drum channel.
  - Bass = GM fretless bass (ch 0, program 35), pitched MIDI 33 (A1).
- With **no** SoundFont loaded, the oscillator fallback is used:
  - Kick = sine sweep 180→60 Hz *plus* a bandpassed noise transient around 1.5 kHz so it remains audible on phone speakers.
  - Bass = sawtooth at 55 Hz (A1) layered with 110 Hz second harmonic, low-passed — again so phone speakers can actually produce it.
  - Click = square oscillator blip with different pitches per emphasis.
- Rhythm hits are scheduled **only on the first note of each tied group** (prev tied → skip). Audible duration of a bass note is the sum of the tied group.

### 2.8 Scheduler (`src/lib/audio/scheduler.ts`)

- Chris Wilson look-ahead pattern: `setInterval(25 ms)` schedules events 100 ms ahead.
- `buildEventList` is a **pure** function: `{ metronome clicks, rhythm hits, highlight markers }` sorted by time. Pure → easy to test, no mocks needed.
- Highlight dispatch is a **requestAnimationFrame loop** that reads `ctx.currentTime` directly and picks the last highlight whose time ≤ now. Never uses `setTimeout` for highlight timing (would drift away from the audio clock).

### 2.9 State & actions (`src/lib/state/`)

- `appState` is a class with `$state` fields exported as a module singleton. One source of truth: settings, isPlaying, activeIndex, soundFontStatus, soundFontName. `rhythm` is `$derived` from settings.
- Every user intent is a named function in `actions.svelte.ts`. Components only read `appState` and call actions.
- `Player` owns AudioContext + Synth + Scheduler + WakeLock. Stateless w.r.t. settings: `run(inputs)` always tears down any existing scheduler and starts fresh.
- Settings are persisted to `localStorage` under `rhythm-section:v1`. Loads are **merged with `DEFAULT_SETTINGS`** so a payload from an older schema (missing e.g. `rhythmAudio`, `loop`) fills in defaults instead of silently turning features off.

### 2.10 Share URL

- Format: `#s=<base64url(JSON(SharedState))>`.
- Encodes every setting + the rhythm seed, so the recipient sees the exact same exercise.
- Decode is shape-validated; missing `rhythmAudio` defaults to `false`, legacy `loop` field is ignored, missing `metronome.countedBeats` defaults to `[true, true, true, true]`.
- The **Share button** (icon-only, top-right in the header) uses `navigator.share()` when supported (opens the native share sheet on mobile). Falls back to copying the URL to the clipboard.

### 2.11 Theme

- **Follows the system** via `@media (prefers-color-scheme: light | dark)`. No manual toggle — the CSS variables flip live when the OS setting changes.
- All colours live as CSS custom properties in `src/app.css` under `:root` (dark defaults) and `@media (prefers-color-scheme: light) :root` (light overrides).
- Staff card stays light in both themes (music paper convention); VexFlow's default black strokes are readable against it regardless.
- `<meta name="theme-color">` has two entries gated by `media="(prefers-color-scheme: ...)"` so iOS status bar / Android chrome match the active theme.

### 2.12 Mobile UX

- Viewport meta: `viewport-fit=cover` and safe-area insets respected in CSS.
- PWA-capable meta tags (`theme-color`, `apple-mobile-web-app-capable`).
- **44 px** minimum tap-target on every interactive control. `touch-action: manipulation` and no tap-highlight flash.
- Transport stacks vertically: Play, then Regenerate + Loop, then BPM + Bars, then Copy link. Each row uses the full width.
- Selected buttons inside `.group` keep the bright gradient background (scoped `aria-pressed` override, because Svelte's style scoping otherwise wins over the global pressed rule).
- Note-length picker and division buttons are icon-only (SVG via `NoteIcon`).

---

## 3. Module map

```
src/
├── app.css                            global tokens + button/input defaults
├── app.html                           viewport / PWA meta
├── routes/
│   ├── +layout.svelte                 imports app.css
│   ├── +page.ts                       ssr = false; prerender = false
│   └── +page.svelte                   view + one effect that calls
│                                      restartIfPlaying on state change
├── lib/
│   ├── rhythm/
│   │   ├── types.ts                   NoteLength, RhythmEvent, ...
│   │   ├── generator.ts               seeded generator + splitAtBeatBoundaries
│   │   └── generator.test.ts
│   ├── rng/
│   │   ├── seeded.ts                  mulberry32 + randomSeed
│   │   └── seeded.test.ts
│   ├── notation/
│   │   └── render.ts                  VexFlow renderer + per-beat beaming +
│   │                                  cross-row half-ties + ResizeObserver fit
│   ├── audio/
│   │   ├── events.ts                  pure buildEventList
│   │   ├── events.test.ts
│   │   ├── scheduler.ts               look-ahead scheduler + rAF highlight
│   │   ├── synth.ts                   oscillator fallback Synth
│   │   ├── soundfont-synth.ts         SpessaSynth-backed Synth
│   │   ├── player.ts                  Player: ctx + synth + scheduler + wake
│   │   ├── wake-lock.ts               Screen Wake Lock API wrapper
│   │   ├── bpm.ts                     Maelzel table + snap / step
│   │   └── bpm.test.ts
│   ├── state/
│   │   ├── settings.ts                DEFAULT_SETTINGS + load/save
│   │   ├── settings.svelte.ts         readInitialSettings / persist
│   │   ├── share.ts                   base64url codec + shape validation
│   │   ├── share.test.ts
│   │   ├── app-state.svelte.ts        class with $state fields (singleton)
│   │   └── actions.svelte.ts          every user intent; owns the Player
│   └── components/
│       ├── Staff.svelte               mounts VexFlow + ResizeObserver
│       ├── NoteIcon.svelte            centered SVG for each note length
│       └── NoteLengthPicker.svelte
└── static/
    ├── soundfont/                     (not committed; users upload sf2/sf3)
    └── spessasynth_processor.min.js   AudioWorklet processor copied from lib
```

---

## 4. Invariants worth tests

These are covered today; if any regresses, the spec broke:

- **RNG** is deterministic per seed; returns values in [0, 1).
- **Generator**
  - Produces exactly `bars × 4` beats of content.
  - Never emits a length the user didn't select.
  - Respects allowed-set fidelity even under awkward partitions (quarter + 16th only, etc.).
  - With `allowTies=false`, no event ever crosses a beat boundary and no chain exists.
  - With `allowTies=true`, no chain exceeds 3 events and the length-3 fraction stays well under the 5 % ceiling across many seeds.
  - Emits triplets only in exact groups of 3 per beat.
- **Share codec** round-trips, rejects malformed input, URL-safe charset.
- **Settings** load merges with defaults; hash takes precedence over localStorage; invalid JSON falls back to defaults.
- **Audio event list** — correct click count per division, correct emphasis tagging, count-in shifts rhythm/highlights without skipping metronome, drum hits only once per tied group, highlight event exists for every rhythm event.
- **BPM** snaps to a Maelzel notch; step up/down clamps at 40 / 208.

---

## 5. Extending the app

Before adding a feature, check:

1. Does it fit the existing **settings → actions → Player** flow, or does it need new state?
2. Does it need to **survive reload**? If yes, it goes in `Settings` (with a default) — remember `loadFromStorage` merges with defaults, so existing users auto-migrate.
3. Does it need to **travel in a share link**? If yes, add it to `SharedState` and `isSharedState` validation, plus a default for old payloads in `decodeShare`.
4. Does it affect **playback**? Add the field to the dependency list in the page's `restartIfPlaying` effect.
5. Does it change **visual notation** or audio timing? Write the test first (`generator.test.ts` or `events.test.ts`) before touching the renderer / scheduler.
6. Mobile: does it add a control? Target **44 px** minimum and verify the transport still stacks cleanly under 520 px.

---

## 6. Known deferred items

- Playwright e2e smoke test (step 13 of the original plan).
- A built-in / bundled SoundFont — currently users upload their own because we don't ship a 30 MB General MIDI bank.
- True pause/resume from mid-bar position (today Pause == Stop; Play restarts from the top of the cycle).

---

## 7. Verification checklist (manual)

On every non-trivial change:

1. `npm run dev` → open `http://localhost:8473/` (or the device's network URL).
2. Unit tests: `npm test` — must pass.
3. Type-check: `npm run check` — must be clean.
4. Build: `npm run build` — static output under `build/`.
5. In the browser:
   - Regenerate several times at 1 bar and 2 bars; notation stays clean and beats are visually separated.
   - Toggle every setting during playback and confirm the loop restarts cleanly at the correct tempo.
   - Set BPM via steppers, confirm only Maelzel notches appear.
   - Load a `.sf3` SoundFont; rhythm audio switches to sampled drums / bass.
   - Copy share link, paste in a private window; the same rhythm appears.
   - Reload without a hash; previous session's settings load without a visible flash.
   - On a phone-width viewport or real phone: page never scrolls horizontally, transport buttons are all tappable, 2-bar view stacks and shows half-ties at the row edges, screen stays awake while playing.
