---
name: UsageBar
description: A focused Windows tray utility for local AI usage visibility.
colors:
  light-background: "#ffffff"
  light-foreground: "#121722"
  light-muted: "#f4f4f5"
  light-muted-foreground: "#71717a"
  light-border: "#e4e4e7"
  dark-background: "#1c1c1e"
  dark-foreground: "#ededed"
  dark-muted: "#2a2a2c"
  dark-muted-foreground: "#888888"
  dark-border: "#ffffff14"
  dark-accent: "#bfff00"
  destructive: "#ef4444"
typography:
  headline:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.2
  title:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.3
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.light-foreground}"
    textColor: "{colors.light-background}"
    rounded: "{rounded.md}"
    height: "36px"
    padding: "0 10px"
  button-outline:
    backgroundColor: "{colors.light-background}"
    textColor: "{colors.light-foreground}"
    rounded: "{rounded.md}"
    height: "36px"
    padding: "0 10px"
---

# Design System: UsageBar

## 1. Overview

**Creative North Star: "The Instrument Panel"**

UsageBar is a compact working instrument that sits beside the user's editor and terminal. It favors legible numbers, familiar controls, calm state changes, and direct provenance over decorative dashboard styling. Density is welcome when it reduces navigation, but the most important quota or cost signal must remain obvious at a glance.

The interface rejects glassmorphism, oversized promotional metrics, novelty controls, and inconsistent provider-specific layouts. Light mode is neutral and crisp. Dark mode uses a charcoal Windows surface with a rare lime highlight for the active product state.

**Key Characteristics:**

- Compact, task-first desktop density
- Flat tonal layers with restrained borders
- Familiar system typography and control behavior
- Strong keyboard focus and semantic state labels
- Provider brand color limited to identity and data context

## 2. Colors

The palette is neutral by default so quota, incident, and provider colors retain meaning.

### Primary

- **Instrument Ink** (`#121722`): primary light-theme text and actions.
- **Signal Lime** (`#bfff00`): dark-theme active navigation and selected product state, used sparingly.

### Neutral

- **Work Surface** (`#ffffff`): light content and card surface.
- **Night Surface** (`#1c1c1e`): dark content and card surface.
- **Night Layer** (`#2a2a2c`): dark secondary panels and navigation.
- **Quiet Text** (`#71717a` light, `#888888` dark): supporting labels only where contrast remains AA.
- **Hairline** (`#e4e4e7` light, `#ffffff14` dark): separators and control outlines.

**The Signal Rule.** Accent and semantic colors indicate selection, provider identity, progress, or system state. They are not decoration.

## 3. Typography

**Display Font:** system UI sans serif
**Body Font:** system UI sans serif

**Character:** Familiar Windows desktop typography with a compact, consistent scale. Data uses tabular numerals when values must align or update in place.

### Hierarchy

- **Headline** (600, 24px, 1.2): settings and full-window page titles.
- **Title** (600, 18px, 1.3): provider and section titles.
- **Body** (400, 14px, 1.5): setup, errors, explanations, and row content.
- **Label** (500, 12px, 1.3): metadata, badges, compact actions, and chart labels.

**The Compact Scale Rule.** Product hierarchy comes from weight, spacing, and grouping. Do not use marketing-scale display type inside the tray or settings window.

## 4. Elevation

The system is flat by default. Depth comes from tonal layers, separators, and temporary overlays. Small control shadows are acceptable where they clarify an outline button against the same-color surface; cards and sections do not combine wide shadows with borders.

**The State-Only Elevation Rule.** Stronger elevation belongs to dialogs, popovers, and active drag state, never static dashboard decoration.

## 5. Components

### Buttons

- **Shape:** compact rounded rectangle (6px to 8px).
- **Primary:** solid foreground color, high-contrast text, 32px to 40px height.
- **Hover / Focus:** tonal hover plus a visible 3px focus ring; transitions stay within 150ms to 250ms.
- **Secondary / Ghost:** standard outline or tonal hover, using the same geometry as primary actions.

### Chips

- **Style:** compact 12px label, 6px to 8px corners, semantic or neutral background.
- **State:** selected filters use solid or clearly tinted state, never color alone.

### Cards / Containers

- **Corner Style:** 8px to 10px where a bounded container is necessary.
- **Background:** current surface or one neutral tonal layer.
- **Shadow Strategy:** flat at rest.
- **Border:** subtle hairline for grouping, not a colored side stripe.
- **Internal Padding:** 12px to 16px.

### Inputs / Fields

- **Style:** standard field affordance, 8px corners, neutral border and surface.
- **Focus:** visible ring plus border change.
- **Error / Disabled:** explicit text or icon accompanies semantic color.

### Navigation

The tray uses a narrow icon rail with provider identity, current selection, incident indicators, and drag reorder. The settings window uses familiar tabs and two-column layouts only when width supports them.

### Metric Line

Progress, badge, and text rows share one component vocabulary. Values are tabular, reset information is secondary, and trend/history additions must preserve the compact scan path.

## 6. Do's and Don'ts

### Do:

- **Do** keep current usage and incident state visible before setup detail.
- **Do** use the existing 6px to 10px component radius and 12px to 16px content spacing.
- **Do** respect reduced motion and keep state transitions between 150ms and 250ms.
- **Do** use semantic labels, icons, or text in addition to color.
- **Do** keep browser import explicit, provider-scoped, and reversible.

### Don't:

- **Don't** use decorative SaaS dashboard treatments, oversized marketing metrics, glassmorphism, or gratuitous animation.
- **Don't** use provider-specific interface forks when the shared metric, account, or history vocabulary works.
- **Don't** combine a border with a wide decorative shadow on the same card or button.
- **Don't** use colored side-stripe borders, gradient text, or radii above 16px on cards and sections.
- **Don't** hide credentials, imports, errors, or data provenance behind ambiguous labels.
