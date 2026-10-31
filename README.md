# SuperDuperSource (.kennedys)

Animated SuperSource transitions for Blackmagic ATEM switchers. Not affiliated with Blackmagic Design.

A layout waits on preview in its final form. When it's taken to air, it starts as an exact copy of what's already on program (the presenter camera full screen, say), then animates into the layout. Taking it out runs the other way. The design, decisions and open work are in [project.md](project.md).

## Status

The app drives either a real ATEM over the network or a built-in simulator with the same inputs and buses as a 2 M/E. The ATEM connection is written and tested against a stand-in switcher, but not yet against real hardware; the first checks to run on one are in [spike/](spike/README.md). Pick the connection in Setup.

## Layout

| Folder | What's in it |
|---|---|
| `packages/core` | Design model, motion maths, source matching, take planning, the engine and the simulator. No Electron, no ATEM. |
| `apps/desktop` | The Windows tray app (Electron + React). |
| `apps/companion` | The Bitfocus Companion module (Companion 4.3 or later). |
| `packages/atem` | The ATEM adapter: connection, discovery, state, and takes streamed frame by frame. |
| `packages/protocol` | Types for the link between the app and the Companion module. |
| `apps/site` | The download page at superdupersource.kennedys.nz, with the in-browser demo at `/demo`. |
| `spike` | Phase 0 scripts to run on a real ATEM. |
| `Supersources-templates` | Background and cutout PNGs. |

## Running it

Needs Node 22 or later (the Companion module tooling requires it).

```bash
npm install
```

The desktop app:

```bash
npm run dev -w @sds/desktop
```

The same UI in a browser, with the simulator running in the page (handy for quick UI work):

```bash
npm run web -w @sds/desktop
```

Then open http://localhost:5199.

Tests and type checks:

```bash
npm test
```

```bash
npm run typecheck
```

## Trying a take

1. On the **SuperSources** tab, click *Slides + presenter*. It loads into SuperSource 1 and goes to preview.
2. Open **Simulator** (bottom of the left rail). Program shows the presenter camera.
3. Press **SS CUT**. The camera shrinks into the right-hand strip while the slides are revealed.
4. Put *CAM2* (the slides) on preview and press **SS CUT** again. The slides grow to full screen and the switcher cuts to them.
5. **Panel CUT** is a take made on the switcher panel. The app sees it but doesn't animate, as designed.

## Companion

The module connects to the app on port 8710. To build the package Companion imports:

```bash
npm run build -w companion-module-kennedys-superdupersource
```

```bash
npm run package -w companion-module-kennedys-superdupersource
```

That writes `apps/companion/kennedys-superdupersource-0.1.0.tgz`. In Companion, import it under Modules, add a *SuperDuperSource* connection, and drag buttons from its presets. [The module's help page](apps/companion/companion/HELP.md) covers the buttons.

## Download page

`apps/site` is the page at superdupersource.kennedys.nz. Its hero runs the real Slide 10 transitions with the app's own renderer, and `/demo` is the desktop UI running on the simulator in the browser. It lists the latest GitHub release when there is one.

```bash
npm run dev -w @sds/site
```

CapRover builds it from the repo root on every push to `main`, using `captain-definition` and `apps/site/Dockerfile`.

## Licence

MIT
