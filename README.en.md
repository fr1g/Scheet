**English** | [简体中文](README.md)

# Scheet

<div style="display: flex; flex-direction: column;">
  <img src="logo-designs/concept-logo-v5.png" alt="Scheet" style="margin: auto" width="160">
  <p style="text-align: center"><strong>Plan your life, week by week</strong></p>
</div>

Scheet is a local-first weekly timetable app: plan your week's tasks and breaks in 5-minute increments, get automatic ringing popup reminders when time's up, and keep a daily todo list in the right-hand panel. All data stays on your own computer. Supports Windows / macOS / Linux.

Scheet: pronounced the same as the original word "Sheet" — it takes the "spreadsheet" meaning with a hint of "School". It's a more flexible "class timetable", hoping to give you a more regular yet still flexible option beyond Pomodoro timers and TODO apps.

Proudly built with **Vibrative Fellows**.

## Warning

This app has not completed full functional testing on every platform and system. It currently runs fine on the dev machine, but crashes with `STATUS_HEAP_CORRUPTION` may occur during HMR; the root cause is still unknown. Dev machine specs:

- WebView2: 154.0.4258.37
- Windows: 11 Pro 25H2 26200.9550
- HW: R5-7600X, RTX 2080 Ti (Chromium hardware acceleration enabled)

Performance issues not observed on the dev machine may still exist.

## Features

- **Weekly timetable editing**: 5-minute granularity; normal/rest events; per-event colors with light/dark text; multiple timetables with rotation anchors and per-day overrides; conflicting edits are rejected on save and highlighted with a red border
- **Smooth interactions**: drag to reschedule/change day, edge resizing, Shift for temporary moves, copy & paste (clipboard preview + one-click restore of the original clipboard), a pulsing white ring marking the current-time cell
- **Reminder system**: start/end dual-ring chain (event → type → global, with visible inheritance), built-in default start/end rings, custom ringtones (once/loop), always-on-top popup on the dot (no focus stealing, live clock) + confirmation snackbar, system tray residence, offline catch-up for manual reminders
- **Daily todos**: three-state right panel (pinned / hidden / temporarily expanded); unfinished items automatically carry over to the next day
- **Local-first**: data stored in the user documents directory (three SQLite databases); the app is fully offline and makes no network requests
- **Customizable**: Chinese/English UI, five built-in fonts with size presets, title-bar clock, window control button position, app icon variants, log level

## What does Scheet solve?

- Provides a set of recurring timetables (up to six) for scheduling regular routines
- You decide which hours of the day Scheet manages — it's fine if Scheet only manages, say, eight hours a day
- Automatically inherits yesterday's unfinished TODOs — but don't forget they do need to be done someday
- If a Pomodoro timer shows up right inside your daily schedule, you probably won't forget what each time block is for, right?

## The story behind Scheet

The two months since I graduated were a blur — no class timetable, no job, and anything I wanted to schedule depended entirely on self-discipline... except I was too lazy to discipline myself. One day, tossing and turning in bed, it suddenly hit me: my past and future routines were both built on a recurring set of fixed events — so if I wanted my life to become regular again, shouldn't I just make a class timetable? A pure web app was totally within my ability to build, but I worried I'd get distracted by random things and turn the project into another Kuolie-style mountain of unmaintainable legacy code (not that I write unmaintainable code anymore, but still, the worry was there). As luck would have it, Z.ai had just had that well-publicized incident, and with the holiday around the corner they were handing out a hundred million free "eggs" (credits) a day — so why not use the trial and the free eggs to build a Tauri app and try out a harness at the same time? I wrote an initial prompt of several hundred words, fed it to plan mode, and after about 70 rounds of iteration plus my own visual tweaking, Scheet was born — and I did indeed start following the schedule Kimi helped me draft to get through each day.

### Ringtones

The first ringtone was made by GLM in Python, but it sounded like a doorbell, so I spent a few minutes in GarageBand laying down two ringtones with a synthesizer and simple loops — a default start ring and a default end ring. You can find them in `default-ringtones`. Why didn't I ask GLM to iterate further on a MIDI track? Honestly, since AI output is basically gacha pulls anyway, hand-rolling was faster — pressing keys is much easier than writing Rust, so I just did it myself.

### Logo

See `logo-designs` — v1 through v5 are all prototypes.

- v1: Since it's cross-platform, I wanted a distinctive silhouette, so I went with a leaf-like form reminiscent of "the ACDSee eye". At first I wanted to draw the weekday header like mobile calendar apps do, but it clashed badly with the shape, so I dropped it. Then I drew five schedule tracks and added some signature details (flexible event cells) — I was quite pleased. But after cropping, it turned out to be an indistinguishable blob at desktop-icon size. Fine — cut two tracks, which led to:
- v2: Still blurry, and ugly. Time for a different approach.
- v3: Stacking two "cards" representing events, flanked by two columns conveying scheduling flexibility. I actually liked this one. Then my mom walked by — "What are you making?"
- v4: I explained the idea and my thinking, and this version came out of that. She said: why not push the two cards together and shape the borders into an "S"? — since I'd told her I wanted an S dead center. I thought it looked ugly, and she offered another idea —
- v5: "How about arranging the cards horizontally, then vertically?" She gestured. "So they form an S?" — At first I just assembled an S from two grid parts, then added skew, scale-x, and color separation, and asked her whether that looked better. She seemed very satisfied. I thought it was pretty good too — finally, properly minimal.

