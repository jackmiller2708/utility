---
name: Utility Platform
description: A risograph print studio for local-first media transformation — designers & creators, not developers
colors:
  primary: "#FF3EA5"
  primary-hover: "#D91E85"
  primary-subtle: "#3D1730"
  secondary: "#0078BF"
  secondary-hover: "#005B94"
  accent-success: "#12A66B"
  accent-warning: "#E8A200"
  accent-danger: "#E23B2E"
  canvas-bg: "#16130F"
  canvas-elevated: "#1E1A14"
  canvas-border: "#332C21"
  canvas-text: "#EFE6D2"
  canvas-text-muted: "#B4A98D"
  neutral-bg: "#16130F"
  neutral-surface: "#F6F0E3"
  neutral-elevated: "#FCF8ED"
  neutral-border: "#D9CEB4"
  neutral-border-subtle: "#E7DFC8"
  neutral-text: "#221D16"
  neutral-text-muted: "#6E6656"
  neutral-text-subtle: "#9C927A"
typography:
  display:
    fontFamily: "Archivo, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "clamp(1.875rem, 3.2vw, 2.5rem)"
    fontWeight: 900
    lineHeight: "1.1"
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Archivo, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 800
    lineHeight: "1.25"
    letterSpacing: "-0.005em"
  title:
    fontFamily: "Archivo, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "1rem"
    fontWeight: 700
    lineHeight: "1.35"
    letterSpacing: "0em"
  body:
    fontFamily: "Archivo, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: "1.55"
    letterSpacing: "0em"
  label:
    fontFamily: "Courier Prime, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "0.75rem"
    fontWeight: 700
    lineHeight: "1.4"
    letterSpacing: "0.04em"
rounded:
  sm: "1px"
  md: "2px"
  lg: "3px"
  xl: "4px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  xxl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.neutral-text}"
    rounded: "{rounded.sm}"
    padding: "10px 18px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.neutral-text}"
    rounded: "{rounded.sm}"
    padding: "10px 18px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.secondary}"
    rounded: "{rounded.sm}"
    padding: "10px 18px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.canvas-text-muted}"
    rounded: "{rounded.sm}"
    padding: "10px 18px"
  card:
    backgroundColor: "{colors.neutral-surface}"
    textColor: "{colors.neutral-text}"
    rounded: "{rounded.md}"
    padding: "24px"
  input:
    backgroundColor: "{colors.neutral-elevated}"
    textColor: "{colors.neutral-text}"
    rounded: "{rounded.sm}"
    padding: "10px 12px"
---

# Design System: Utility Platform

## Overview

**Creative North Star: "The Print Run"**

Utility Web is redesigned as a risograph studio, not a developer console. Every transformation is staged like a job going through the press: the source file is a plate, each output format or size is one spot-color pass, and the finished artifact is a printed sheet pulled off the drum and set out to dry. Designers and creators already read this world fluently — it is the world of zines, small-run posters, and DIY publishing, not command lines or telemetry dashboards. Nothing here is a photo of a risograph; it is that print shop's actual grammar rebuilt as interface: flat spot-color ink, cut-paper edges, registration crosses, one ink at a time.

The system runs on two surfaces at once. The **press room** — a warm, near-black canvas, the room the machine sits in at night — carries navigation, chrome, and atmosphere. Every sheet of actual work — every form, every panel, every number the user must read — sits on **paper**: a warm uncoated cream stock lifted off that dark table, carrying dark ink text at real contrast. The press room sets the mood; the paper does the reading. This is deliberate and load-bearing: it lets the studio feel unmistakably like a print shop after dark while keeping every parameter form, every dimension, every file size exactly as legible as a spec sheet has to be.

Color is earned like ink, not decoration. A risograph print costs one run per color — so the interface spends spot color the same way: pink for the one action that matters, blue for information, mint and gold and red for outcome states, and nothing else. The rest of the surface is paper and press-room neutral. This also happens to be the right call for the tool's real audience: designers judging a resize or a format conversion need to trust the numbers before they trust the mood.

