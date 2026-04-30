# Rhythm Section — Requirements & Design Reference

Browser-based rhythm practice app. A generated rhythm in 4/4 is shown in notation (no clef) and looped against a configurable metronome. The musician reads along; optional audio playback of the rhythm is available for reference. Configuration + the rhythm seed are shareable via URL so a teacher can send the same exercise to a student on another device.

This document is the living reference for the app. Keep it in sync whenever behaviour changes — when you sit at a fresh machine, this should be enough to orient yourself, run the app, find any feature, and extend it.

---

## 0. Quick start

```sh
git clone <repo> && cd rhythm-section
npm install
npm run dev          # http://localhost:8473/  (binds to 0.0.0.0)
```

The dev server is reachable from a phone on the same network: open `http://<host>:8473/`.

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server on port 8473, host: 0.0.0.0 |
| `npm run build` | Static build into `build/`. Reads `BASE_PATH` env (used by GitHub Pages deploy). |
| `npm run preview` | Serve the production build on port 8473 |
| `npm run check` | `svelte-check` over the whole tree |
| `npm run check:watch` | … in watch mode |
| `npm run test` | Vitest run-once |
| `npm run test:watch` | Vitest in watch mode |
| `npm run icons` | Rasterise `src/lib/assets/favicon.svg` into the four launcher PNGs in `static/`. Run after editing the favicon. |
| `npm run soundfont` | Re-build `static/rhythm.sf3` from SpessaSynth's GeneralUserGS (cached under `.cache/`). Run when changing the SoundFont filter or the source URL. |

The repo also ships a devcontainer (`.devcontainer/`) with the right Node version and host networking pre-configured.

---

## 1. Stack & infrastructure

- **SvelteKit 2 + Svelte 5 runes**, TypeScript end to end.
- **Vite** dev/preview on port **8473**, binding to `0.0.0.0` so the devcontainer port mapping reaches the browser.
- **`@sveltejs/adapter-static`** with `fallback: 'index.html'`. SSR + prerender are **disabled** for the page (`src/routes/+page.ts`) — it renders once client-side so the first paint already reflects localStorage. No flash of default values.
- **`paths.base` is read from `BASE_PATH` env at build time** so the build also works under a GitHub Pages project subpath (`/<repo>/`).
- **GitHub Actions** workflow at `.github/workflows/deploy.yml` builds on push to `main` (with `BASE_PATH=/<repo-name>`) and deploys to GitHub Pages. The build outputs everything in `build/`, including the precached SoundFont.
- **Vitest** for unit tests. No Playwright / e2e — out of scope.
- **Service worker** at `src/service-worker.ts`. SvelteKit auto-registers it when present; precaches `$service-worker`'s `build` + `files`.
- **`spessasynth_processor.min.js`** is committed into `static/` so the `WorkletSynthesizer` can `addModule` it at runtime.
- **`static/rhythm.sf3`** is the trimmed bundled SoundFont (≈770 KB). Committed.

### Dev practices

- TDD where it pays: red → green → refactor for the generator, the audio event list, the share codec, BPM snap, the settings codec.
- Small commits, each self-contained and green. Feature branch off `main`, fast-forward merge once green.
- Commit messages focus on the *why*. **No `Co-Authored-By` trailer.**
- `npm run check` and `npm run test` both clean before every commit.

---

## 2. Repo / module map

