---
name: Utility Platform
description: Private local-first capability runtime & utility workstation
colors:
  primary: "#6366f1"
  primary-hover: "#4f46e5"
  primary-subtle: "#312e81"
  secondary: "#06b6d4"
  secondary-hover: "#0891b2"
  accent-success: "#10b981"
  accent-warning: "#f59e0b"
  accent-danger: "#ef4444"
  neutral-bg: "#09090b"
  neutral-surface: "#121215"
  neutral-elevated: "#18181b"
  neutral-border: "#27272a"
  neutral-border-subtle: "#1f1f23"
  neutral-text: "#f4f4f5"
  neutral-text-muted: "#a1a1aa"
  neutral-text-subtle: "#71717a"
typography:
  display:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "clamp(1.75rem, 3vw, 2.25rem)"
    fontWeight: 700
    lineHeight: "1.2"
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: "1.3"
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: "1.4"
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.5"
    letterSpacing: "0em"
  label:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: "1.4"
    letterSpacing: "0.025em"
rounded:
  sm: "4px"
  md: "8px"
  lg: "12px"
  xl: "16px"
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
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.neutral-text}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-secondary:
    backgroundColor: "{colors.neutral-elevated}"
    textColor: "{colors.neutral-text}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.neutral-text-muted}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  card:
    backgroundColor: "{colors.neutral-surface}"
    textColor: "{colors.neutral-text}"
    rounded: "{rounded.lg}"
    padding: "24px"
  input:
    backgroundColor: "{colors.neutral-surface}"
    textColor: "{colors.neutral-text}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
---

# Design System: Utility Platform

## Overview

**Creative North Star: "The Precision Instrument Workbench"**

The Utility Platform design system models a high-performance local capability workstation. It balances developer-grade density with immediate tactile feedback, treating file transformations, schema parameter forms, and system telemetry as first-class physical instruments. Every surface is tuned for low eye fatigue during prolonged use, clear visual hierarchy, and instant operational certainty.

The aesthetic philosophy centers on crisp tonal layering on deep obsidian (`#09090b`), illuminated by purposeful electric indigo (`#6366f1`) for primary actions and cyan (`#06b6d4`) for secondary metadata and status signals. Monospace telemetry (`JetBrains Mono`) anchors technical specifications, SHA-256 digests, dimensions, and operational telemetry.

**Key Characteristics:**
- **Tactile Dark Canvas**: Deep obsidian backdrop with 1px zinc borders and tonal surface separation.
- **Instrument Telemetry**: Monospace badges, live file size deltas, dimension chips, and SHA-256 fingerprints.
- **Intent-Driven Forms**: Clean, modular parameter groups with immediate validation and one-click smart presets.
- **Zero-Friction Ergonomics**: Seamless drag-and-drop zones, instant live preview comparison, and clear state transitions.

## Colors

The palette is engineered around high-contrast dark neutral surfaces punctuated by targeted chromatic accents for state, telemetry, and execution.

### Primary
- **Electric Indigo** (`#6366f1`): The primary brand and call-to-action color. Used exclusively for affirmative execution buttons, active navigation states, and primary focus outlines.
- **Indigo Deep** (`#4f46e5`): Hover and active states for primary execution controls.
- **Indigo Subtle** (`#312e81`): Subtle background tint for selected tools and active category badges.

### Secondary
- **Electric Cyan** (`#06b6d4`): Secondary accent for technical telemetry, live preview inspect tags, and processing signals.
- **Cyan Deep** (`#0891b2`): Hover state for cyan action triggers and secondary filters.

### Tertiary / Status Accents
- **Emerald Pulse** (`#10b981`): Runtime active heartbeat, successful operation outcomes, and positive delta reductions.
- **Amber Warning** (`#f59e0b`): Connecting states, background queue warnings, and size inflation notices.
- **Crimson Error** (`#ef4444`): Validation errors, rejected MIME types, and failed job alerts.

### Neutral
- **Obsidian Dark** (`#09090b`): Root application canvas background.
- **Surface Dark** (`#121215`): Card surfaces, sidebar background, and toolbar panels.
- **Surface Elevated** (`#18181b`): Dropzones, input containers, preset buttons, and modal dialogs.
- **Border Crisp** (`#27272a`): 1px structural borders dividing panels and containment cards.
- **Border Subtle** (`#1f1f23`): Sub-item dividers and secondary grid lines.
- **Text Bright** (`#f4f4f5`): Primary titles, active values, and button labels.
- **Text Muted** (`#a1a1aa`): Secondary descriptions, section headers, and field helper copy.
- **Text Subtle** (`#71717a`): Inactive placeholders, disabled hints, and timestamp metadata.

### Named Rules
**The Execution Rarity Rule.** Electric Indigo is reserved strictly for primary execution and active tool selection. Never use it for background decoration or passive text.

**The Telemetry Monospace Rule.** Any data representing sizes (KB/MB), dimensions (W×H), execution duration (ms), or hashes (SHA-256) must use monospace formatting and neutral-to-cyan status coloring.

## Typography

**Display Font:** Inter, -apple-system, BlinkMacSystemFont, sans-serif
**Body Font:** Inter, -apple-system, BlinkMacSystemFont, sans-serif
**Label/Mono Font:** JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace

**Character:** Clean, neutral, high-legibility geometric sans-serif for interface controls paired with tabular, compact monospace typography for numerical telemetry and parameter identifiers.

