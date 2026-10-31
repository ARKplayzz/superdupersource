## SuperDuperSource

Animated SuperSource takes for Blackmagic ATEM switchers. This module doesn't talk to the switcher. It talks to the SuperDuperSource app on the control PC, which runs the takes and sends back tally.

### Setup

1. Start SuperDuperSource on the control PC.
2. Add this connection. If Companion runs on the same PC, leave the address as `127.0.0.1` and the port as `8710`.
3. If Companion runs on another computer, switch on **Allow Companion on another computer** in the app's Setup tab, then put the control PC's address here.

The connection shows OK once it's talking to the app. The app's Setup tab shows how many Companions are connected.

### Buttons

The quickest start is the presets.

**Takes**

- **SS CUT** runs the animated take. If a layout is on preview, it animates in from what's on program. If a layout is on program, it animates out to what's on preview. When nothing on the bus matches a box in the layout, it does a plain cut.
- **SS AUTO** is the same, except that when nothing matches it does the M/E's mix instead of a cut.
- **Next take** is a display button that shows what SS CUT will do next.

The take buttons turn orange when an animated take is ready, grey when only a plain cut or mix is possible, and white while a take is running.

**Layouts**

One button per layout, grouped the same way as the app's library, with shortlisted layouts first. Pressing one loads that layout into a free SuperSource and puts it on preview. The button turns green on preview and red on program, and goes grey when the layout is loaded but on neither.

### Actions

- **Load layout to preview**
- **SS CUT**
- **SS AUTO**

### Feedbacks

- **Layout tally**: the layout is on program, on preview, or loaded
- **Take ready**: an animated take, a plain one, or either is ready
- **Take running**

### Variables

- `next_take`, `next_detail`, `next_animated`
- `switcher`
- `ss1_layout`, `ss1_state` (and `ss2_…` on switchers with two SuperSources)

### Takes made elsewhere

Takes from the switcher panel or ATEM Software Control never animate. The layout goes to air as a normal SuperSource. Use SS CUT or SS AUTO to get the animation.
