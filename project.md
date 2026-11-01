# SuperDuperSource (.kennedys)

Animated SuperSource transitions for Blackmagic ATEM switchers. Not affiliated with Blackmagic Design.

Draft 4, 31 Oct 2026. Status: building without hardware. The core logic, the simulator, the desktop app, the Companion module, the download page and the ATEM connection are built and tested; nothing has run on a real switcher yet (§13).

Decided so far:

- Animated designs use the plain Slide 01 background with art behind the boxes. The cutout slides are layout guides.
- "Active" means a show shortlist.
- Takes go through Companion / Stream Deck. Takes that bypass the app never animate.
- 1080p50. Windows only.
- SuperSource goes to air on ME1 by default, sometimes through ME2.
- Each design has its own in and out animation per matched source. The out animation targets whatever is on preview.
- No match means a plain cut. 5 and 6 box layouts are static only in v1.
- Public release named **SuperDuperSource**: public repo under the MIT licence, signed Windows installer, public download page.

---

## 1. The idea

An ATEM SuperSource is a static layout: up to four boxes over a background. You cut to it and it appears. Apple's keynotes did something better. The presenter is full screen, then the shot shrinks into a side box while the slides grow in beside it, and it reverses on the way out. Nobody sees a cut, only one shot turning into the next.

This app does that on an ATEM. It runs on the control PC beside the switcher, stores a library of layouts, and plays a motion transition whenever a layout goes to air or comes off it.

How a transition works:

1. While the layout sits on preview, it shows its **final form**, so the director sees exactly what they will get.
2. At the take, the layout is first set to a **start state** that looks identical to what is already on program: for example, the presenter camera box at full size, centred, uncropped. The cut from camera to SuperSource is then invisible.
3. The boxes animate from the start state to the final form.
4. Taking it out runs the reverse: the box holding the next source grows to full screen, then the switcher cuts to that source directly. That cut is also invisible.

If nothing on program matches a box in the layout, there is no start state to grow from, so the layout cuts in as a normal SuperSource.

---

## 2. Hardware and environment

| Switcher | SuperSource engines | Boxes per engine | Notes |
|---|---|---|---|
| ATEM 2 M/E Production Studio 4K | 1 | 4 | Primary target |
| ATEM 2 M/E Constellation (HD / 4K) | 1 | 4 | SuperSource borders added in ATEM software 9.6.2 |
| ATEM 4 M/E Constellation 4K | 2 | 4 each | Two independent engines |

The app reads the switcher's capabilities on connect (engine count, box count, media players, macro slots, video mode), so other SuperSource models should work without special cases.

**Control PC.** Windows, connected to the switcher over Ethernet and USB. The app starts at login, lives in the tray, and opens as a compact window rather than a full-screen app (closer to NZXT CAM than to ATEM Software Control).

**USB doesn't help.** ATEM control goes over the network protocol (UDP 9910). The USB port is for Blackmagic's setup utility, firmware updates and webcam output. It can't be used to detect or control the switcher, so discovery has to happen on the network (see §8.3).

### What a SuperSource box can and can't do

These limits decide what the motion system can offer:

- Per box: enabled, source, position X/Y, size, crop top/bottom/left/right. ATEM Software Control shows ranges of roughly X ±48, Y ±27, size 0.07 to 1.00, crop 0 to 18 (top/bottom) and 0 to 32 (left/right). Confirm on hardware.
- **No opacity and no rotation.** Boxes can't fade. Motion is limited to position, scale and crop. Crop can fake a wipe-reveal.
- **Minimum size is 0.07**, so a box can't shrink to nothing. It has to slide offscreen, crop to zero width, or be switched off (a hard cut).
- **Stacking order is fixed by box number**: box 1 draws on top. Box order can't be changed per animation, but which source sits in which box can (see §5.3).
- **Art** (the background still) is either behind the boxes or in front of them, keyed by its alpha.

---

## 3. The templates

The nine PNGs in `Supersources-templates/` are 1920×1080 RGBA, with **transparent** cutouts rather than white ones. I measured every cutout from the alpha channel. Using 1 ATEM unit = 60 px (32 units across, 18 down, centre is 0,0), the boxes land on round ATEM numbers, which suggests the slides were built from switcher values:

| Template | Boxes | Box geometry (ATEM units, approximate) |
|---|---|---|
| Slide 01 | 0 | Background only |
| Slide 02 | 2 | Size 0.75, X ±7.5, Y 0, sides cropped (cutout aspect 1.11) |
| Slide 03 | 3 | Size ~0.70, X −10.5 / 0 / 10.5, sides cropped (portrait, aspect 0.83) |
| Slide 04 | 4 | Size 0.40, X ±6.4, Y ±3.6 (2×2 grid) |
| Slide 05 | **5** | Size ~0.33, top row X −10.5 / 0 / 10.5, bottom row X ±5.3 |
| Slide 06 | **6** | Size ~0.33, 3×2 grid |
| **Slide 10** | 2 | **A:** size 0.75, X −4, Y 0. **B:** size 0.50, X 12, Y 0, crop L/R ≈ 8 each (portrait, aspect 0.88) |
| Slide 11 | 3 | A as slide 10. Two side boxes: size 0.25, X 12, Y ±3 |
| Slide 12 | 4 | A as slide 10. Three side boxes: size 0.25, X 12, Y 4.5 / 0 / −4.5 |

They fall into two natural groups: **Main + side column** (10, 11, 12) and **Grid** (02 to 06).

**How the templates are used.** Slides 02 to 12 are the backgrounds used for static SuperSources today. For animated designs, the background on the switcher is always the plain **Slide 01**, with art behind the boxes, because a baked outline can't follow a box that moves. In the designer, the cutout slide shows as a **guide overlay** only: the boxes snap to its holes, and it never goes to the switcher. If boxes need an edge while they move, use the switcher's SuperSource border on models that have it.

**Slide 10, the first target.** Box A is the slides (PPT) at 75%. Box B is the presenter camera, cropped to a portrait strip on the right. The two transitions to build first:

- **Camera → Slide 10.** The camera fills the screen, then shrinks and slides right into box B while cropping in from the sides. Box A is revealed behind it, or slides in from the left.
- **Slides → Slide 10.** The slides fill the screen, then shrink left into box A. Box B slides in from the right edge.

Each has its own out animation (to camera, to slides), designed separately rather than as a mirror of the in. The camera auto-tracks, so box B's crop stays fixed and the presenter stays inside the strip.

---

## 4. Problems with the concept as written, and proposed fixes

### 4.1 Takes that bypass the app can't be intercepted

The app learns about a cut only after the switcher has done it. If someone presses CUT on the hardware panel or in ATEM Software Control with the layout on preview, the final form goes to air for one to three frames. The app then snaps to the start state and animates, and the audience sees a flash.

Takes are normally made from Companion / Stream Deck, so the override `SS CUT` / `SS AUTO` buttons cover the usual case. Under the hood those buttons run **smart macros** (§5.2), which the app rewrites in the background. That keeps the motion frame-accurate, and it means a panel macro button can do the same take if the Stream Deck isn't to hand.

**Decided: takes that bypass the app never animate.** The layout cuts or mixes in at final form like a normal SuperSource, with no snap and no flash. The app still tracks it as on air and restores final form after it leaves program.

### 4.2 Animation streamed over the network will stutter

Sending box updates from the PC once per frame means UDP timing, Windows scheduler jitter and switcher frame boundaries all show up as uneven motion. It might be acceptable, or it might not. This is the single biggest technical risk.

**Proposed fix:** bake each animation into a switcher macro, with one frame pause between steps. The switcher runs it in sync with its own frame clock, so motion is frame-accurate whatever the PC is doing. atem-connection (the TypeScript library Companion uses) includes a macro upload transfer, so the app can generate macros and upload them directly. Third-party tools already animate SuperSource boxes with macros, so the approach is proven.

Streaming stays useful for the in-app "test on preview" button and as a fallback. Both paths get tested in phase 0 before anything else is built.

### 4.3 Art layer (resolved)

Art in front of the boxes would hide a full-screen start state behind the background, and baked outlines can't follow moving boxes. Resolved: animated designs use the plain Slide 01 background with **art behind** the boxes, and the cutout slides are guides in the designer only (§3).

One thing left to check in phase 0: whether a moving box looks unfinished without an edge. If it does, use SuperSource borders on the Constellations (ATEM software 9.6.2 or later) and find out whether the Production Studio 4K has them.

### 4.4 Slides 05 and 06 need more boxes than one engine has

One SuperSource engine has four boxes. Slide 05 needs five, slide 06 needs six. Options:

- **4 M/E:** cascade. Engine 2 renders part of the grid, and engine 1 uses it as a box source. This works for static layouts but complicates animation.
- **Any model:** put extra boxes on upstream DVE keys on the M/E over the SuperSource. The number of DVEs varies by model.
- Mark them "static only" for now.

