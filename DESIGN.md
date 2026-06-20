# Design

## Theme

Light, trust-first, local warmth. Surface `#F7FAF9` — tinted faintly toward teal, not warm-neutral. Alternating with white for section rhythm. One teal-immersive section (quote background `#E8F4F3`) as a committed-color move.

## Color Palette

| Token | Hex | Role |
|---|---|---|
| `--color-primary` | `#19706A` | Brand teal — buttons, accent text, icons, teal word in headlines |
| `--color-primary-light` | `#E8F4F3` | Hover fills, quote section bg, tag backgrounds |
| `--color-primary-dark` | `#0D1F1E` | Near-black — all heading and body text |
| `--color-gold` | `#F2C94C` | Accent — spark decoration, star ratings |
| `--color-gold-light` | `#FDF8E1` | Gold bg fills |
| `--color-muted` | `#6B8886` | Secondary text and labels (18px+ where 3:1 suffices; pure decoration at smaller sizes) |
| `--color-surface` | `#F7FAF9` | Page background |
| `--color-border` | `#E0EDEC` | Borders, dividers, step separators |
| `--color-white` | `#FFFFFF` | Cards, elevated sections |

## Typography

**Family:** DM Sans variable (400, 500, italic 400 loaded via Google Fonts)
**Fallback:** system-ui, sans-serif

| Role | Size | Weight | Notes |
|---|---|---|---|
| Display / Hero h1 | clamp(48px, 7vw, 88px) | 500 | ls -0.03em, lh 1.08 |
| Section heading | clamp(28px, 4vw, 42px) | 500 | ls -0.02em |
| Step title | clamp(20px, 2.2vw, 26px) | 500 | ls -0.01em |
| Pull quote | clamp(22px, 3vw, 30px) | 400 italic | ls -0.01em |
| Closing line | clamp(22px, 3vw, 32px) | 500 | ls -0.02em |
| Truth statement | clamp(18px, 2.2vw, 22px) | 400 | ls -0.01em |
| Body / step body | 16–19px | 400 | lh 1.65 |
| Label / meta | 14px | 500 | — |
| Micro / decoration | 13px | 500 | decorative contexts only |
| Step number (typographic) | clamp(56px, 6vw, 72px) | 500 | Decorative, `#E8F4F3` |
| Truth number | 13px | 500 | `#6B8886`, decorative |

## Radii

- Buttons: `border-radius: 9999px` (rounded-full)  
- Cards: `var(--radius-lg)` = 16px
- Inputs: `var(--radius-md)` = 10px

## Components Used

- `.btn-primary` — teal, white text, rounded-full, inline-flex
- `.btn-secondary` — transparent, teal border
- `.btn-ghost` — border-border, hover teal
- `.card` — white, border-border, rounded-lg, shadow-card
- `.input`, `.label`, `.badge-teal`, `.badge-gold`, `.pill`

## Spacing

Base 4px unit. Key values: 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64 / 80 / 96px.
Section padding: `clamp(64px, 8vh, 100px)` vertical, `clamp(24px, 5vw, 72px)` horizontal.

## Layout Principles

- Hero is left-aligned, close to edge — no centered floating text.
- Steps use a 2-column grid (large decorative number left, text right) with `<hr>` separators.
- Truths use flex rows (tiny number left, statement right) — no borders, no cards.
- Closing is asymmetric: text left, button right on same row.
- All content-heavy sections cap at 780–900px max-width; constrained sections at 680–720px.

## Background Motion

3 organic SVG blob shapes (`#19706A` at 4–8% opacity) + 1 gold blob (`#F2C94C` at 4–7% opacity).
Animated via CSS keyframes: `transform: translate/rotate + opacity`, `ease-in-out`, 10–16s loops, staggered.
1 gold SVG spark in hero headline breathes slowly (8s, scale + rotate).
`prefers-reduced-motion: reduce` kills all animation (global CSS).

## Anti-Patterns (Committed)

- No side-stripe `border-left` accent on list items
- No gradient text
- No identical icon-grid cards
- No equal-width "how it works" columns
- No uppercase tracked eyebrow on every section
- No circles as background shapes (SVG blobs only)
- No centered hero floating in whitespace
