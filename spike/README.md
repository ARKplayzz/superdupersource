# Phase 0 hardware spike

Scripts that answer the phase 0 questions in `../project.md` §13 on a real switcher, before any app code gets written. Start with the 2 M/E Production Studio 4K.

Every test that touches the switcher works on a SuperSource that is **off air**. Before starting, each test checks ME1 program (including anything nested through ME2) and every aux. If the SuperSource goes on air mid-test, the test stops. When a test finishes, or you press Ctrl+C, it puts the SuperSource back the way it was. Macro tests only write to slots 98 and 99 (numbered from 1), and refuse to overwrite a macro whose name doesn't start with `SDS ` unless you pass `--force`.

## Setup

Needs Node 20 or later on the control PC.

```bash
npm install
```

## 1. Find the switcher and see what it has

```bash
npm run discover -- --scan
```

Bonjour first, then `--scan` sends the ATEM hello to every address on the local /24. Then:

```bash
npm run probe -- --ip 192.168.0.240
```

This one only reads. It prints the model, protocol version, video mode, SuperSource and box counts, border support, which reserved macro slots (80–99) and still slots (15–20) are in use, and the input list. Note the input ids for the presenter camera and the slides: the tests take them as `--cam` and `--slides`.

## 2. Streaming vs macro (the big one)

Put the SuperSource on a multiview window, or route it to a recorder, where you can watch it. Keep it off program.

```bash
npm run test:stream -- --ip 192.168.0.240 --cam 1 --slides 2
```

This plays all four Slide 10 transitions five times. The PC sends one batch of box updates per frame. For each run it prints how late the sends were and how the switcher's own box reports were spaced. 1-frame gaps are good. Doubled and skipped frames are what stutter looks like.

```bash
npm run test:macro -- --ip 192.168.0.240 --cam 1 --slides 2
```

This records the same animation into macro 99, one frame wait per step, then downloads it, uploads the bytes into macro 98, and runs both three times. It prints record, download and upload times, the macro size in bytes, and the same frame-spacing numbers. The downloaded bytes are saved in `results/` for working out the macro format later. Add `--stress 1500` to look for a macro size limit, and `--transition in-from-slides` (etc.) to try the other transitions.

The numbers help, but the deciding test is your eye: watch both on the multiview and note which looks smooth.

## 3. Ranges, units, crop and stacking

```bash
npm run test:ranges -- --ip 192.168.0.240 --cam 1 --slides 2
```

It sets out-of-range values and reads back what the switcher keeps, then walks through four visual checks, waiting for Enter between each:

1. A box that should exactly fill the top-right quarter (confirms the unit scale)
2. A cropped box (confirms whether crop scales with box size, which the motion maths assumes)
3. The Slide 10 final layout (check it against the template)
4. Two overlapping boxes (which box draws on top)

Your answers are saved with the results.

## 4. Connection limit

```bash
npm run test:connections -- --ip 192.168.0.240
```

Opens connections until the switcher refuses one. Note what else was connected at the time (Companion, ATEM Software Control, panels).

## Offline check

```bash
npm run test:geometry
npm run typecheck
```

These run without a switcher. They check the interpolation maths and that the Slide 10 boxes land on the template cutouts.

## Results sheet

Every script saves JSON to `results/`. Fill this in and paste it back into the chat:

| Question | Answer |
|---|---|
| Switcher model / firmware / video mode | |
| Streamed animation: smooth by eye? (y / mostly / no) | |
| Streamed: doubled + skipped frames per run (typical) | |
| Macro animation: smooth by eye? | |
| Macro: doubled + skipped frames per run | |
| Macro record time / upload time / size in bytes | |
| Stress macro: largest frame count that worked | |
| Quadrant check: box fills top-right quarter exactly? | |
| Crop check: does crop scale with size? | |
| Slide 10 layout matches template? | |
| Which box draws on top (1 or 2)? | |
| Do moving boxes need a border over Slide 01? | |
| Border support reported by probe | |
| Connections accepted (and what else was connected) | |
| mDNS found it? Scan found it? | |