Decided: static only in v1. Revisit in phase 6.

### 4.5 Box stacking order

The box that starts full screen must be on top, but which box that is depends on what was on program. For slide 10, box B is on top when coming from the camera, and box A is on top when coming from the slides.

Fix: the designer works with named **objects**, not box numbers. The app assigns box numbers per transition, with the matched object in box 1. With baked macros this costs nothing, because the macro rewrites every box at the snap anyway.

### 4.6 Animating crop and size together wobbles

If X, size and crop each move linearly from start to end, the visible edges of the box don't move linearly. An edge can drift backwards before going forwards. Fix: interpolate the **visible rectangle** (left, right, top and bottom edges on screen) plus the image scale, then solve for the ATEM X/Y/size/crop values each frame.

### 4.7 Matching through M/Es isn't exact

"ME2 showing Camera 1" only looks like Camera 1 if ME2 has no upstream keys on air. If ME2 has a lower third keyed on, the invisible cut drops the key. Matching rules are in §6.

### 4.8 Changing a layout while it's on air

Loading a different design into an engine that is on program changes the program output instantly. The app should block that, or, on a 4 M/E, load into the idle engine instead (§7, A/B engines).

### 4.9 Knowing when a layout is "on air"

SuperSource can reach program through ME1 directly, through ME2 into ME1, or through an aux. Use the switcher's source tally for the SuperSource input rather than just ME1's program bus.

### 4.10 Shared switcher resources

Media players, media pool slots and macro slots are shared with the rest of the show. The app should use only a range reserved in Setup (for example macros 80 to 99, stills 15 to 20) and never touch anything outside it.

### 4.11 4K video modes

The templates are 1080. If a switcher runs in 2160p, stills must be 3840×2160. Box geometry is resolution-independent because ATEM units are normalised, but the app should warn when a still doesn't match the video mode.

### 4.12 Smaller items

- **Name (decided: SuperDuperSource).** "SuperSource" is still Blackmagic's feature name, so the app describes itself as "for Blackmagic ATEM switchers", says "not affiliated with Blackmagic Design" on the download page and in the About box, and uses no Blackmagic logos. In the UI, "SuperSource" only ever means the switcher feature.
- **Code signing (decided: sign it).** Azure Trusted Signing is the first option to check: cost, and whether an individual in NZ can get verified. If it can't, fall back to an OV certificate from a commercial CA on a hardware token or cloud HSM. Signing runs in the release workflow, so every installer and auto-update is signed.
- **Licence (decided: MIT).** Covers the app, the core package and the Companion module, which also keeps the module eligible for Bitfocus's module list.
- **Connection limit.** Companion's ATEM module, ATEM Software Control and this app each hold a connection to the switcher. ATEMs limit concurrent clients, so check how many the target models allow.

---

## 5. How it runs

### 5.1 States per engine

```
            load design
  IDLE ───────────────────▶ ARMED (final form, on preview or unused)
                                │
                     take IN    │  (smart macro / Companion / app)
                                ▼
                      SNAP to start state ─▶ CUT ─▶ ANIMATING IN
                                                        │
                                                        ▼
                                                     ON AIR (final form)
                                                        │
                                          take OUT      │
                                                        ▼
                         ANIMATING OUT ─▶ CUT to target ─▶ RESTORE final form ─▶ ARMED
```

- After any exit, the layout returns to final form within a frame of leaving program, so it's ready for preview again.
- The take OUT target is whatever is on preview. If it matches no box, it falls back to a plain cut or mix.
- Takes run on ME1 by default. When the layout is built on ME2 and fed into ME1, the take runs on whichever M/E has the layout on its preview. Setup can override this.

### 5.2 Smart macros

The app reserves a few macro slots per engine and keeps them current:

| Slot | Content |
|---|---|
| `SS1 IN` | Snap, cut, and the animation for **whatever is on program right now** |
| `SS1 OUT` | Animation to **whatever is on preview right now**, cut, restore |
| `SS1 AUTO` | IN or OUT depending on whether SS1 is on air |

Whenever program, preview or the loaded design changes, the app regenerates and re-uploads the affected macros. Upload size is a few KB, so it should take well under a second. Phase 0 measures the real time.

At 1080p50 one frame is 20 ms, so a 700 ms move is 35 macro steps.

What this gets:

- Companion's `SS CUT` / `SS AUTO` buttons run these macros, so the motion is frame-accurate.
- **If the app crashes, the last-uploaded macros still work.**
- Panel macro buttons can do the same take as a backup.

Risk: someone presses `SS1 IN` in the half-second after program changed, before the re-upload finishes. Mitigation: re-upload on preview/program change is fast, and the app can show a "macro stale" warning in Companion.

### 5.3 Box allocation per transition

For every design and every object that can be matched, the app generates:

- IN from that object full screen
- OUT to that object full screen

and assigns box numbers so the full-screen object is box 1. Slide 10 gets four transitions: IN from camera, IN from slides, OUT to camera, OUT to slides.

Each of these is designed on its own. OUT to camera doesn't have to be IN from camera played backwards: it can use different timing, easing and paths for the other boxes. The designer starts each new transition from a default (the reverse of the matching IN if that was customised, otherwise the other boxes are pushed by the full-screen one) so you only edit the ones you care about.

---

## 6. Source matching rules

The program source **P** is what's on air before the take. **S** is an object's source in the layout. A match picks which object starts full screen.

| Case | Match? |
|---|---|
| P = S (same input) | Yes |
| P is ME*n*, S is input *I*, ME*n* program = *I*, no USKs on air in ME*n* | Yes |
| P is input *I*, S is ME*n*, ME*n* program = *I*, no USKs on air | Yes |
| P and S are both M/Es that resolve to the same input, no keys | Yes |
| Resolves to the same input, but USKs are on air in that M/E | Configurable: animate (keys drop at the cut), or don't animate. Default: don't, and show why in the app |
| ME*n* is mid-transition | No |
| P is a SuperSource (same engine, another design) | Layout morph, see §7 |
| Nothing matches | Plain cut, no animation |
| More than one object matches | Use the designer's priority order. Default: largest final box |

DSKs on ME1 are downstream of everything and stay put through the animation. Upstream keys on ME1 follow the "next transition" selection as normal, so the app warns if a key is tied to the take.

The same rules decide the OUT animation, using the preview source instead of program.

---

## 7. Further suggestions

- **Test on preview.** A button in the Design tab plays the animation on the engine while it's on preview only (blocked when on air). Watch it on the multiview.
- **Auto-create boxes from cutouts.** Drop in a PNG, and the app reads the alpha channel and offers boxes snapped to each hole (what produced the table in §3).
- **Roles instead of raw inputs.** Designs refer to sources like `Presentation`, `Static` or `Wide`. The Sources tab maps them to inputs per venue, so a design built at one site works at another without editing.
- **Layout morph (Keynote "Magic Move").** On the same engine, going from slide 10 to slide 11 while on air: box A stays put, the side box splits into two. A big visual payoff, and the same interpolation code.
- **A/B engines on the 4 M/E.** While SS1 is on air, the next design loads into SS2. Taking SS2 can morph between them if the backgrounds match.
- **Show files.** Export and import a show (designs, groups, stills, role names) as one file for moving between venues and switchers.
- **Offline design mode.** Design without a switcher connected, using placeholder colours for sources.
- **Take log.** A short history of what went to air and which transition ran, for spotting problems after a show.

---

## 8. The app

Small, resizable window (about 1100×700, minimum 960×600). Icon rail on the left with three tabs. Dark UI. A connection and tally strip along the top shows the switcher, its video mode, and each engine's state (idle / preview / program).

### 8.1 SuperSources tab (gallery)

- **Grid (centre):** the **show shortlist**, the designs active for today's show. There's no limit on how many. Each card is a thumbnail rendered from the background still with source labels drawn into each box. A card shows its state (red = program, green = preview, plain = not loaded), which engine it's loaded in, and which transitions are available right now ("IN from Presenter", "no match").
- **Library (right):** all designs, in collapsible groups. Drag a design into the grid to add it to the shortlist. Groups grow and shrink as designs are added or removed.
- Click a shortlisted card to load it into a free engine and put that engine on preview. "Free" means not on air. On a 2 M/E there's one engine, so loading is blocked while the current layout is on program. On a 4 M/E it uses whichever engine isn't on air.

### 8.2 Design tab