**Key Characteristics:**
- **Press Room, Paper Sheets**: Dark ink-black canvas for chrome and wayfinding; warm cream paper cards for every working surface, form, and readout.
- **One Ink at a Time**: Spot color (pink, blue, mint, gold, red) is reserved for action and state — never decoration, never more than one dominant ink per view.
- **Cut-Paper Geometry**: Square-cut corners, deckle-edge borders, and registration crosses stand in for the soft glass-panel rounding of a generic dashboard.
- **The Ink Ledger**: Every number a designer must trust — dimensions, file size, format, hash — sets in typewritten monospace, stamped like a job ticket, never floating loose in body type.

## Colors

The palette is a working ink set, not a brand gradient: a small number of named spot colors, each with exactly one job, laid over two neutral grounds (press-room dark, uncoated paper light).

### Primary
- **Riso Pink** (`#FF3EA5`): The one ink reserved for the action that commits — run the job, download the artifact, confirm a primary choice. Always paired with dark ink text, never white — a fluorescent spot color is the ground a darker ink prints on, not the ink itself.
- **Riso Pink, Second Pass** (`#D91E85`): Hover and active state — a second pass of the same plate, slightly heavier.
- **Riso Pink, Pooled** (`#3D1730`): A dark, ink-pooled tint for selected states on the press-room canvas — pink caught in shadow, not a pastel tint.

### Secondary
- **Riso Blue** (`#0078BF`): Informational ink — metadata, active navigation, secondary actions, links. Reads as "this is true right now," never "act on this."
- **Riso Blue, Second Pass** (`#005B94`): Hover state for blue actions and filters.

### Tertiary / Status Accents
- **Riso Mint** (`#12A66B`): Successful runs, completed jobs, positive size reductions.
- **Riso Gold** (`#E8A200`): Caution — connecting, queued, size inflation, anything worth a second look before it prints. Also an Overrun (below): a job the press's own capacity dropped, never the file's fault.
- **Riso Red** (`#E23B2E`): Misregistration — validation errors, rejected files, failed jobs the file or its parameters actually caused.

### Canvas (press room — dark, for chrome only)
- **Press Black** (`#16130F`): Root application canvas. A warm ink-black, not a cool neutral gray — this is a room, not a screen.
- **Press Elevated** (`#1E1A14`): Header bar, sidebar ground, anything that sits above the floor but is still furniture, not paper.
- **Press Line** (`#332C21`): 1px hairlines on the dark canvas.
- **Press Text** (`#EFE6D2`): Nav labels, section headers, and anything set directly on the dark canvas — an unbleached paper color, not white.
- **Press Text, Muted** (`#B4A98D`): Secondary chrome labels, inactive nav items, timestamps in the dark UI.

### Paper (working surfaces — light, for everything the user must read)
- **Stock** (`#F6F0E3`): The default card and panel ground — warm uncoated cream, never pure white.
- **Fresh Sheet** (`#FCF8ED`): Inputs, active fields, and anything that should read as the top sheet in the stack.
- **Deckle Edge** (`#D9CEB4`): Paper borders and card edges — a cut-paper line, not a UI-chrome line.
- **Hairline** (`#E7DFC8`): Sub-dividers inside a paper surface — table rows, list separators.
- **Ink** (`#221D16`): Primary text on paper — a warm near-black, the color of actual printed ink, never pure `#000`.
- **Ink, Muted** (`#6E6656`): Secondary copy, helper text, field descriptions.
- **Ink, Faint** (`#9C927A`): Placeholders, disabled hints, timestamps on paper.

### Named Rules
**The Overprint Rule.** A light spot ink (pink, gold, mint) always carries dark ink text; a deeper spot ink (blue, red) carries paper-cream or white text. This mirrors how a real riso print overprints black on a color pass, and it is also what keeps every colored surface at real reading contrast — never decorative color with guessed-legible text on top.