### Hierarchy
- **Display** (Bold 700, `clamp(1.75rem, 3vw, 2.25rem)`, `1.2` line-height): Main workbench header and major tool view titles.
- **Headline** (Semi-bold 600, `1.25rem` / `20px`, `1.3` line-height): Card headers, tool operation titles, and inspection panel sections.
- **Title** (Semi-bold 600, `1rem` / `16px`, `1.4` line-height): Form section titles, modal headers, and sidebar tool group names.
- **Body** (Regular 400, `0.875rem` / `14px`, `1.5` line-height, max line length 70ch): Form input labels, helper text, explanations, and system messages.
- **Label** (Medium 500, `0.75rem` / `12px`, `1.4` line-height, `0.025em` tracking): Monospace tags, status pills, dimension badges, SHA-256 hashes, and milestone markers.

### Named Rules
**The Metric Precision Rule.** All numbers denoting file size, dimensions, memory, or time must render in tabular monospace (`font-mono`) to prevent layout shift during live updates.

## Layout

The spatial model uses a fixed-width collapsible navigation sidebar paired with a flexible modular workbench grid.

- **Workbench Grid**: Responsive 12-column system (`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8`).
- **Sidebar**: Fixed 260px width on desktop (`border-r border-zinc-800 bg-zinc-950/60 backdrop-blur`), collapsible on mobile viewports.
- **Workspace Layout**: Split two-column inspection and parameter configuration (`grid grid-cols-1 lg:grid-cols-12 gap-8` with 5-col controls / 7-col preview & comparison).
- **Spacing Scale**: Base 4px rhythm (`xs: 4px`, `sm: 8px`, `md: 16px`, `lg: 24px`, `xl: 32px`, `xxl: 48px`).

## Elevation & Depth

Utility Platform operates on a flat, tonal surface model with crisp 1px borders. Depth is communicated through luminosity stepping (`#09090b` → `#121215` → `#18181b`) and subtle ambient glows on active states rather than heavy drop shadows.

### Shadow Vocabulary
- **Glow Accent** (`box-shadow: 0 0 20px -3px rgba(99, 102, 241, 0.25)`): Applied to active primary action buttons and focused drag-and-drop targets.
- **Surface Elevation Low** (`box-shadow: 0 4px 12px -2px rgba(0, 0, 0, 0.5)`): Used for flyouts, tooltips, and floating comparison bars.

### Named Rules
**The Tonal Boundary Rule.** Surfaces separate via 1px border contrast (`#27272a`) and background value stepping, never via heavy diffuse shadows.

## Shapes

- **Radius Scale**:
  - Small (`rounded-sm: 4px`): Monospace tags, status pills, and preset buttons.
  - Medium (`rounded-md: 8px`): Form inputs, standard buttons, select dropdowns, and sidebar navigation items.
  - Large (`rounded-lg: 12px`): Cards, preview containers, dropzones, and inspection panels.
  - Full (`rounded-full: 9999px`): Status indicator dots, user identity pills, and circular action triggers.
- **Borders**: Uniform 1px solid borders (`border-zinc-800` / `#27272a`).

## Components

### Buttons
- **Shape:** Medium radius (`rounded-md: 8px`).
- **Primary:** Background `bg-indigo-600` (`#6366f1`), text `text-white`, padding `8px 16px`. Active state transitions smoothly with subtle transform `active:scale-[0.99]`.
- **Secondary:** Background `bg-zinc-800` (`#27272a`), border `border-zinc-700`, text `text-zinc-200`, hover `bg-zinc-700`.
- **Ghost:** Transparent background, text `text-zinc-400`, hover `bg-zinc-900 text-zinc-100`.

### Cards & Panels
- **Corner Style:** Large radius (`rounded-xl: 12px` or `rounded-lg: 8px`).
- **Background:** `bg-zinc-900/60` (`#121215`) with `border border-zinc-800` (`#27272a`).
- **Internal Padding:** `16px` to `24px` for content containment.

### Inputs & Selects
- **Style:** Background `bg-zinc-900/80`, border `border-zinc-700/80`, text `text-zinc-100`, radius `rounded-md: 8px`, padding `8px 12px`.
- **Focus:** Border transition to `border-indigo-500` with ring `ring-1 ring-indigo-500/50`.

### Dropzone / Upload Canvas
- **Style:** Dashed border `border-2 border-dashed border-zinc-700/80`, background `bg-zinc-900/30`, hover `border-indigo-500/80 bg-indigo-950/10`.
- **Active Drag:** Border `border-indigo-400`, pulse animation, and text highlight.

### Telemetry Badges & Chips
- **Style:** Background `bg-zinc-900`, border `border-zinc-800`, text `text-zinc-300`, font `font-mono text-xs`, padding `2px 8px`, radius `rounded`.
- **Success Variant:** Background `bg-emerald-950/50`, border `border-emerald-800/60`, text `text-emerald-400`.

## Do's and Don'ts

### Do:
- **Do** use tabular monospace (`font-mono`) for all byte counts, dimensions, hashes, and operation identifiers.
- **Do** show before/after comparison previews and explicit delta metrics (e.g. `-42.8% reduction`) for every transformation.
- **Do** preserve the dark-first obsidian canvas hierarchy (`#09090b` canvas, `#121215` panel, `#18181b` elevated surface).
- **Do** provide one-click quick presets alongside granular numeric inputs for common dimensions and formats.

### Don't:
- **Don't** expose shell commands, raw filesystem paths, or backend runtime syntax to the user.
- **Don't** use primary Electric Indigo (`#6366f1`) for non-actionable elements or decorative headers.
- **Don't** use heavy drop shadows or bright white surfaces that break the dark workstation immersion.
- **Don't** trigger destructive actions or discard uploaded files without explicit confirmation.