- **Canvas:** the background still at 16:9, with draggable and resizable boxes. An optional guide overlay (one of the cutout slides) sits on top for alignment and never goes to the switcher. Snaps to guide cutouts, the centre, other boxes, and round ATEM values.
- **Inspector:** X, Y, size and crop in ATEM units, with pixel values alongside. Source or role picker. Matching priority.
- **Objects list:** names and sources. No box numbers, which the app assigns (§4.5).
- **Transition picker:** one tab per transition the design can do, generated from its objects: "IN from Presenter", "IN from Slides", "OUT to Presenter", "OUT to Slides". Picking one shows its timeline and plays it on the canvas.
- **Motion,** per object, within the selected transition:
  - The matched object's start (IN) or end (OUT) is fixed at full screen.
  - Every other object: offscreen left/right/top/bottom, scale from centre, crop wipe from an edge, already in place, or **pushed**: it rides against the full-screen box's edge with its final gap, on that box's timing, so the slides push the presenter off and pull it back in. Added 31 Oct 2026 with a *Slides + presenter (push)* copy of Slide 10 that uses it in all four transitions.
  - **Pushed is the default** (since 1 Nov 2026) for any box without its own motion. Boxes that overlap by up to 0.25 units (15 px, the bleed used to cover template outlines) still count as touching. A box that overlaps the full-screen box properly both ways has no edge to push against and stays in place. The original *Slides + presenter* keeps its custom motions (presenter revealed, slides sliding in).
  - **Starter set 2** (1 Nov 2026). The app ships two groups, *Default Pres* and *Default Grid*, and the default IN and OUT are 850 and 750 ms (were 700 and 600):
    - Default Pres: *Slides + Presenter* (pushed; replaces the original, which no longer ships), *Slides + Two Presenters* (pushed for the slides, boxes in place for the cameras), *Slides + Three Presenters* (pushed), *Two Presentations* (two 16:9 boxes at 49%, x ±7.9, pushed).
    - Default Grid: *Two Presenters* and *Three Presenters* (other boxes in place) with a *Push* variant of each, and *Four Grid* (other boxes in place).
    - Saved shows are updated once on load: starter layouts are replaced by these, the original Slides + presenter is swapped for the pushed one on the shortlist, and layouts in the old groups move to the new ones. Layouts the user made are kept.
  - Duration, delay (for staggering), easing (presets plus a curve editor).
- **Timeline:** one track per object, so the stagger is visible.
- **Test on preview** (§7).

### 8.3 Setup tab

- **Switcher:** list of ATEMs found by Bonjour/mDNS (`_blackmagic._tcp`, TXT `class=AtemSwitcher`, the same query Companion uses), plus manual IP. Shows model, firmware, protocol version, video mode, engine count, media players and macro slots.
- **Reserved resources:** macro slot range, media pool still range, which media player(s) to use for backgrounds.
- **Roles:** role → input mapping, using input names pulled from the switcher.
- **Behaviour:** which M/E takes run on (default ME1, §5.1), whether to animate when keys are on air (§6).
- **Companion:** local API port, connection status, connected clients.
- **App:** start with Windows, start minimised to tray, check for updates.

---

## 9. Companion module

Built (`apps/companion`, module id `kennedys-superdupersource`). It talks to the **app** over a local WebSocket, not to the switcher: the app owns timing and state, and Companion is a remote with tally. Targets Companion module API 2.0, so it runs on Companion 4.3 and later.

**Link.** The app listens on port 8710, on 127.0.0.1 only unless "Allow Companion on another computer" is on in Setup. The messages are typed in `packages/protocol`. The app pushes state whenever something a button shows changes, and always before it answers a request, so a button never shows a finished take as still running. The module reconnects every 2 seconds if the app goes away.

**Presets:**

- **Takes:** `SS CUT` (animated take in or out; a plain cut when nothing matches), `SS AUTO` (the same, but a mix when nothing matches), and a *Next take* display button. Take buttons go orange when an animated take is ready, grey when only a plain cut or mix is possible, white while a take runs.
- **Layouts:** one group per library group, shortlisted layouts first. Press loads the layout into a free SuperSource and puts it on preview. Green on preview, red on program, grey when loaded but on neither.

**Actions:** load layout, SS CUT, SS AUTO. **Feedbacks:** layout tally, take ready (animated / plain / either), take running. **Variables:** `next_take`, `next_detail`, `next_animated`, `switcher`, and `ssN_layout` / `ssN_state` per SuperSource.

Presets and dropdowns are rebuilt when the library changes (a layout added, renamed or regrouped), not on every tally change.

