# Rhythm Section

A browser-based rhythm-reading trainer. Pick the note lengths you want to practice, dial in a tempo, hit **Play**, and read the generated bar against a configurable metronome. Every exercise is shareable by URL, so a teacher can send the same bar to a student and they'll see the exact same rhythm.

Live app: deploys automatically to GitHub Pages from `main`.

## Why

Most rhythm-reading drills online make you pick from a short list of fixed patterns. This app generates a new bar every time from the building blocks _you_ selected, at the exact tempo _you_ asked for. Nothing to flip through, nothing to skim past — one rhythm in front of you, one click to reload, loops forever.

## Features

- **Generator that stays inside the box.** Pick any combination of whole / half / quarter / eighth / sixteenth / dotted-eighth / eighth-triplet. The generator will only ever emit durations from your selection, with rests if you want them, and ties if you want them. Never more than two ties in a row.
- **Beat-aligned notation.** Every beat is visually self-contained. Cross-beat notes are split into tied pieces, beams break at every beat boundary, and tuplets render with the classic "3" bracket.
- **Metronome that does more than tick.** Toggle which of the four beats you want to hear, pick the subdivision (half / quarter / 8th / triplet / 16th), emphasise the downbeat, add a one-bar count-in.
- **Read along with audio reference.** Optionally play the generated rhythm through a synthesised kick drum, a synthesised bass, or any SoundFont (.sf2 / .sf3 / .dls) you drop in — SpessaSynth takes over for high-quality playback.
- **Always in tempo.** A Chris Wilson look-ahead scheduler keeps clicks and highlights locked to the `AudioContext` clock.
- **Share a rhythm.** The Share button in the header copies a URL that encodes every setting plus the rhythm seed. On mobile it also hands the current staff as a PNG to the OS share sheet.
- **Dark / light theme.** Follows the system preference live — no toggle to hunt for.
- **Phone-first.** 44-px tap targets, safe-area aware, the screen stays awake while playing via the Wake Lock API.

## Stack

- [SvelteKit](https://kit.svelte.dev/) + [Svelte 5 runes](https://svelte.dev/docs/svelte/what-are-runes), TypeScript end to end.
- [VexFlow 5](https://github.com/vexflow/vexflow) for notation.
- [spessasynth_lib](https://github.com/spessasus/spessasynth_lib) for optional SoundFont playback.
- Vitest for unit tests.

## Running locally

```sh
npm install
npm run dev       # dev server on http://localhost:8473
npm run test      # Vitest
npm run check     # svelte-check
npm run build     # static site into build/
```

The dev server binds to `0.0.0.0` so it's reachable from a phone on the same network. Point your phone at `http://<your-host>:8473/`.

## Deploying

Pushing to `main` builds and deploys to GitHub Pages via `.github/workflows/deploy.yml`. The workflow sets `BASE_PATH=/<repo-name>` so asset URLs resolve under the project subpath.

## Architecture at a glance

| Area | Module |
| --- | --- |
| Generator + cross-beat splitter | `src/lib/rhythm/generator.ts` |
| Notation rendering | `src/lib/notation/render.ts` |
| Audio event list (pure) | `src/lib/audio/events.ts` |
| Look-ahead scheduler | `src/lib/audio/scheduler.ts` |
| Oscillator + SoundFont synth | `src/lib/audio/synth.ts`, `soundfont-synth.ts` |
| BPM snapping (Maelzel scale) | `src/lib/audio/bpm.ts` |
| State singleton + actions | `src/lib/state/app-state.svelte.ts`, `actions.svelte.ts` |
| Share URL codec | `src/lib/state/share.ts` |

For the full feature spec, invariants tests guard, and "how do I add X?" checklist, see [`PLAN.md`](./PLAN.md).