**The One-Ink Rule.** No view runs more than one dominant spot color at a time. A card, a form, a toolbar owns exactly one accent ink for its primary action; every other color in view is neutral (paper or press-room) until it is that surface's turn to matter.

**The Ledger Rule.** Anything the user must trust as fact — bytes, pixels, W×H, duration, a SHA-256 digest, a format name — sets in Courier Prime, tabular, stamped like a job ticket. Never render a number the user must trust in the body face.

## Typography

**Display/Headline/Title/Body Font:** Archivo, -apple-system, BlinkMacSystemFont, sans-serif
**Label/Ledger Font:** Courier Prime, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace

**Character:** A single grotesk family carries the whole interface voice — bold poster weights for headers (the loud caps of a zine masthead or a rubber-stamped cover), regular weight for reading copy — paired with an actual typewriter face for anything technical, evoking a caption typed straight onto a plate rather than a developer's terminal font. No serif, no script: this is a working shop, not a boutique.

### Hierarchy
- **Display** (Black 900, `clamp(1.875rem, 3.2vw, 2.5rem)`, `1.1` line-height, tight tracking): Masthead headers and major tool titles — set like a zine cover line.
- **Headline** (Extrabold 800, `1.25rem` / `20px`, `1.25` line-height): Card headers, job titles, panel sections.
- **Title** (Bold 700, `1rem` / `16px`, `1.35` line-height): Form section labels, modal headers, sidebar group names.
- **Body** (Regular 400, `0.9375rem` / `15px`, `1.55` line-height, max 70ch): Field labels, helper copy, explanations, system messages — Archivo reads cleanly at body size, unlike most display grotesks.
- **Label/Ledger** (Bold 700, `0.75rem` / `12px`, `1.4` line-height, `0.04em` tracking): Courier Prime, uppercase where used as a tag — stamped job-ticket tags, dimension readouts, hashes, status pills.

### Named Rules
**The Masthead Rule.** Display and headline sizes always carry the heaviest available weight (900/800) — a light or regular zine masthead is a contradiction in terms.

## Layout

**The Composing Table**: a dark press-room floor holding a fixed tool rail and a paper sheet where the actual job happens.

- **Composing Surface**: Responsive 12-column system (`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8`), unchanged in structure from the prior system — only its skin changes.
- **Plate Rail** (sidebar): Fixed 260px on desktop, rendered as a stack of tool tabs against the press-room ground (`bg-[#16130F] border-r border-[#332C21]`), each tool category a distinct tab; the active tab carries a small pink registration mark. Collapses on mobile.
- **Job Sheet** (workspace): Split two-column layout — parameter controls at 5 columns, live preview and comparison at 7 (`grid grid-cols-1 lg:grid-cols-12 gap-8`) — both rendered as paper (`bg-[#F6F0E3]`), floating on the press-room floor with a hard paper-lift shadow.
- **Spacing Scale**: Unchanged 4px rhythm (`xs: 4px` … `xxl: 48px`) — a structural fact of the app, not a visual one.

## Elevation & Depth

No glass, no soft glow. Depth reads as paper physically lifted off a table: a small, hard-edged, slightly warm shadow, never blurred into a glow.

### Shadow Vocabulary
- **Paper Lift** (`box-shadow: 2px 3px 0 rgba(22, 19, 15, 0.35)`): The standard card/panel shadow — a hard offset, like a sheet sitting a few millimeters above the surface below it, not floating.
- **Stamped Down** (`box-shadow: inset 1px 1px 0 rgba(34, 29, 22, 0.25)`): Pressed/active state for buttons and tabs — the ink just struck the paper.

### Named Rules
**The No-Glow Rule.** Nothing in this system emits light. Active and focus states are communicated by ink color and the registration mark, never by a blurred halo.