```
.
├── PLAN.md                              this file
├── README.md                            user-facing intro
├── prompt.md                            local task list (gitignored)
├── package.json
├── svelte.config.js                     adapter-static + base from $BASE_PATH
├── vite.config.ts                       host:true, port 8473 (dev + preview)
├── tsconfig.json
├── .devcontainer/                       containerised dev env
├── .github/workflows/deploy.yml         build & publish to GitHub Pages
├── scripts/
│   ├── generate-icons.mjs               favicon.svg → 192/512/maskable + apple-touch
│   └── build-soundfont.mjs              GeneralUserGS → trimmed rhythm.sf3
├── static/
│   ├── rhythm.sf3                       trimmed SoundFont (kit + fretless bass)
│   ├── spessasynth_processor.min.js     audio-worklet processor
│   ├── manifest.webmanifest             PWA manifest
│   ├── icon-192.png / icon-512.png / icon-maskable.png / apple-touch-icon.png
│   ├── favicon.ico                      legacy
│   └── robots.txt
├── src/
│   ├── app.html                         viewport, theme-color, manifest link, …
│   ├── app.css                          design tokens + base button/input styles
│   ├── service-worker.ts                offline shell + precache
│   ├── routes/
│   │   ├── +layout.svelte               imports app.css
│   │   ├── +page.ts                     export const ssr = false; prerender = false
│   │   └── +page.svelte                 view + a handful of $effects
│   └── lib/
│       ├── assets/favicon.svg           single source for every icon
│       ├── service-worker-client.ts     reloadOnNewServiceWorker()
│       ├── rhythm/
│       │   ├── types.ts                 NoteLength, RhythmEvent, MetronomeOptions, GeneratorOptions
│       │   ├── generator.ts             seeded generator + splitAtBeatBoundaries
│       │   ├── generator.test.ts
│       │   └── types.test.ts
│       ├── rng/
│       │   ├── seeded.ts                mulberry32 + randomSeed
│       │   └── seeded.test.ts
│       ├── notation/
│       │   ├── render.ts                VexFlow renderer (per-beat beaming, half-ties, ResizeObserver fit, highlight table)
│       │   └── share-image.ts           captureStaffImage + updateOgImage
│       ├── audio/
│       │   ├── events.ts                pure buildEventList
│       │   ├── events.test.ts
│       │   ├── scheduler.ts             Chris Wilson look-ahead + rAF highlight + seamless loop;
│       │   │                            also exports the Synth interface
│       │   ├── soundfont-synth.ts       SpessaSynth-backed Synth + fetchBundledSoundFont
│       │   ├── ios-audio.ts             configureIosPlayback (audioSession) + primeIosPlayback (silent <audio>)
│       │   ├── wake-lock.ts             Screen Wake Lock API wrapper
│       │   ├── player.ts                Player owns ctx, synth, scheduler, wake lock, soundfont preload
│       │   ├── bpm.ts                   Maelzel notch table + snap/step
│       │   └── bpm.test.ts
│       ├── state/
│       │   ├── settings.ts              DEFAULT_SETTINGS, loadSettings, saveSettings (pure, testable)
│       │   ├── settings.svelte.ts       readInitialSettings + persist (browser-side glue)
│       │   ├── settings.test.ts
│       │   ├── share.ts                 base64url codec + isSharedState validator
│       │   ├── share.test.ts
│       │   ├── app-state.svelte.ts      AppState class (singleton, $state + $derived)
│       │   ├── environment.svelte.ts    isStandalone + hasShareApi reactive flags
│       │   └── actions.svelte.ts        every user intent; owns the Player singleton
│       └── components/
│           ├── Staff.svelte             ResizeObserver wrapper around renderRhythm
│           ├── NoteIcon.svelte          centred SVG glyph for each NoteLength
│           └── NoteLengthPicker.svelte  toggle group of NoteIcons
```

---

## 3. Feature inventory

### 3.1 Rhythm generation (`src/lib/rhythm/`)

- Fixed **4/4** time signature.
- **1 or 2 bars** chosen by the user.
- User-selectable note lengths: whole, half, quarter, 8th, 16th, 8th-triplet, dotted-eighth.
- **Include rests** toggle (≈20 % of events become rests when on).
- **Include ties** toggle.
- **Seeded deterministic** output via `mulberry32(seed)`. Regenerate = new seed.
- Triplets and binary never mix **within one beat**. Per-beat choice: triplet if allowed; 30 % weight when both binary and triplet are allowed.
- Generator picks durations only from the user's allowed set. A `canFill` DP table guarantees every pick leaves a remainder that the allowed set can tile — no `forceFit` fallback to lengths the user didn't pick.
- With **ties off**, picks are capped at the current beat's remaining slots, so no event ever crosses a beat boundary.
- With **ties on**, the generator uses a chain-length cap (see §3.2).
- Long notes that cross beat boundaries are split into per-beat pieces by `splitAtBeatBoundaries` in **integer 1/12-of-a-beat units** so accumulated triplet positions never drift away from beat boundaries (the original `pos += 4/3` accumulated FP error).