Tested end to end against the app's real server with the simulator underneath (load, IN, OUT, SS AUTO mixing, errors, reconnecting, port clashes), and against the built Electron app. Not yet tested inside Companion itself. `npm run build` then `npm run package` in `apps/companion` produces the `.tgz` Companion imports.

Once smart macros exist (§5.2), the take buttons could also be plain "run macro" buttons on Companion's own ATEM module, which would keep working with the app closed, minus the live feedback.

---

## 10. Data model (draft)

```jsonc
{
  "id": "slide-10",
  "name": "Slide 10: Slides + presenter",
  "group": "Main + side column",
  "background": { "file": "Slide_01.png", "mediaPoolSlot": 16, "artLayer": "background" },
  "guide": "Slide_10.png",
  "objects": [
    {
      "id": "A", "name": "Slides", "source": { "role": "Slides" },
      "final": { "x": -4.0, "y": 0.0, "size": 0.75, "crop": { "t": 0, "b": 0, "l": 0, "r": 0 } },
      "matchPriority": 2
    },
    {
      "id": "B", "name": "Presenter", "source": { "role": "Presenter" },
      "final": { "x": 12.0, "y": 0.0, "size": 0.5, "crop": { "t": 0, "b": 0, "l": 8.0, "r": 8.0 } },
      "matchPriority": 1
    }
  ],
  // one entry per (direction, matched object); the matched object is full screen at the start (in) or end (out)
  "transitions": {
    "in:B": {                       // IN from Presenter full screen
      "B": { "durationMs": 700, "delayMs": 0,  "easing": "easeInOutCubic" },
      "A": { "from": "in-place",       "durationMs": 0 }      // revealed as B shrinks
    },
    "in:A": {                       // IN from Slides full screen
      "A": { "durationMs": 700, "delayMs": 0,  "easing": "easeInOutCubic" },
      "B": { "from": "offscreen-right", "durationMs": 600, "delayMs": 120, "easing": "easeOutCubic" }
    },
    "out:B": {                      // OUT to Presenter (on preview)
      "B": { "durationMs": 600, "delayMs": 0,  "easing": "easeInOutCubic" },
      "A": { "to": "offscreen-left",   "durationMs": 500, "delayMs": 0, "easing": "easeInCubic" }
    },
    "out:A": {                      // OUT to Slides (on preview)
      "A": { "durationMs": 600, "delayMs": 0,  "easing": "easeInOutCubic" },
      "B": { "to": "offscreen-right",  "durationMs": 400, "delayMs": 0, "easing": "easeInCubic" }
    }
  }
}
```

Transitions that are missing fall back to the default (the reverse of the matching IN, or slide off the nearest edge).

---

## 11. Tech stack (proposed)

| Part | Choice | Why |
|---|---|---|
| Desktop app | Electron + TypeScript | atem-connection is a Node library, and the Companion module is Node too, so both share one core package |
| Switcher control | atem-connection | Used by Companion. Covers SuperSource, tally, media pool upload and macro upload |
| UI | React, small component set, no UI kit | Compact custom UI |
| Animation timing | Baked macros on the switcher. Streaming from a worker thread as fallback | §4.2 |
| Companion module | companion-module-base (TypeScript) | Standard |
| Installer and updates | electron-builder (NSIS) + electron-updater | Auto-update from releases |
| Download page | Static site on CapRover, auto-built from GitHub | Same pipeline as other kennedys.nz apps |

Repo layout:

```
superdupersource/
  packages/core/        design model, geometry, matching rules, take planning, engine, simulator (built)
  apps/desktop/         Electron app; its renderer also runs in a plain browser on the simulator (built)
  apps/companion/       Companion module (built)
  packages/protocol/    types for the app <-> Companion link (built)
  apps/site/            download page and release notes (built; superdupersource.kennedys.nz)
  spike/                phase 0 hardware tests (built, not yet run)
  Supersources-templates/  backgrounds and layout guides
```

Alternative considered: a .NET app using Blackmagic's official ATEM SDK. It's well documented for SuperSource, but the SDK is Windows COM and depends on ATEM Software Control being installed, and none of it can be shared with the Companion module.

---

## 12. Download page

Built (`apps/site`), served at `superdupersource.kennedys.nz` by CapRover, which rebuilds it from the GitHub repo on every push to `main`.