## Shapes

- **Radius Scale**: Nearly square throughout — this is cut paper, not glass.
  - Hairline (`rounded-sm: 1px`): Table rows, dividers.
  - Standard (`rounded-md: 2px`): Buttons, inputs, tabs.
  - Panel (`rounded-lg: 3px`): Cards, dropzones, preview frames.
  - Wide (`rounded-xl: 4px`): Large containers only.
  - Full (`rounded-full: 9999px`): Reserved exclusively for stamped status dots and ink-blot indicators — the one place a true circle belongs, because a rubber stamp is round.
- **Registration Cross**: A small `+` mark (two 8px hairlines, spot-color ink) in the corner of the active card, preview frame, or during a running job — a direct borrow from print registration marks, doing double duty as a loading/alignment indicator.
- **Borders**: 1px solid — `border-[#D9CEB4]` on paper, `border-[#332C21]` on the press-room canvas. No soft/faded borders.

## Marks & Icons

- **The Mark**: A filled square inside an open one — the export sitting inside the original. Drawn on a fixed 32-unit grid so it stays crisp from a tab favicon up to a splash screen: an outlined square (`stroke-width: 3`, `#221D16` ink or `#EFE6D2` paper) with a smaller solid square (`#FF3EA5`, riso pink) inset in its top-left corner. `BrandMarkComponent` (`src/app/ui/atoms/brand-mark/brand-mark.component.ts`) is the canonical implementation.
- **Default vs. Reversed**: `variant="default"` strokes in ink (`#221D16`) for use on paper surfaces; `variant="reversed"` strokes in paper (`#EFE6D2`) for use on the press-room canvas — the masthead in `header.component.html` uses `reversed` at `size="22"`, matching `--color-press` chrome.
- **One-colour marks**: for print/stamp/watermark contexts, the mark drops to a single ink — outline and inner square both the same color (ink-on-paper, paper-on-ink, or a second-pass spot color) — never the two-tone default outside actual UI chrome.
- **Favicon set**: generated by `apps/utility-web/scripts/generate-favicons.mjs` (run manually, not part of `npm run build` — its output is committed as static assets in `public/`). `favicon.svg` is the scalable primary icon; `favicon.ico` packs 16/32/48px raster frames for browsers that don't take SVG favicons; `apple-touch-icon.png` (180×180, `rounded-lg`-equivalent radius 6) covers iOS home-screen/bookmarks. At 16px the outline drops away entirely and the mark becomes two solid blocks — a hairline stroke would smear at tab size.

## Components

### Buttons
- **Shape:** Square-cut, `rounded-sm` (2px).
- **Primary:** Fill `bg-[#FF3EA5]`, text `text-[#221D16]` (dark ink on pink — never white), bold Archivo. Active state uses the Stamped Down shadow, not a scale transform — this is a press hitting paper, not a spring.
- **Secondary:** Transparent fill, 2px `border-[#0078BF]`, text `text-[#0078BF]`; hover fills solid blue with cream text — a "second pass" committing.
- **Ghost:** Transparent, text `text-[#B4A98D]` on the press-room canvas or `text-[#9C927A]` on paper; hover brings up the surface's ink color at low opacity.

### Cards & Panels
- **Corner Style:** `rounded-lg` (3px) — barely rounded, reads as cut, not molded.
- **Background:** `bg-[#F6F0E3]` (Stock) with `border border-[#D9CEB4]` (Deckle Edge), Paper Lift shadow against the press-room floor.
- **Internal Padding:** `16px`–`24px`.
- **Corner Mark:** Every primary panel carries a small registration cross or ticket-stub notch in one corner — the "this sheet is real" mark.