Then I asked GLM: there's a folder called logo-designs in the workspace; go look at the five drafts and tell me which one you think looks best. GLM thought for two minutes and told me it picked v5 — praising it to the skies while trashing every version except v1 and v5. The logo's two colors: the salmon pink comes from `#fecac0de` overlaid on `zinc-800?`, and I forgot the exact code of the purple, but it's one of Shanshan's favorite colors. Funny thing though: both GLM and I thought v2 was mediocre, yet when I showed it to Shanshan, she said v2 was the best (lol — maybe as a badge it hit some personal preference of hers).

### ZCode free eggs

I don't really care about the PR storm Z.ai ran into — why not use free eggs when they're offered, especially for a small project like mine. And GLM genuinely does good work; the catch is that in daily use I run it at maximum thinking intensity, GLM-5.3-Flash — I couldn't afford to be this extravagant with my own money. "Hard to go from luxury back to frugality," indeed. If I ever end up paying out of pocket, I'll probably have to alternate it with Kimi Code.

## Tech stack

Tauri, Vite, React, TailwindCSS, TS, Rust, SQLite

*I have to say, the parts of this stack I actually master look like a lot but really aren't — the entity layer, architecture design, and backend were all handed over to GLM.*

## License

MIT — including the bundled audio and images. *But if I ever remember something or make some other magical change, I'll probably revise the license.*

The source code, packages, and releases contain several OFL-licensed fonts: Maple Mono, LXGW Wenkai, HarmonySans. These assets are subject to their respective licenses.

The software depends on other open-source projects, which are likewise subject to their own licenses.

## How to build

### Prerequisites

- Node.js ≥ 20 and pnpm ≥ 9 (frontend toolchain)
- Rust stable (MSVC toolchain on Windows; Tauri dependencies such as `libasound2-dev` and `libwebkit2gtk-4.1-dev` on Linux; Xcode Command Line Tools on macOS)
- WebView2 Runtime on Windows 10 and above (usually preinstalled; the app will guide you through installation if missing)

### Daily development

```bash
pnpm install       # install frontend dependencies (first time)
pnpm tauri dev     # start the dev instance; frontend hot-reloads
```

For frontend debugging with DevTools, go to Settings → Advanced, hold Shift, and click [Open DevTools].

### Building releases

```bash
pnpm build         # frontend type check + bundling
pnpm tauri build   # build the release artifact for the current platform (single file, see below)
```

Artifact locations (single-file, portable, on all three platforms):

| Platform | Artifact |
| -------- | -------- |
| Windows | `src-tauri/target/release/scheet.exe` |
| macOS   | `src-tauri/target/release/bundle/macos/Scheet.app` |
| Linux   | `src-tauri/target/release/bundle/appimage/scheet.AppImage` |

### Tests

```bash
cd src-tauri
cargo test         # Rust unit tests (scheduler / conflict detection / ring chain, etc.)
```

More acceptance test cases: [docs/测试用例.md](docs/测试用例.md). Known issues and platform notes: [docs/problems.md](docs/problems.md). Project conventions: [AGENTS.md](AGENTS.md).

## AI Usage

- The project's initial framework was generated by an AI assistant (ZCode, GLM model) from human requirements, including:
  - Tauri 2 project structure and single-file build configuration for all three platforms (portable single exe for Windows / `.app` for macOS / `.AppImage` for Linux);
  - Frontend stack integration: Vite + React + React Router + Tailwind CSS v4 + Headless UI + TDesign Icons (pnpm-managed);
  - SQLite settings layer: rusqlite (bundled) + lazy initialization + async IPC, databases in the user documents directory;
  - Custom frameless window with cross-platform, position-configurable window control buttons persisted to SQLite;
  - WebView2 runtime detection and auto-install fallback for the Windows portable build (`src-tauri/src/webview2.rs`);
  - Reminder delivery: always-on-top popup child window (static page rendering, live clock, `WS_EX_NOACTIVATE` to avoid stealing focus, `src-tauri/src/popup.rs`) + confirmation snackbar; the system-notification module is kept as backup (invisible in Do Not Disturb mode);
  - Alarm/ringtone system: alarms directory + rodio playback (once/loop, fallback when missing, three built-in default rings for start/end/generic, `src-tauri/src/sound.rs`);
  - System tray residence (left-click to refocus, menu quit, closing the window hides to tray, `src-tauri/src/tray.rs`);
  - this README, the AGENTS.md project conventions, and the app placeholder icon.
- The generated code has passed tsc type checking, vite builds, cargo compilation, Rust unit tests, and on-device smoke testing.