- Styled like the app since the 1 Nov 2026 redesign: greys and black, 2px corners, and the top bar as tabs (Overview, Releases, GitHub).
- The hero is a live canvas running the real Slides + Presenter transitions (pushed, opening on the finished layout, then out to the slides and back, out to the camera and back), drawn as flat boxes the way the app draws them, so there's no video to keep in sync with the app.
- The in-browser demo at `/demo` was dropped on 1 Nov 2026; old links go to the home page.
- One short page: a line on what it does, the animation, three steps, downloads and requirements. No logo; the name is written SuperDuperSource.kennedys.
- The download rows read the latest GitHub release at load time and link the `.exe` and the Companion `.tgz`.
- `/releases/` lists every GitHub release, newest first, with its notes and downloads. Notes come from `release-notes/v<version>.md`, which the release workflow publishes.
- Supported switchers, honestly labelled (first to be tested / planned), and "not affiliated with or endorsed by Blackmagic Design" in the footer.
- Light and dark themes, phone layout down to 375 px.

Still to do with phase 5: a release workflow that builds and signs the installer and attaches it, with the module `.tgz`, to a GitHub release.

---

## 13. Roadmap

**Phase 0: hardware spike.** Answer these on the 2 M/E Production Studio 4K before building anything else. The scripts are in `spike/`, and `spike/README.md` explains how to run them and has a results sheet to fill in:

1. Stream box updates once per frame from Node. Record the program output and check for dropped or doubled steps.
2. Generate a macro with per-frame steps, upload it, run it. Smoothness? Upload time? Size limit per macro?
3. Confirm box 1 draws on top, and the exact coordinate and crop ranges.
4. Do moving boxes need a border over the plain Slide 01 background? Does the Production Studio 4K have SuperSource borders?
5. Does mDNS discovery work on the venue network?
6. How many simultaneous control connections does each model allow?

**Building without hardware (in progress, started 31 Oct 2026).** No switcher until the next job, so everything that doesn't need one is built against a simulated switcher. The engine talks to a `Switcher` interface; `SimSwitcher` implements it on its own frame clock, running ops exactly as a macro would (everything up to a wait in one frame). The ATEM adapter implements the same interface later. Done so far:

- `packages/core`: design model, screen-space interpolation, per-source IN/OUT transitions with defaults (OUT reverses a custom IN), source matching (§6), take plans as frame-by-frame ops, the engine state machine (load, next take, take, bypass takes never animate), the simulator, and starter designs from slides 10, 11, 12, 02, 03 and 04. 28 tests.
- `apps/desktop`: tray app with the SuperSources, Design and Setup tabs, plus a Simulator view standing in for the multiview and panel. Design tab: drag, resize and crop boxes, fit a box to a guide cutout in one click, and edit and play every IN/OUT transition.

**Phase 1: ATEM connection (built 31 Oct 2026, untested on hardware).** `packages/atem` has `AtemSwitcher`, which implements the same `Switcher` interface as the simulator over atem-connection:

- Connects by IP; atem-connection reconnects on its own, and the app shows connecting / connected in the title bar and Setup.
- Reads the model, video mode, M/E count, SuperSource and box counts from the switcher rather than assuming a model.
- Maps the switcher's state (buses, transitions, upstream keys, SuperSource boxes and art, auxes, input names) to the core's state, so matching and tally work unchanged.
- Runs take ops by streaming: each frame's box moves go out as one batch, scheduled against absolute times. Windows timers tick every ~15.6 ms, so it sleeps only while more than a tick remains and yields with `setImmediate` for the rest; measured lateness is under 0.05 ms, against 12 ms with plain `setTimeout`. (The spike had the same problem and is fixed too.)
- Discovery: Bonjour plus a /24 scan, behind "Find switchers" in Setup.
- After a reconnect, loaded layouts are carried over without sending anything to the switcher. A take that fails partway reports why and doesn't leave a layout stuck mid-animation.

Tested with a fake switcher built on atem-connection's own state object (load, IN, OUT, frame timing, reconnects), and in the built Electron app pointed at an address with no switcher. To finish phase 1 on hardware: run phase 0, connect, and use Slide 10 in a real show. Setup shows how late the PC sent the last take's frames, as a timing check.

Found while building: a take macro can't be made by *recording*, because recording executes each command live, cut included. Smart macros need the macro binary format so the app can write them directly. The phase 0 macro test saves downloaded macro bytes for exactly this; until then, takes stream from the PC.

**Phase 2: Design tab.** Mostly built on the simulator. Left: test on preview against a real switcher, snapping while dragging to cutout edges.

**Phase 3: Gallery.** Library, groups, shortlist and roles are built. Left: media pool upload of backgrounds.