### Inputs & Selects
- **Style:** `bg-[#FCF8ED]` (Fresh Sheet), `border border-[#D9CEB4]`, text `text-[#221D16]`, `rounded-sm`, padding `10px 12px`. A ruled bottom-border echo (`border-b-2 border-b-[#221D16]`) under the value, like a fill-in field on a spec sheet.
- **Focus:** Border shifts to `border-[#FF3EA5]`; a small pink registration cross appears at the field's top-right corner instead of a glow ring.

### Dropzone / Upload Plate
- **Style:** Dashed cut-line border `border-2 border-dashed border-[#9C927A]` on a bare `bg-[#FCF8ED]` sheet — an unprinted plate waiting for a job. Large Display-weight instructional text, centered.
- **Active Drag:** A fluorescent pink wash bleeds in from the edges (`background: radial-gradient` from `#FF3EA5` at low opacity, edges only, never a full flood) with the border solidifying to pink — ink hitting the plate.

### Telemetry Badges & Ledger Tags
- **Style:** Small stamped ticket tags — `bg-[#FCF8ED]`, `border border-[#D9CEB4]`, text `text-[#221D16]`, Courier Prime, `rounded-sm`, padding `2px 8px`. Every byte count, dimension, and hash renders this way.
- **State Variants:** Success mint fill (`bg-[#12A66B]` / cream text), Warning gold fill (`bg-[#E8A200]` / dark ink text), Danger red fill (`bg-[#E23B2E]` / cream text) — colored only when reporting that specific state, neutral paper otherwise.

### Preset & Format Tiles
- **Style:** Small square-cut stamped tiles (`50%`, `25%`, `1080p`, `Square`, and each output format) — `bg-[#FCF8ED]` idle, `border border-[#D9CEB4]`; selected state fills `bg-[#0078BF]` with cream text, like a chosen plate punched into the rail.

## Motion

Motion is the press running, made visible. Two engines, split by what the moment needs, never mixed on the same transition.

