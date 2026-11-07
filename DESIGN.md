# PACTUM: Quiet Authority

## Identity and principles
A measured procurement and financial operations workspace: exact, accountable and readable. ENERGY 1 / RHYTHM 2 / MOTION 1. The identity motif is an editorial heading above an aligned mandate ledger: obligation, state, next action. Whitespace separates decisions. Vermilion marks the primary action. No invented activity or implied provider acknowledgments.

## Color roles and themes
Light: canvas #F7F5F0, surface #FFFFFF, secondary surface #EFECE5, text #24231F, secondary text #625F57, border #DCD8CE. Dark: canvas #151513, surface #1D1D1A, secondary surface #262622, text #F2EFE7, secondary text #B7B2A7, border #3B3A34. Action #B83E26 with white text, hover #9F321E. Semantic source: globals.css --color-page-bg, --color-surface-primary/secondary/elevated, --color-text-primary/secondary/muted, --color-border-primary/subtle and --color-ember-orange/hover. Green, amber and red indicate real states with accompanying words. Legacy aliases remain compatible; new components use semantic roles.

## Typography and financial formatting
Keep Inter for dense operational text and IBM Plex Mono for identifiers and aligned amounts. Titles 26–32px/1.2 weight 600; section headings 18px/1.4; body 14px/1.5; labels 12–13px. No uppercase eyebrows. Amounts align right with tabular numerals and use the existing currency formatter. Never sum currencies. Budget is not captured volume; an audit is not payment; negotiated savings are not realized savings.

## Spacing and geometry
Use Tailwind's standard 4px scale: 4, 8, 12, 16, 24, 32, 40, 48, 64. Never declare numeric --spacing-* tokens; they override utility dimensions. Custom pixel tokens use --pactum-space-*. Page container 1440px maximum, with 16px phone, 24px tablet and 32px desktop padding. Header maximum 1600px, height 64px. Borders 1px, controls/panels radius 6px, dialogs 8px. Shadows distinguish floating menus and dialogs only.

## Component specifications
Buttons: 40px height, 44px for coarse pointers; primary vermilion/white, secondary neutral/bordered; 16px horizontal padding, visible focus and disabled state. No scale animation. One primary action per section.
Panels: semantic surface, 20–24px padding, thin border; no hover lift for static content.
Forms: visible associated labels, full-width fields/selects, 40px minimum height, inline errors with aria-invalid and describedby. Placeholders supplement labels. Preserve validation and submission logic.
Tables: native headers, section heading/caption, left-aligned descriptions, right-aligned amounts, thin row rules. Wrap descriptions; never wrap amounts. Narrow screens use a labeled, focusable local scroll region.
Tabs: explicit selected state and keyboard operation. Ordinary page navigation retains navigation semantics.
Menus: 320px width capped at viewport minus 32px; right aligned, 8px gap; full-width selector, 40px actions. Identity and permissions inside. Arrow navigation, outside dismissal, Escape and focus restoration.
Dialogs: accessible name/description, initial focus, contained Tab focus, Escape dismissal, return focus. Specific confirmation for destructive actions.

## Navigation
One row: brand, navigation 32px later, flexible spacer, theme/account at 12px spacing. Preserve six destinations, active indication and permission filtering. Collapse before overlap rather than squeezing text. Neutral active background, no orange underline. Organization name and chevron in trigger; identity, role, switching and logout inside. Preserve 64px height during hydration.

## Data states and copy
Loading: announce work and reserve meaningful space. Empty: explain absent records and offer a real creation action. Error: name the failed operation and provide retry; failed fetching must never appear as an empty organization. Success: only describe server-confirmed results. Use “New mandate,” “Open mandate,” “Review settlement,” and “Try again.” No uptime, fabricated counters, marketing workflow explainers or backend implementation details as primary copy. Recent updates come from record timestamps, not invented event histories.

## Accessibility, motion and responsiveness
WCAG 2.2 AA: 4.5:1 body contrast, 3:1 control contrast, visible keyboard focus, native controls, logical headings, no color-only states. Preserve zoom. Touch targets 44px. Motion only for short state transitions up to 150ms; honor reduced motion, no entry animation/pulse/lift. At 1024px use the navigation menu; at 1280/1440/1920px desktop navigation. Small layouts stack headings/actions and wrap summaries. Contain table scrolling locally, never conceal page overflow. Long organization names truncate only in the trigger; full name remains in the menu. Themes share geometry.

## Anti-patterns and acceptance
No gradients/glow, fake activity, four-card filler grids, decorative badges or numeric Tailwind token collisions. All controls must operate. Overview uses actual records and preserves currency isolation; loading/error/empty/populated states are distinct. Header is 64px and menu 320px or viewport-safe smaller. UI/auth/org tests, TypeScript, lint and build pass. Record browser checks at requested widths/themes; blocked checks remain unverified. Anti-slop Delivery Gate cannot PASS without observed interaction and responsive/theme verification.

## Phase 1 repository audit
The App Router has authentication pages, organization/account administration and one authenticated client workspace whose six screens are selected in app/page.tsx. OrganizationBoundary gates the workspace on server-returned membership; VIEWER receives a separate redacted summary. AppShell owns navigation, theme and account controls; SharedUI supplies buttons, inputs, status labels, currency formatting and confirmation dialogs. ThemeProvider persists the theme and initializes it before hydration. Tailwind 4 is compiled through PostCSS, with no separate Tailwind config.

Baseline inconsistencies: the previous DESIGN.md described a marketing site, multi-accent feature panels, 24px radii and numeric spacing overrides. Overview led with a decorative technical badge and marketing paragraph, followed by aggregate metrics, workflow explainers and repetitive panels. It selected sessions[0] as active and described audit-qualified differences as realized savings. Existing views contain hardcoded colors and inherited animation styles. Shared inputs already associate errors and labels; shared confirmation dialogs lacked focus containment and restoration. The account menu already supported opening, dismissal and keyboard movement, but small-screen anchoring could cross the viewport. Procurement fetch errors were logged without a distinct overview error state.

Phase 1 uses OperationsUI containers, panels, data messages and a native ledger table, existing CurrencyDisplay/formatCurrency, and existing navigation callbacks. It adds no dependency and changes no financial arithmetic. Constraints: session records are snapshots, not a historical event stream; timestamps describe updates only. Existing sourcing/negotiation/evidence/settlement screens and their detailed financial controls retain their current structure. Their hardcoded legacy colors and specialist tables/forms require a later screen-by-screen migration. Authenticated visual validation requires an existing verified login and organization; tests must not bypass that boundary.