**Phase 4: Companion module.** Built and tested against the app; still to be tried inside Companion.

**Phase 5: Distribution (built 31 Oct 2026, except signing).**

- NSIS installer from electron-builder 26 (`npm run dist -w @sds/desktop`): per-user install, choice of folder, desktop shortcut, MIT licence page. 128 MB, almost all of it Electron.
- Auto-update with electron-updater from GitHub releases: checks 15 s after start and every 6 hours, downloads in the background, installs on quit or when the operator presses Restart and update. It never restarts by itself, because that would take the Companion buttons away mid-show.
- `.github/workflows/release.yml`: on a `v*` tag it checks the tag matches the app and module versions, runs tests and type checks, builds the installer and the Companion `.tgz`, and publishes a GitHub release with the `.exe`, `.blockmap`, `latest.yml` and `.tgz`. `npm run bump <version>` keeps the versions in step.
- Smoke-tested the packaged app: it starts, serves the Companion API, loads atem-connection's worker inside the archive in ATEM mode, and the window renders with the preload bridge working.
- Signing: wired for Azure Trusted Signing through `azureSignOptions`, switched on only when the `AZURE_*` secrets exist. Still to do: the Azure account and identity verification, then add the secrets. Until then installs show a SmartScreen warning.

**UI redesign (1 Nov 2026).** Built from the handoff in `UI Redesign Planning/`:

- A top bar replaces the left rail. The look is greys and black with 2px corners and no icons. Red and green only mean no connection, connected and destructive.
- *SuperSources* is now the Active SuperSources grid, in Companion button order, with the Library docked on the right. There's no SS CUT in the app; takes come from Companion.
- *Design* has the Library on the left, the canvas with Grids and Templates overlays, the animation panel along the bottom and the box properties on the right. Edits stay as a draft until Save design, with 100 steps of undo.
- *Sources* holds ten fixed sources: Presentation 1 to 4, Static, Wide, Camera 3 to 6. The old roles move across when a show loads (Slides is now Presentation, Presenter is Static, Guest is Camera 3), keeping their inputs.
- *Setup* is one column. The simulator switch moved under Debug, and the Simulator page is gone.
- Layouts can be locked box by box, pick their own background media player, and keep the library's group order (including empty groups) in settings.
- Interpolation now blends the visible edges and the size, then solves position and crop, so an edge that starts and ends in the same place never moves.
- New starter: *Two presentations* (Grid), two 16:9 boxes with the same 0.8 unit margin at the edges and between them.
- Companion has no outside way to install a module, so Install saves the module from the latest release to Downloads and shows it; the last step is Modules, Import module package in Companion.

**Phase 6: Extras.** Layout morph, 4 M/E A/B engines, 5 and 6 box layouts, show files.

---

## 14. Writing and UI rules

- Every UI string, doc and page goes through `unslop` and `human-voice-check` before it ships.
- UI: no gradient blobs, no emoji as icons, no generic card grids with icon + title + blurb. Show real data: source names, tally state, ATEM numbers in tabular figures.
- Colour: tally red and green mean program and preview everywhere, and nothing else uses them. One accent colour, possibly taken from the template orange.
- Microcopy says what will happen ("Loads Slide 10 into SuperSource 1 and puts it on preview"), not what the feature is called.

---

## 15. Open questions

**Answered**

- **Q1.** Art layer: behind. Animated designs use the Slide 01 background; cutout slides are for static layouts and serve as guides.
- **Q2.** "Active" means a show shortlist.
- **Q3.** Takes go through Companion / Stream Deck.
- **Q4.** 1080p50.
- **Q5.** The tracking camera auto-tracks, so box B's crop stays fixed.
- **Q6.** Both routes happen. ME1 is the default.
- **Q7.** Use defaults: macros 80–99, media pool stills 15–20, media player 2. All changeable in Setup.
- **Q8.** Public: public repo, GitHub Releases, public download page.
- **Q9.** Windows only.
- **Q10.** Takes that bypass the app never animate.
- **Q11.** OUT animates towards whatever is on preview, and each preview source can have its own out animation (as each program source has its own in).
- **Q12.** 5 and 6 box layouts are static only in v1.
- **Q13.** No match: plain cut.

- **Q14.** Name: SuperDuperSource (.kennedys).
- **Q15.** Sign the Windows installer.
- **Q16.** MIT licence.

All questions are answered, so the next step is the phase 0 hardware spike (§13).