**CSS** owns simple one-property shifts and the two continuous loops: hover/active/focus color and border transitions (`duration-tick: 120ms`, `duration-shift: 200ms`, `duration-press: 400ms`, `ease-run: cubic-bezier(0.16, 1, 0.3, 1)` — all Tailwind theme tokens in `styles.css`), Waiting Ink (`.pulse-slow` / `.pulse-fast`, the existing `ink-pulse` keyframe — pending/queued and connecting states), Index Turn (`.reg-cross-spin`, the existing `reg-spin` keyframe — running states, unchanged since it already meant "the press is running"), and Struck Plate (`.struck-plate` — a cancelled job's one-shot desaturate-and-strike).

**Motion (motion.dev)** owns anything that needs sequencing, spring physics, an exit an `@if` can't hold open for, or a stagger — wired through `MotionService` (`core/services/motion.service.ts`), never called ad hoc from a component. Every Motion-driven moment shares one spring character — critically damped, no overshoot (`{ type: 'spring', bounce: 0 }`) — so "confident arrival, never bounce" is one preset, not a per-component tuning exercise. Its real justification is interruption: a batch of several jobs updates rapidly and out of order, and a spring retargets smoothly mid-flight where a restarted CSS keyframe would snap.

### Named patterns
- **Waiting Ink** *(CSS)* — pending/queued, gold pulse.
- **Index Turn** *(CSS)* — running, the registration cross spins.
- **Odometer Tick** *(Motion)* — a ledger number's `scale` retargets on every increment instead of restarting, so a fast run of progress updates never stutters.
- **Pulled Sheet** *(Motion, the system's one authored focal moment)* — a job completing: content lifts clear, border sharpens, a mint stamp lands. The same call fires whether the surface is a tray ticket or a workbench's results grid — one completion moment, reused, never re-invented per surface.
- **Misregistration** *(Motion)* — a failed job snaps 2px out of register in red, then back — literally what the ink calls a bad print, never a generic shake. Only for a failure the file or its parameters actually caused.
- **Overrun** *(Motion)* — a job the press itself dropped (the server hit its own capacity limit, restarted, and lost the job mid-run) rather than one the file broke: a steady gold registration cross replaces the status icon, the ticket's border shifts to gold, and it settles with a plain no-overshoot fade — never the Misregistration snap, which would wrongly blame the input. A dropped batch job gets one silent, invisible retry first (the ticket just stays on Waiting Ink a beat longer, using the file still held in the browser — see `JobTrackerService`'s `ticketId`/`_retryContext`); Overrun only ever renders after that retry also drops, or immediately for a job with nothing left to retry with (a single-file submission, or a batch job whose page reloaded mid-run).
- **Struck Plate** *(CSS)* — a cancelled job desaturates and takes one diagonal strike, then holds muted.
- **Stamped In / Pulled Away** *(Motion)* — a job ticket entering or leaving a list: entrance staggers up to four slots (40ms step) regardless of batch size; exit plays before the DOM node is removed, so the remaining tickets reflow instead of jumping. Stamped In generalizes beyond jobs to any single element arriving for the first time — a file's summary card replacing the dropzone, a removal-confirmation alert appearing — same call, same meaning: something just landed on the press.
- **The Punch** *(Motion, Odometer Tick reused)* — selecting a preset, format, fit-mode, or DPI tile plays the same scale-flash as a ledger number ticking: "a chosen plate punched into the rail" (the tile system's own language in Components, above), not a new gesture.
- **Ink Stroke** *(Motion)* — the completed/failed status glyph draws its own outline (`stroke-dasharray`/`stroke-dashoffset`) rather than appearing whole, the way a rubber stamp's ink traces its shape as it lands. Works on any stroke-based icon (`MotionService.drawOn`), fired alongside Pulled Sheet/Misregistration.
- **FLIP move** *(Motion)* — a row that changed position (drag-reorder, a sibling removed) inverts the jump into a spring slide instead of snapping. Tracked continuously against each row's last known position, not only around the drag gesture, so removal-caused reflow gets it too.
- **The Curtain** *(Motion, overlay)* — the press room's own light going down between plates: a full-viewport `bg-press` panel with a centered Index Turn spinner, covering every tool switch and the very first boot. Route-level continuity was tried twice before this and rejected both times: Angular's native View Transitions router feature threw `InvalidStateError` against SSR hydration on every navigation, and a plain per-page CSS fade-in (`opacity:0 → 1`) left a visible gap where the outgoing page's dark canvas showed through before the incoming page painted — reported as "a flash of black, then fade in from bottom." The Curtain fixes both by owning the transition itself rather than decorating either side of it. See Interaction below for the guard-driven sequencing that makes it airtight.

### Interaction: the route curtain
A `canActivate` guard (`curtainReadyGuard`) sits on every tool's leaf route and calls `RouteCurtainService.show()`, which does not resolve until the curtain has actually reached full opacity — so Angular only creates the destination component *after* the guard resolves, meaning the entire swap happens behind a fully opaque curtain, never mid-fade. Once the navigation settles (`NavigationEnd`, or `Cancel`/`Error`/`Skipped` if it didn't), the curtain holds a minimum 320ms (120ms under reduced motion) from the moment it reached opacity — a warm local navigation can settle before the fade-in even finishes, and lifting the curtain that fast reads as a flicker, not a job that ran; a navigation slow enough to already clear the floor on its own pays no extra wait. Past that hold, the curtain waits a real paint (double `requestAnimationFrame`) past the DOM update, then fades away over Motion's `curtainHide`, revealing content that was already fully rendered underneath. The curtain starts fully opaque as a plain inline style in its own template — so the SSR-rendered HTML ships that way, and the very first thing a browser paints, before any JS has run, is the calm curtain rather than the raw interface. `MotionService.curtainShow`/`curtainHide` use single-value targets (not `[from, to]` keyframe arrays) specifically so a rapid double tool-switch retargets smoothly from wherever the curtain currently is, never snapping.

### Supporting states
Every interactive atom (buttons, inputs, selects, toggles, tiles, sidebar rows, gallery tiles) carries `duration-shift`/`ease-run` on its color, border, and shadow transitions — no control anywhere in the app pops a state change instantly. Every clickable element also carries an explicit `:active` acknowledgment, not just `:hover`: a "plated" element (has a background or border) gets `active:shadow-stamped` (the ink physically pressing into the paper); a plain text/icon-only affordance with no plate gets `active:opacity-60` (the ink itself deepening) instead — never a scale transform, matching the Buttons rule above. The dropzone reads drag intent in two stages: `.dropzone-inviting` (a muted pink border) the moment any file is dragged over the browser window, even before the cursor reaches the plate, escalating to the full pink wash only once the cursor is directly over it. A gallery tile lifts (`shadow-paper-lift`) and its border darkens on hover, the same paper-physically-lifted language the cards already use, never a new depth idiom. Inputs and selects carry the registration-cross focus mark the Components section already specified but which the first build never wired up (`peer-focus:opacity-100` on a corner `.reg-cross`) — every documented state now actually exists in code, not just in this file.

**Tailwind note:** `shadow-paper-lift` / `shadow-stamped` are declared with `@utility` (not a plain CSS class) specifically so variants compile — `hover:shadow-paper-lift` (and `active:shadow-stamped`) need Tailwind to recognize the utility name to wrap it in a pseudo-class selector at all; a hand-written plain CSS class silently compiles to nothing under a variant prefix.

### Reduced motion
One `prefers-reduced-motion` gate, not a designed alternate path: the two CSS loops turn off via one media query in `styles.css`, and `MotionService` checks the same preference once and drops the spatial component of each pattern while keeping its opacity/color state change legible. Fewer and gentler, not silent.

## Do's and Don'ts

### Do:
- **Do** put every number the user must trust — size, dimensions, hashes, durations — in Courier Prime, tabular, stamped like a ledger.
- **Do** keep all functional content (forms, previews, telemetry) on a paper surface with dark ink text; the press-room dark only ever carries chrome.
- **Do** pair light spot inks with dark text and deep spot inks with light text (The Overprint Rule) — never guess contrast.
- **Do** spend spot color on exactly one thing per view: the action, or the state, never both, never decoration.
- **Do** show before/after comparison and explicit size deltas as stamped ledger tags, exactly as before.
- **Do** reuse the named motion patterns (Waiting Ink, Index Turn, Odometer Tick, Pulled Sheet, Misregistration, Overrun, Struck Plate, Stamped In/Pulled Away) for any new state that matches their meaning, rather than inventing a new transition for the same kind of moment.
- **Do** reach for Overrun, never Misregistration, when a failure is the system's fault (a dropped job, a capacity ceiling) rather than the file's — Red always means the input was the problem; Gold never does.
- **Do** give every clickable element hover, active, and (for inputs/selects) focus treatment — `active:shadow-stamped` for anything with a plate, `active:opacity-60` for plain text/icon links, never a scale transform.

### Don't:
- **Don't** put body copy, form labels, or data directly on the press-room dark canvas — that surface is for wayfinding only.
- **Don't** use soft glows, blurred shadows, or rounded glass panels — depth is a hard paper-lift offset, never a blur.
- **Don't** run two spot colors as equals in one view; one ink leads, the rest stay neutral until it's their turn.
- **Don't** render the registration cross, stamp texture, or paper grain as literal 3D skeuomorphism (no drop-shadowed curling corners, no photographic paper texture) — this is flat graphic print language, not a photo of paper.
- **Don't** expose shell commands, raw filesystem paths, or backend runtime syntax to the user.
- **Don't** trigger destructive actions or discard uploaded files without explicit confirmation.
- **Don't** use bounce/elastic easing or a blurred glow as a motion effect — the No-Glow Rule and confident-deceleration character bind motion exactly as they bind shadows.