### 3.2 Tie chain cap

- A "tied chain" = consecutive events joined by ties (chain length = notes; ties = notes − 1).
- Hard cap: chain length ≤ **3** (at most 2 sequential ties).
- Distribution target: **95 %** of chains are length 2 (one tie); ≤ **5 %** length 3.
- Enforced at pick time: each candidate duration is rejected if placing it would span more beats than the current roll allows.
- Ties come **only** from `splitAtBeatBoundaries`. There is no random tie pass.

### 3.3 Notation (`src/lib/notation/render.ts`, VexFlow 5)

- **No clef rendered.** The clef space goes to the notes. Each stave row still shows the time signature on its leftmost stave.
- All rhythm notes render in the **bottom space** of the staff (`f/4` with VexFlow's default treble-clef inference — between the two lowest staff lines). Stems grow upward with plenty of headroom and the noteheads stay clear of the time signature. Audio pitch is unrelated.
- Every beat is visually self-contained — notes that cross beat boundaries are rendered as tied pieces.
- **Beams flush at absolute beat boundaries.** Beams are built a beat at a time using the absolute unit position, so a beat that starts with a rest doesn't drag the following beam group off the grid. `Beam.generateBeams` then places partial secondary beams for mixed durations (dotted-8 + 16).
- **Triplets** render as a 3-note beam group with a "3" tuplet bracket.
- **Dotted notes** get an explicit dot via `Dot.buildAndAttach`.
- **Ties** are drawn with `StaveTie`. Ties that cross rows (when 2 bars stack vertically) render as **two half-ties** — one trailing off the right of row 1, one leading into the left of row 2 — instead of a diagonal line.
- **Beams + tuplets are constructed before `voice.draw()`.** Otherwise notes render with their flags still visible and each note has both a flag *and* a beam.
- **Active-note highlight** is scoped to the playing note. The renderer returns `highlightElements: SVGElement[][]` — for each rhythm-event index, the note's own group (notehead + dot + unbeamed flag) **plus** the stem element fetched via `StaveNote.getStem().getSVGElement()`. VexFlow moves beamed stems out of the note's own group into a shared `<g class="vf-beam">`, so without pulling the stem element explicitly only the notehead would flip colour when a beamed note plays. Beams and ties are intentionally *not* in the highlight set — they're shared across multiple notes.
- **Stacked bars are equal-width.** In stacked layout (narrow viewports, 2 bars) every row uses the same stave width (max of natural widths, capped at the viewport budget) so the rows line up.

### 3.4 Layout (responsive)

- The `Staff` component observes its container with `ResizeObserver` and passes the available width into `renderRhythm`. The rendered SVG is centred horizontally within the staff card (natural width, `margin: 0 auto`).
- The observer's state write is deferred through one `requestAnimationFrame`. Without that, the synchronous re-render kicked off the next layout pass inside the same frame and the browser logged "ResizeObserver loop completed with undelivered notifications".
- On wide viewports, bars render side-by-side.
- **Below ~520 px** and with 2 bars, bars stack on **separate rows**, each with its own time signature.
- The renderer scales each bar proportionally if the row's natural width exceeds the budget (with a floor so notes stay legible).

### 3.5 Transport / playback

- **Play / Stop** button. The button is a **hard stop** — it doesn't preserve playback position; Play restarts from the top of the cycle.
- **Regenerate** (new seed) button. Play and Regenerate sit on a single `transport-top` row at every width (CSS grid `2fr 1fr`); BPM stepper + Bars share the row below.
- **Loop is always on.** No toggle.
- **Loop restart is anchored to the exact cycle end** (`startTime + bars × secPerBar`), not to the last scheduled event's start time, so tempo never rushes between repetitions.
- **BPM snapping**: only the classic Maelzel notches 40–208 (40, 42, … 60, 63, 66, 69, 72, 76, 80, 84, 88, 92, 96, 100, 104, 108, 112, 116, 120, 126, 132, 138, 144, 152, 160, 168, 176, 184, 192, 200, 208). The BPM control is a − / value / + stepper; typed/shared values that land off-notch are snapped on load.
- **Settings apply immediately during playback.** An effect on the page watches every playback-affecting field and calls `restartIfPlaying()`.
- **Keyboard**: Space toggles play/stop when focus is not in an input/button/textarea.
- **Wake Lock**: while playing, the screen stays awake via the Screen Wake Lock API. Re-acquired when the tab becomes visible again. Unsupported browsers no-op.
- **Play button shows a spinner** and is `disabled` + `aria-busy` while the bundled SoundFont is loading (see §3.7).

### 3.6 Metronome

- **On/off** toggle.
- **Divisions**: half / quarter / 8th / triplet / 16th (icon buttons).
- **Emphasize first beat** toggle. Downbeat uses claves, on-beats use woodblock, sub-beats are quieter / lower-pitched.
- **Counted beats**: 1 / 2 / 3 / 4 toggle buttons pick which beats click. When the division is finer than a quarter, every sub-click within a counted beat still fires (e.g. division=eighth with only beat 1 counted gives both eighths of beat 1). At least one beat must remain counted.
- **Count-in** toggle adds one bar of clicks before the rhythm starts (only on the first cycle when looping). The count-in always clicks four steady quarters with the downbeat emphasised — independent of metronome on/off, division, or counted-beats — so the player always hears the lead-in clearly.

### 3.7 Rhythm audio

- Default **off**; user toggles on per session (persisted via the share codec / settings).
- **Instrument**: drum kit *or* bass (fretless bass at A1). UI is a single segmented control: Off / Drum / Bass.
- **Drum mode** plays kick on every non-rest, non-tied-continuation rhythm event.
- **Bass mode** plays one fretless-bass note per non-rest, non-tied-continuation event; sustain = sum of the tied group.
- **Snare and hihat** are independent overlays controlled by `snareOnBackbeats` (boolean) and `hihatSubdivision` (`'off' | 'eighth' | 'sixteenth' | 'triplet'`). They fire regardless of `rhythmAudio` mode (drum/bass/off), so the user can layer a snare backbeat or hihat shuffle over a bass-only practice or even pure metronome practice.
  - Snare = beats 2 and 4 of every bar.
  - Hihat = 2 / 3 / 4 hits per beat depending on subdivision. `'off'` skips it entirely.
- The bundled SoundFont (`static/rhythm.sf3`, ≈770 KB) is **preloaded eagerly** the moment the page mounts:
  - `Player.preload()` creates the AudioContext (suspended), runs `configureIosPlayback`, registers `spessasynth_processor.min.js` as an audio worklet, fetches `static/rhythm.sf3`, and primes the `WorkletSynthesizer` so the first Play press is instant.
  - `appState.soundFontStatus` cycles `idle → loading → ready` (or `error` on a failed fetch).
  - The Play button is disabled with a spinner while `idle` or `loading`. On `error` the button label becomes "Audio unavailable" with a tooltip telling the user to come back online and reload — there is no oscillator fallback. The service worker precaches `rhythm.sf3` on install, so this state is only reachable on a brand-new device with no network on first load.
  - In browsers that refuse to create an AudioContext outside a user gesture (rare), `preload` no-ops and the lazy load happens inside the first Play click.
- The SoundFont was built by `npm run soundfont` from SpessaSynth's GeneralUserGS:
  - keep only Standard 1 drum kit (kick on note 36, claves 75, woodblock 76 — used for click and rhythm)
  - keep only Fretless Bass (bank 0 program 35) for melodic bass at A1 (MIDI 33)
  - SF3 Ogg samples are preserved end-to-end (`compress: false, decompress: false`), output ≈770 KB
- Rhythm hits are scheduled **only on the first note of each tied group** (skip when prev tiedToNext). For bass, audible duration is the sum of the tied group.

### 3.8 iOS ringer-switch workaround (`src/lib/audio/ios-audio.ts`)

- iPhone's side mute switch silences any Web Audio in the default "ambient" category, even at full media volume.
- Two complementary fixes, called from different points:
  - `configureIosPlayback(ctx)` runs from `Player.preload()` (mount-time) and sets `ctx.audioSession.type = 'playback'` on Safari 18+. This part doesn't need a user gesture.
  - `primeIosPlayback()` runs from `Player.run()` (Play button click), inside the user-gesture stack. It mounts a hidden looping `<audio>` element backed by a 100 ms silent WAV data URL and calls `play()`. Any actively-playing HTMLMediaElement flips the page into media-playback mode on older Safari where the Audio Session API doesn't exist. **Must** run synchronously before any `await`, otherwise iOS rejects the `play()` because the gesture has already returned.

### 3.9 Scheduler (`src/lib/audio/scheduler.ts`)

- **Chris Wilson look-ahead pattern**: `setInterval(25 ms)` schedules events 100 ms ahead.
- `buildEventList` is a **pure** function: `{ metronome clicks, rhythm hits, highlight markers }` sorted by time. Pure → easy to test, no mocks.
- **Highlight dispatch** is a `requestAnimationFrame` loop that reads `ctx.currentTime` directly and picks the last highlight whose time ≤ now. Never uses `setTimeout` for highlight timing (would drift away from the audio clock).
- **Loop**: on cycle end, `restartSeamless()` re-primes the event list with `startTime = previous cycleEndTime`. Count-in only applies to the first cycle.

### 3.10 State, persistence, share (`src/lib/state/`)

- **`appState`** is a class with `$state` fields exported as a module singleton. One source of truth: `settings`, `isPlaying`, `activeIndex`, `soundFontStatus`. `rhythm` is `$derived` from settings (so any setting change instantly produces the new rhythm).
- **Every user intent** is a named function in `actions.svelte.ts`. Components only read `appState` and call actions. The `Player` singleton is owned by the actions module.
- **`Player`** owns `AudioContext` + `Synth` + `Scheduler` + `WakeLock` + the soundfont preload promise. Stateless w.r.t. settings: `run(inputs)` always tears down any existing scheduler and starts fresh.
- **Settings persistence**: `localStorage[rhythm-section:v1]` holds the JSON-serialised `Settings` object.
  - On load, payload is **merged with `DEFAULT_SETTINGS`** (`{ ...DEFAULT_SETTINGS, ...parsed, metronome: { ...DEFAULT_SETTINGS.metronome, ...parsed.metronome } }`) so a payload from an older schema (missing e.g. `rhythmAudio`) auto-gets defaults instead of silently turning features off.
  - Loaded settings also pass through `sanitise()` which drops any `allowedLengths` entries the current build no longer recognises (e.g. `dotted-half` from an old payload).
- **Share URL** format: `#s=<base64url(packed-binary)>` — typically **12 characters**.
  - Layout: 1 version byte + 31 bit-packed flag bits + 32-bit little-endian seed = 9 bytes total. The flags pack the BPM (6-bit index into the Maelzel notch table), bars (1 bit), `allowedLengths` (7-bit bitmask), `metronome.countedBeats` (4-bit bitmask), `metronome.division` (3-bit index), nine 1-bit booleans (metronome.enabled, emphasizeFirstBeat, rhythmInstrument drum=0/bass=1, rhythmAudio, allowRests, allowTies, countIn, snareOnBackbeats), and a 2-bit `hihatSubdivision` index.
  - **No legacy fallback.** Bumping the version byte invalidates every URL produced before the bump — `decodeShare` returns null and the page falls back to localStorage / `DEFAULT_SETTINGS`. Old in-the-wild URLs cease to load their state, on purpose: the maintenance cost of multi-version decoders + migration shims wasn't worth it.
  - **Live-synced into the address bar.** An effect on the page calls `updateUrlFromState()` whenever any setting changes; the new URL is written via `history.replaceState` (no extra history entries) so users can copy the address bar at any moment and get a working share link without pressing the Share button.
  - Decode is shape-validated by `isSharedState`.
  - The Share button (icon-only, top-right of the header) uses `navigator.share({ title, url })` when supported and falls back to copying the URL to the clipboard. No image attachment — link previews are the destination app's responsibility, fed by static `og:` meta tags. The handler calls `navigator.share.call(navigator, …)` because Safari's WebIDL guard rejects the bare invocation.
  - **Visibility rule.** In a regular browser tab the URL bar already shows the live-synced share URL, so the Share button only renders when `navigator.share` is available — otherwise it would be redundant clutter. In an installed PWA (`display-mode: standalone` matched, or the iOS `navigator.standalone` flag set) there's no URL bar, so the Share button is always rendered: it falls back to clipboard copy on browsers without a share API. `environment.hasShareApi` and `environment.isStandalone` (in `src/lib/state/environment.svelte.ts`) drive the gate.

### 3.11 Theme & visual system

- **Follows the system** via `@media (prefers-color-scheme: light | dark)`. No manual toggle; the CSS variables flip live when the OS setting changes.
- All colours, shadows, radii and spacing tokens live as CSS custom properties in `src/app.css` under `:root` (dark defaults) and `@media (prefers-color-scheme: light) :root` (light overrides).
- **Brand-blue** drives every primary surface (Play button gradient, pressed-state buttons, focus ring). Accent orange is reserved for the active-note highlight on the staff.
- Ambient page gradient = two soft radial highlights over a 2-stop linear; cards sit on top with a subtle shadow.
- Staff card stays white in both themes (music paper convention); VexFlow's default black strokes read against it.
- `<meta name="theme-color">` has two entries gated by `media="(prefers-color-scheme: ...)"` so iOS status bar / Android chrome match the active theme.

### 3.12 PWA / installable app

- **`static/manifest.webmanifest`** declares name, short name, start URL, standalone display, orientation, theme + background colours, categories, and four icon entries (192, 512, 512 maskable, plus the SVG source).
- **Icons** (`icon-192.png`, `icon-512.png`, `icon-maskable.png`, `apple-touch-icon.png`) are generated from `src/lib/assets/favicon.svg` by `npm run icons` (uses `@resvg/resvg-js` — pure WASM). PNGs are committed so deploys don't rasterise.
- `app.html` links the manifest and the apple-touch-icon with **relative URLs** so they resolve under GitHub Pages' `/<repo>/` subpath.
- **Offline mode**: `src/service-worker.ts` precaches everything in `$service-worker`'s `build` + `files` lists (compiled JS / CSS, the bundled SoundFont, the manifest, the icons). Navigation goes network-first with the cached shell as offline fallback; other GETs are cache-first then network. The SW calls `skipWaiting()` + `clients.claim()` so a new deploy takes over immediately.
- **Auto-refresh on new deploy**: `reloadOnNewServiceWorker()` in `src/lib/service-worker-client.ts` listens for `controllerchange`. The moment the browser swaps in a newer SW, the page reloads once. First-load safety: only attaches when a controller was already present at page load, so a brand-new install doesn't reload itself.

### 3.13 Mobile UX

- Viewport meta: `viewport-fit=cover` and safe-area insets respected in CSS (`env(safe-area-inset-*)` on `main` padding).
- PWA-capable meta tags (`theme-color`, `apple-mobile-web-app-capable`, `apple-mobile-web-app-title`).
- **44 px** minimum tap-target on every interactive control. `touch-action: manipulation` and no tap-highlight flash.
- **Transport stacks vertically** at narrow widths: Play + Regenerate share a row (2:1), then BPM stepper + Bars share a row.
- Selected buttons inside `.group` keep the bright gradient background (scoped `aria-pressed` override, because Svelte's style scoping otherwise wins over the global pressed rule).
- Note-length picker, division picker and count-beat buttons are icon-only (SVG via `NoteIcon`).

---

## 4. Build-time scripts (`scripts/`)

### `scripts/build-soundfont.mjs` (`npm run soundfont`)

Outputs `static/rhythm.sf3`. Inputs:

- Source URL: `https://spessasus.github.io/SpessaSynth/soundfonts/GeneralUserGS.sf3` (≈8.4 MB).
- Cached at `.cache/GeneralUserGS.sf3` after first download (gitignored).

Transforms:

1. `SoundBankLoader.fromArrayBuffer(buf)` → `BasicSoundBank`.
2. Keep only presets matching `KEEP[]`: `(p) => p.isGMGSDrum && p.program === 0` (Standard 1) and `(p) => !p.isGMGSDrum && p.program === 35 && p.bankMSB === 0` (Fretless Bass).
3. Delete every other preset, then `removeUnusedElements()` + `flush()`.
4. `writeSF2({ compress: false, decompress: false, … })` so SF3 Ogg sample blobs pass through unchanged. Output is ≈770 KB and committed to `static/rhythm.sf3`.

### `scripts/generate-icons.mjs` (`npm run icons`)

Inputs `src/lib/assets/favicon.svg`. Outputs:

- `static/icon-192.png` (transparent, 192×192)
- `static/icon-512.png` (transparent, 512×512)
- `static/icon-maskable.png` (brand-blue background, 512×512, for Android adaptive icons)
- `static/apple-touch-icon.png` (brand-blue background, 180×180, iOS home-screen)

Uses `@resvg/resvg-js`, pure WASM. PNGs are committed.

---

## 5. Invariants worth tests

These are guarded by the test suite today; if any regresses, the spec broke:

- **RNG** is deterministic per seed; returns values in `[0, 1)`.
- **Generator**
  - Produces exactly `bars × 4` beats of content.
  - Never emits a length the user didn't select.
  - Respects allowed-set fidelity even under awkward partitions (quarter + 16th only, etc.).
  - With `allowTies=false`, no event ever crosses a beat boundary and no chain exists.
  - With `allowTies=true`, no chain exceeds 3 events and the length-3 fraction stays well under the 5 % ceiling across many seeds.
  - Emits triplets only in exact groups of 3 per beat.
- **Audio event list** — correct click count per division, correct emphasis tagging, count-in shifts rhythm/highlights without skipping metronome, count-in still clicks when the metronome is disabled, drum hits only once per tied group, highlight event exists for every rhythm event, counted-beats gating works for sub-divisions.
- **Share codec** round-trips, rejects malformed input, URL-safe charset.
- **Settings** load merges with defaults; hash takes precedence over localStorage; invalid JSON falls back to defaults; unknown lengths are dropped.
- **BPM** snaps to a Maelzel notch; step up/down clamps at 40 / 208.

---

## 6. Extending the app — checklist

Before adding a feature, check:

1. Does it fit the existing **settings → actions → Player** flow, or does it need new state?
2. Does it need to **survive reload**? If yes, add a field to `Settings` with a default — `loadFromStorage` merges with defaults, so existing users auto-migrate.
3. Does it need to **travel in a share link**? If yes, add it to `SharedState`, update `isSharedState`, and add a default for old payloads in `decodeShare`.
4. Does it affect **playback**? Add the field to the dependency list in the `restartIfPlaying` effect on `+page.svelte`.
5. Does it change **visual notation** or audio timing? Write the test first (`generator.test.ts`, `events.test.ts`) before touching the renderer / scheduler.
6. Does it add a **playback-affecting action**? Use the action layer; never reach into the Player from the page directly.
7. **Mobile**: 44 px minimum tap targets, the layout still has to fit a 360 px viewport; transport must stack cleanly under 520 px.
8. **PWA**: any new static asset under `static/` is automatically precached (via `$service-worker`'s `files` list). Bumping `version` (the SW imports SvelteKit's `$service-worker`'s `version`) invalidates the cache.

---

## 7. Verification checklist (manual)

On every non-trivial change:

1. `npm install` if `package.json` changed.
2. `npm run check` clean.
3. `npm run test` green.
4. `npm run build` succeeds (and produces `build/service-worker.js` + `build/rhythm.sf3`).
5. `npm run dev` → `http://localhost:8473/`:
   - Regenerate several times at 1 bar and 2 bars; notation stays clean and beats are visually separated.
   - Toggle every setting during playback and confirm the loop restarts cleanly at the correct tempo.
   - Set BPM via steppers, confirm only Maelzel notches appear.
   - Switch rhythm audio Off / Drum / Bass.
   - In a browser with `navigator.share` (Chrome Android, Safari iOS): tap Share, confirm the OS share sheet shows the staff thumbnail and the URL link card.
   - In a browser without `navigator.share` (Firefox, most desktops): the Share button should be **hidden**; copy the URL straight from the address bar and confirm it's already up to date with the current settings (live-synced).
   - Open the share URL in a private window: same exercise loads.
   - Reload without a hash; previous session's settings load without a visible flash.
   - On a phone-width viewport (DevTools or real phone): page never scrolls horizontally, transport buttons are all tappable, 2-bar view stacks and shows half-ties at the row edges, screen stays awake while playing.
   - Disconnect network, reload: app still loads (service worker cache).

---

## 8. Browser support & known quirks

- **Chrome / Edge** desktop and Android: full support.
- **Safari** 18+: full support.
- **Safari** 17 and below: Web Audio Session API isn't available; the silent-`<audio>` fallback in `ios-audio.ts` handles ringer-mute. Some older versions also refused to create an AudioContext outside a user gesture; `Player.preload()` catches that and falls back to load-on-Play.
- **Firefox**: Web Wake Lock isn't supported in older versions; `WakeLock` no-ops gracefully.
- **navigator.share with files**: not implemented on desktop browsers — share falls back to clipboard copy.
- **Firewalled devcontainer**: the build-time fetch of `GeneralUserGS.sf3` (in `scripts/build-soundfont.mjs`) goes to `spessasus.github.io`, which is a GitHub Pages domain. The committed devcontainer firewall already allows it; if you tighten the allowlist, add this host.
- **VexFlow gotcha**: beamed stems live in a shared `<g class="vf-beam">`, NOT inside the note's own group. The renderer fetches them via `note.getStem()?.getSVGElement()` so the highlight covers the right vertical line.
- **iOS audio gotcha**: `audio.play()` on the silent-audio primer is rejected outside a user gesture. Setting up the silent audio at AudioContext-creation time (in `Player.preload()`, which runs on mount) regresses the ringer-mute fix — the primer must run from the Play click, before the first `await`.

---

## 9. Known deferred items

- **True pause/resume** from mid-bar position. Today the Stop button is a hard stop and Play restarts from the top of the cycle.

---

## 10. Deployment

- Pushing to `main` triggers `.github/workflows/deploy.yml`, which:
  1. Installs deps with `npm ci`.
  2. Runs `npm run build` with `BASE_PATH=/<repo-name>` so all asset URLs (manifest, icons, SoundFont, JS chunks) resolve under the GitHub Pages project subpath.
  3. Uploads `build/` as the Pages artifact and deploys.
- Custom domain: drop a `CNAME` file in `static/` (so it's copied to `build/`) and set `BASE_PATH=` (empty) in the workflow's `env:` block.
- Service worker caches every build artifact, so a deploy automatically becomes the offline-cached version on the next page load (and the auto-refresh hook reloads any open tab).

---

## 11. Local task tracking

`prompt.md` at the repo root is a gitignored scratch file holding the current round of TODOs in checkbox form. Edit it freely; the agent reads it, does the tasks, ticks them off, commits, and moves on. The file is local-only — never committed.
