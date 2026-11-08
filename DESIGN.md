# PACTUM cinematic landing page

Status: design proposal for review. UI implementation is not authorized by this document.
Date: 8 November 2026.
Scope: public landing experience and illustrative procurement lifecycle only.

## 1. Basis, confidence, and boundaries

The referenced Study specification chat describes an ARC-inspired monochrome editorial fintech image: oversized black typography, warm-white space, floating chrome forms, architectural asymmetry, strong shadows, and a cinematic transition into near-black. That description is the art-direction basis here. The original reference image was not available in the retrieved conversation. This document does not claim a pixel-level analysis of it; exact silhouette, font match, crops, and relative placement require comparison with that image before visual approval.

The current workspace contains no application source, dependency manifest, or existing design documentation. Next.js App Router, React, the root route's session responsibilities, and the Quiet Authority application direction come from the supplied brief and earlier chat, not a source audit. All paths below are proposed locations, not verified existing files. Existing route destinations and security contracts must be inspected before implementation.

The design has two separate visual domains:

- The public page uses editorial scale, chrome sculpture, and choreographed motion to explain PACTUM.
- The authenticated application retains its existing Quiet Authority typography, density, colors, navigation, forms, tables, status language, and financial controls. Marketing tokens never replace application tokens.

No payment, negotiation, audit, database, authentication, authorization, organization, or session behavior changes belong to this work. No UI, generated artwork, dependency installation, route change, or business-logic change accompanies this specification.

## 2. Creative direction

Reading this as: a public procurement infrastructure landing page for procurement and finance teams, in a monochrome editorial fintech language. Design dials: ENERGY 2 / RHYTHM 3 / MOTION 3. The motion dial describes a few carefully directed scenes, not motion on every element.

The page's identity is a machined agreement: a layered object whose components find alignment, preserve evidence, and close into a payment-ready form. The same edge profile, seam, and registration marks recur throughout the narrative. This procurement-specific motif gives the sculpture a reason to exist.

One focal point dominates each viewport. In the hero, the headline and artifact form one composition. In the lifecycle, the active stage and its physical transformation take priority. The closing scene lets the assembled artifact recede behind the entry action.

Avoid decorative particles, neon, stock abstract blobs, dashboards disguised as sculptures, invented logos, fake testimonials, savings counters, payment tickers, and compliance badges. Use vermilion once per composition as a registration seam or selected-control marker. Neutral light-to-dark reflections describe the metal; they are not decorative page gradients.

## 3. Visual tokens

All proposed custom properties are scoped beneath `.pactum-landing`. Never redefine global application variables, Tailwind theme primitives, or document-wide heading styles.

### Color

- `--landing-paper: #F4F2ED`: warm-white hero and introductory ground, selected for editorial contrast and visible chrome reflections.
- `--landing-ink: #171717`: primary text on paper.
- `--landing-muted: #57534E`: secondary text on paper; never lower opacity to create body copy.
- `--landing-night: #141414`: lifecycle exit and closing ground.
- `--landing-on-night: #F4F2ED`: primary dark-section text.
- `--landing-muted-on-night: #B8B4AD`: secondary dark-section text.
- `--landing-vermilion: #B83E26`: existing brand accent described in the earlier brief. Confirm against application brand assets before implementation.
- `--landing-rule: #D0CCC4`: decorative rules on paper; not sufficient as the sole boundary of an essential control.
- `--landing-rule-on-night: #484848`: decorative rules on dark ground.

Accent lettering on paper must pass contrast measurement at its final size. Use neutral ink or paper for critical text and focus outlines. Never assume the vermilion is accessible on charcoal. Essential control boundaries use measured 3:1 contrast against adjacent colors. Text requires measured 4.5:1 contrast, or 3:1 for qualifying large text. Check all intermediate animated backgrounds; preferably keep text on a stable surface during the palette transition.

### Type

Use a self-hosted editorial grotesk with broad uppercase forms and restrained geometry. Proposed starting family: Helvetica Now Display if appropriately licensed; otherwise a self-hosted licensed equivalent such as an available Inter Tight build. This is a proposal, not an instruction to purchase a font. Verify actual font files, rights, weights, and glyph coverage before adopting it. Reuse the application's existing body family where compatible to maintain brand continuity.

- Display: weight 500 or 600, line height 0.92 to 0.98, tracking -0.045em to -0.025em. Desktop size `clamp(72px, 7.8vw, 150px)`.
- Mobile display: `clamp(40px, 11vw, 72px)`, line height 1.0. Preserve complete words and natural line wrapping at zoom.
- Section headings: 40 to 80px desktop, 30 to 44px mobile, line height 1.04.
- Body: 18px desktop, 16 to 18px mobile, line height 1.5 to 1.6; reading width 42 to 58 characters.
- Controls: 16px minimum; stage labels 16 to 20px, sentence case.
- Index and caption: 12 to 14px, line height at least 1.4; restrained tracking up to 0.06em for numeric indexes only.

Use oversized type to establish editorial hierarchy, not to fill every section. Small uppercase labels are limited to the PACTUM wordmark and short infrastructure identifiers. Avoid long monospace captions. Preserve one semantic H1 even if a visual reveal splits words into spans. Do not split text in a way that changes screen-reader pronunciation or copy/paste order.

### Space, edges, and surfaces

Use an 8px spacing rhythm, with 4px for optical adjustments. Desktop outer gutters are 48 to 80px; tablet 32px; mobile 20px, reducing to 16px at 320px. Maximum content width is 1760px, centered. Larger displays retain generous side space rather than indefinitely enlarging type.

Desktop uses a 12-column composition with 24px gaps. Mobile uses a single reading column. Section spacing varies deliberately: open hero, compressed lifecycle introduction, sustained demonstration, generous closing statement. Begin with 96 to 160px between major desktop sections and 64 to 88px on mobile.

Controls use 2 to 4px radii; the sculpture has physically small machined bevels. No pill-shaped badge system. Panels rely on rules and spacing rather than universal card shadows. Shadows belong primarily to the artifact and establish its relationship to the floor.

## 4. Page composition and copy

### Header

A slim, ordinary-flow header contains the existing PACTUM mark, an in-page Lifecycle link, and Enter workspace. Reuse the real brand asset; do not redraw a new insignia. The header remains readable on its own surface. It must not introduce a large dropdown menu or new information architecture. On narrow screens, retain the mark and workspace action; place the lifecycle link in the normal content flow if needed.

### Hero: the agreement

At 1440px, begin with a 64px gutter and a roughly 760 to 900px hero including the header. Place the headline across approximately columns 1 to 8, with the artifact centered near columns 8 to 10. Give the sculpture a diagonal from upper right to lower center. Its projected bounds occupy about 38 to 46% of the viewport width. These are starting proportions pending reference comparison.

Proposed H1: “Every agreement. Engineered for certainty.” This is positioning language, not a guarantee of settlement, audit validity, or error-free operation. Review the wording against actual product capabilities before publication.

Proposed supporting copy: “Source suppliers, negotiate within policy, review evidence, and prepare for settlement in one connected workflow.” All capability language must be confirmed against the application.

Primary action: Enter workspace, using the existing entry/authentication destination after inspection. Secondary action: View the lifecycle, linking to the real lifecycle section.

Allow visual overlap between the sculpture and headline only in nonessential negative space. Keep all letterforms, body text, and controls legible. Place the canvas behind HTML, not above an invisible click-blocking plane. Reserve the poster/canvas region before enhancement loads.

### Lifecycle introduction and scene

A short editorial bridge introduces “From sourcing to settlement.” It explains that the visual is a demonstration. Follow it with a wide scene, a four-stage navigation rail, and the active stage's HTML explanation. Keep text clear of metal highlights and camera movement.

The default visual narrative progresses on scroll on capable desktops. Direct stage controls remain visible and work independently. Display “Illustrative workflow” beside the navigation and “No live procurement or payment activity” in the explanatory copy. These labels remain visible in screenshots of the settlement stage.

### Closing scene

The background reaches charcoal, the artifact closes, and the headline reduces to a concise entry invitation: “Bring the agreement into your workspace.” Use Enter workspace as the action. Reserve vermilion for one seam in the artifact; do not animate a success badge or imply money moved.

The footer contains only existing, verified legal or product destinations. Omit links until their actual destinations are known. No customer logo strip, pricing section, testimonial grid, or extra feature filler is proposed.

## 5. Sculptural chrome agreement artifact

### Geometry and meaning

Construct a single reusable assembly from three thin rectangular plates, one graphite spine, four evidence segments, and a small registration rail. Each plate has a document-like proportion around 1:1.4, visible thickness, and a consistent 0.015 to 0.03 unit bevel on an approximately 2-unit-wide object. Final dimensions are tuned in visual review.

The artifact reads as a negotiated agreement rather than a credit card, coin, or padlock. Avoid card numbers, signatures, provider logos, certification stamps, or fabricated legal marks. A subtle PACTUM deboss may use only an existing approved mark. The proposed asset can be procedural geometry; a commissioned or modeled GLB is an alternative if it materially improves silhouette within budget.

Parts retain identity across all stages. Sourcing fans the plates, negotiation aligns them around the spine, audit reveals four evidence segments, settlement nests those components into the closed assembly. Use rigid transforms and controlled occlusion rather than implausible topology morphs or teleportation.

### Material and lighting

Chrome surfaces start near metalness 1.0 and roughness 0.18 to 0.28; brushed surfaces use roughness 0.32 to 0.42. Graphite is less reflective so edges remain readable. These are tuning ranges, not guarantees of a final appearance. Keep a broad bright reflection and a narrow dark band across each major surface. Microtexture must not shimmer at mobile resolution.

Use a neutral studio environment, a broad upper-left key, restrained side fill, and a rear edge light for the dark section. Prefer baked or environment-driven reflections over expensive real-time lights. Use one soft contact shadow or baked floor shadow, not multiple live shadow maps. No default bloom, depth-of-field, chromatic aberration, or screen-space reflection pass.

Start with a perspective camera around 35 to 45 degrees vertical field of view, with the object near the origin. Keep safe projected bounds for every breakpoint. Camera motion follows a shallow arc; never accelerate into a first-person fly-through. Dramatic motion comes from changing plate relationships and light, not disorienting the reader.

## 6. Motion score: GSAP and React Three Fiber

All durations are design targets for later tuning. Animation never gates text, navigation, or authentication entry. The server HTML is readable before any animation initializes. No blocking loader or forced black splash screen.

### Ownership

GSAP owns one normalized scene progress value and entrance timelines. ScrollTrigger maps document position to scene progress. R3F reads that value and interpolates camera, transforms, light intensity, and material parameters. One renderer owns the canvas. Never let GSAP and an R3F frame callback independently write the same property.

Use explicit animation refs or a small imperative scene controller for frame updates. React state changes on discrete stage changes, quality changes, and user preferences, not on every frame. Scope GSAP contexts to the landing root and revert all timelines and triggers on unmount. No global scroll handler or document-wide animation selector.

### Entrance: 0 to 1.6 seconds

- At time 0, show the readable HTML hero and reserved static poster. A thin existing-brand line may reveal over 250ms without obscuring the page.
- From 100 to 700ms, headline words settle upward by at most 16px with 50ms stagger and `power2.out`. Keep opacity sufficiently visible; never start essential text permanently hidden in CSS.
- From 200 to 1100ms, the artifact moves from a slightly lower pose into its resting angle, rotating at most 12 degrees. Crossfade the ready canvas over the matching poster in 200ms.
- From 500 to 1000ms, supporting text and actions settle by at most 8px. They are interactive throughout.
- By 1600ms, all autonomous entrance motion has stopped. If assets arrive late, skip the entrance and crossfade only; do not replay the whole sequence.

There is no perpetual idle float. Optional pointer parallax on fine pointers is limited to 2 degrees and approximately 8px apparent displacement, damped over 150 to 250ms. Disable it during scrolling, stage transitions, reduced motion, touch input, and when motion is paused. Button text never follows a magnetic transform; a subtle background response is sufficient.

### Desktop scroll score

Enable enhanced sticky choreography only at widths at least 1024px, adequate viewport height, full motion, and a successful capability check. Prefer a native CSS sticky scene with ScrollTrigger reading progress. Do not hijack wheel events or install a smooth-scroll engine.

The lifecycle section spans approximately 240 to 300svh, including one sticky viewport. Tune for a readable journey, with natural page scroll and no nested scrolling. Short viewports use ordinary flow. The complete page remains easy to traverse via keyboard and section links.

Map the lifecycle's normalized progress p from 0 to 1:

- 0.00 to 0.18: sourcing hold; plates fan into a legible specification stack.
- 0.18 to 0.28: transition to negotiation; plates approach the central spine.
- 0.28 to 0.43: negotiation hold; opposing components align with a visible tolerance gap.
- 0.43 to 0.53: transition to audit; camera arcs at most 15 degrees to expose the spine.
- 0.53 to 0.68: audit hold; evidence segments connect in sequence.
- 0.68 to 0.78: transition to settlement; segments nest and plates close.
- 0.78 to 1.00: settlement hold; the assembly rests in its payment-ready form.

Stage thresholds sit at transition midpoints, with approximately 0.015 hysteresis to prevent flicker near a boundary. Interpolate transforms continuously; scrub smoothing begins around 0.35 seconds and must not create prolonged motion after scrolling ends. Reverse scrolling reverses the mechanical story without changing application state.

Transition the paper backdrop toward charcoal near the audit-to-settlement interval using an isolated scene background layer. Keep HTML explanations on stable contrasting surfaces or switch their foreground/background atomically at a known midpoint. Do not interpolate low-contrast text through gray.

### Direct stage navigation and conflict resolution

Each stage has a real anchor targeting its corresponding HTML stage section. Without JavaScript, all four sections remain visible and readable. With enhancement, a controller may present them as accessible tabs, with one associated panel and a roving tab stop. Preserve IDs and URLs for direct linking. Use `aria-selected` for tabs; the non-tab anchor version uses `aria-current="step"`. Never combine contradictory roles.

For desktop scroll mode, selecting a stage scrolls to its hold position over at most 500ms. Scene progress continues to derive from the actual scroll position; a second independent timeline must not fight it. Wheel, touch, or keyboard scrolling interrupts programmatic scrolling immediately. No automatic focus movement on scroll-derived stage changes.

For tap mode, selection transitions the scene to the selected canonical pose in 500 to 700ms and updates its panel. Rapid selections cancel the old transition and interpolate from the current pose to the latest target. Never queue four transitions. The URL hash is a stable deep link; use replacement for incidental scroll changes to avoid flooding history.

A visible Pause motion control stops entrance remainder, parallax, and animated camera/object transitions; stage changes then use static poses. Native scrolling and content navigation remain available. Motion preference persists only as a local public-page preference, independent of authentication state.

### Exit and lifecycle cleanup

The closing reveal lasts 500 to 700ms once it enters view; the artifact completes its pose and stops. Offscreen or hidden-page rendering stops. On route departure, kill timelines, triggers, frame work, observers, and event listeners; release renderer resources and owned geometries, textures, and materials. On WebGL context loss, reveal the matching poster and preserve the selected stage and controls. Do not run an endless automatic recovery loop.

## 7. Four-stage content and interaction

### 01 Sourcing

Plate layers separate by small, readable offsets and gather around the spine. The active explanation describes assembling requirements and supplier inputs into a mandate. Proposed label: “Define the mandate.” The visual does not rank real suppliers, show real quotes, or fabricate a procurement record.

### 02 Negotiation

Two major plates approach from opposing sides, align against the central policy rail, and stop with a visible seam. Proposed label: “Bring terms into alignment.” Explain policy-guided negotiation only to the extent supported by the product. No implied autonomous authorization, binding signature, guaranteed savings, or actual agreement acceptance.

### 03 Audit

The camera reveals four connected evidence segments along the spine. Their sequence communicates traceability, with HTML copy explaining reviewable decisions and supporting evidence. Proposed label: “Review the evidence.” A connected block is a narrative metaphor, not cryptographic proof or an assertion of regulatory certification. Avoid green checks and “verified” status unless explicitly framed as a visual example.

### 04 Settlement

The assembly closes around the aligned components and rests; one vermilion seam remains. Proposed label: “Prepare for settlement.” Persistent supporting line: “Illustrative payment-ready state. No payment has been initiated or completed.” Do not display a money transfer, provider success screen, completed receipt, wallet balance, transaction ID, or success confetti.

Selecting a stage changes only local presentation state. It sends no mutations, creates no procurement draft, invokes no agent, approves no terms, and initiates no settlement. Stage content is static marketing material, not an authenticated data preview.

## 8. Responsive and fallback behavior

### Wide desktop: 1280 to 1920px and above

Use the full asymmetric composition and shared scene. Cap typography and canvas resolution at large sizes. At 1920px, add whitespace rather than pushing the sculpture outside its reserved visual area. Keep the scene control rail close to the explanatory content.

### Compact desktop and tablet: 768 to 1279px

Reduce heading scale and sculpture width. At 1024px and above, allow scroll mode only if height is sufficient, starting around 720px. Below that height, use tap mode. At 768 to 1023px, stack heading and artifact, use a compact stage selector, and avoid pinning. Keep the introductory copy and workspace action ahead of the scene in DOM order.

### Mobile: 320 to 767px

Use a single column, 44px minimum touch targets, and four stage buttons arranged in a two-by-two grid if labels cannot fit in one row. No horizontally hidden stage controls. Hero type sits above an artifact poster with a reserved approximately 4:3 region. Put the workspace action before the lifecycle so visitors never need to finish a visual sequence to enter.

Default to stage-specific static posters on coarse-pointer/mobile devices. A lightweight WebGL option is an optional later enhancement only if profiling supports it; it is not required for parity. Mobile stage changes swap posters with at most a short opacity transition. No pointer parallax, pinned scene, or scroll-driven camera.

Use `svh` where helpful for stable scene sizing, with sensible minimum and maximum block sizes. Do not force 100vh when text, browser chrome, landscape orientation, or zoom makes it overflow. At 200% text resize and 400% page zoom, move to ordinary flow and preserve every action.

### Reduced motion and manual pause

When `prefers-reduced-motion: reduce` is active, render static poses, expose all necessary content, remove pinning and parallax, and use immediate stage changes. Avoid smooth programmatic scrolling and transformation reveals. A user's manual pause has the same effect on motion, without disabling navigation. If the OS preference changes while the page is open, stop active timelines and rebuild the appropriate mode without resetting focus or selection.

### Loading, no JavaScript, errors, and no WebGL

Server-render the headline, copy, links, and all stage explanations. A properly sized hero poster is the first visual and potential LCP asset. Fetch it eagerly; supply responsive sizes and intrinsic dimensions. Lifecycle posters below the fold may load lazily.

The canvas fades in only when ready; no spinner replaces the primary copy. If initialization exceeds about 3 seconds, retain the poster and stop blocking on enhancement. Catch import, asset, and renderer failures within the scene boundary, leaving the page functional. No JavaScript yields a complete static document with ordinary anchors. No WebGL yields posters and HTML controls. A missing poster gets a neutral reserved area with the stage explanation intact.

## 9. Accessibility

Use a skip link, header, named navigation, main, sections, and footer. Maintain one H1 and logical H2/H3 order. All interactive controls are native links or buttons with visible accessible names, hover, active, disabled where relevant, and clear `:focus-visible` treatment. Essential controls never live inside the canvas.

Treat the canvas as decorative (`aria-hidden`) because adjacent HTML explains all stage meaning. Supply concise alternatives for meaningful posters; use empty alt text when the same meaning is fully duplicated nearby. Never expose unlabeled meshes as interactive objects.

Enhanced tabs follow the standard keyboard model: Left/Right arrows move between tabs, Home/End reach the ends, Enter/Space activates when using manual activation. Tab enters and leaves the group naturally. Keep focus on the selected control; do not move it into the panel automatically. The active panel is labelled by its tab. A scroll-driven update may change selected styling without generating continuous live announcements; if that conflicts with keyboard focus in the tab group, suspend scroll-driven selection until focus leaves.

Mobile menus, if ultimately needed, must return focus on close and support Escape. Prefer avoiding a menu when two header actions fit. No scroll traps, drag-only actions, custom cursor, flashing, autoplay audio, or zoom restriction. Screen-reader reading order follows the lifecycle even when the scene is sticky. Check forced-colors mode, increased text spacing, keyboard-only navigation, and OS motion settings.

## 10. Performance budgets and measurement

These are proposed acceptance targets, not measured results. If the visual quality and budget conflict, reduce scene complexity and fall back before relaxing usability targets.

- LCP at or below 2.5s, CLS at or below 0.1, and INP at or below 200ms at the 75th percentile once sufficient field data exists. Before launch, report lab conditions and results separately; lab tests cannot prove field percentiles.
- Initial public-page JavaScript target: at most 180KB gzip including its necessary framework/runtime share, excluding deferred WebGL. Separately report incremental landing code, targeting at most 60KB gzip. Verify feasibility against the actual application baseline.
- Deferred graphics chunk target: at most 350KB gzip for R3F, Three.js, helpers, and scene logic. Use selective imports; do not include an entire helper collection by default.
- Hero poster target: at most 180KB transferred for mobile and 300KB desktop. Initial above-the-fold transfer target: at most 700KB, excluding the explicitly deferred graphics bundle and its assets.
- Fonts target: at most 120KB transferred for required initial subsets. Avoid loading decorative alternate weights.
- Graphics assets target: at most 1.5MB compressed in total for the first enhanced scene, including environment, textures, and model if used. Use a modest compressed environment; no unbounded remote HDR download.
- Scene target: at most 60 draw calls and 100,000 visible triangles on desktop; at most 30 draw calls and 40,000 triangles if a mobile scene is enabled. Use shared geometry/materials and instancing for repeated evidence blocks.
- DPR starts at 1 to 1.5 desktop and at most 1.25 for a mobile enhancement. Never render unbounded device DPR on a high-density display.
- Full-motion desktop target: near 60fps while active on the documented test laptop, with a p95 frame duration at or below 20ms during the scored sequence. Optional mobile enhancement must sustain at least 30fps, targeting p95 at or below 33ms on the documented phone. Record measurement method and trace; do not infer frame rate from video or screenshots.
- Texture allocation target: at most 64MB for scene-owned textures; inspect dimensions and formats. Record total renderer memory observations separately because browsers do not expose portable total GPU memory.

Render on demand when a pose is still. Request frames only during active scrub, transition, or pointer response. IntersectionObserver and document visibility suspend work offscreen and in background tabs. Lower quality after sustained slow frames, using hysteresis to avoid oscillation: reduce DPR, then shadow quality, then choose static posters. Capability checks are advisory; actual frame performance decides. Save-Data, reduced motion, unavailable graphics, and initialization failure favor static mode.

Test a production build on a mid-range laptop with integrated graphics and at least one physical mid-range Android phone, plus iOS Safari. Record exact device, OS, browser version, viewport, network profile, cache state, and run date. Use repeated cold and warm loads. Inspect LCP/CLS, interaction latency, network waterfalls, main-thread long tasks, frame traces, and memory during repeated entry/exit. No large graphics request should start before the page's essential HTML and hero poster have priority.

## 11. Route isolation and financial safeguards

Proposed route: `/welcome`. Do not replace `/` merely to make the marketing page the default. First inspect root routing, session hydration, middleware, shared providers, deep links, and existing entry actions. If `/welcome` is already occupied, choose another unused public path during implementation review.

A route group such as `(marketing)` may organize the source but is not an authentication boundary. Real access control remains where it already exists. The public route is allowed only through a narrowly scoped routing decision after inspecting existing middleware. Never broaden a public allowlist to cover application, API, auth callback, or settlement routes.

Keep graphics imports, GSAP registration, fonts where possible, and marketing CSS below the public route boundary. The application's root layout must not import them. If current global providers initiate private requests, use an appropriate isolated layout arrangement after inspecting the source, preserving provider behavior on authenticated routes. Route isolation must be demonstrated in built bundles and browser requests, not inferred from folder names.

Enter workspace is an ordinary link through the application's existing safe entry flow. Preserve session restoration, existing return-to validation, organization selection, authorized deep links, and unauthenticated redirects. The landing page must not invent an arbitrary redirect parameter or inspect credentials. Do not prefetch mutation endpoints or provider checkout flows.

Preserve all existing financial safeguards, including those discovered in source: server-side authorization and organization scoping, amount/currency validation, policy approvals, settlement state transitions, idempotency, provider verification, webhook validation, audit integrity, CSRF protections, and validated callback destinations. These are preservation requirements, not claims that each specific mechanism was inspected here.

A provider return URL, callback query string, or animated seal never establishes payment success. Existing server-verified settlement status remains authoritative. Keep settlement return/cancel screens and auth confirmation screens outside marketing layouts and animation boundaries. No demo state persists to application storage or crosses into a real workflow.

Do not add credentials, live transaction data, provider scripts, new analytics services, or third-party trackers to make the landing scene appear real. Preserve existing CSP and security headers. Self-host assets; inspect any loader's worker/decoder needs before configuring CSP. Avoid introducing broad script or connection exceptions for graphics convenience.

## 12. Proposed component architecture

Adapt naming to the real repository after inspection. This tree describes responsibilities rather than an implementation mandate.

```text
src/app/(marketing)/welcome/page.tsx       server-rendered composition and metadata
src/app/(marketing)/layout.tsx             scoped marketing layout, if compatible
src/components/landing/
  LandingHeader.tsx                        existing mark and real entry link
  LandingHero.tsx                          HTML heading, copy, poster, actions
  LifecycleSection.tsx                    four semantic stage sections
  LifecycleControls.tsx                   enhanced selection and keyboard behavior
  LifecyclePanel.tsx                      stage copy and demonstration disclosure
  LandingClosing.tsx                      final entry action
  MotionControl.tsx                       local pause preference
  SceneBoundary.tsx                       deferred import and failure recovery
  StaticSceneFallback.tsx                 responsive posters and reserved space
  landing.css                             scoped tokens, composition, states
  lifecycle-content.ts                    static editorial content and IDs
  scene-config.ts                         poses, thresholds, quality limits
src/components/landing/webgl/
  LandingCanvas.tsx                       one renderer for the active scene
  AgreementArtifact.tsx                   shared parts and materials
  SceneLighting.tsx                       environment and shadow strategy
  SceneDirector.tsx                       normalized progress to transforms
src/components/landing/motion/
  useLandingMotion.ts                     scoped GSAP setup and teardown
  useSceneQuality.ts                      capability and observed quality policy
  useMotionPreference.ts                  OS setting and manual pause
public/landing/                           approved, optimized visual assets
```

Use one active canvas at a time. A route-local visual layer may follow the reserved hero and lifecycle regions without intercepting input; if that proves fragile, unmount the hero scene before mounting the lifecycle scene. Do not leave two rendering contexts running concurrently. HTML remains in normal document flow regardless of canvas strategy.

State boundaries:

- Content: immutable stage IDs, copy, illustration disclosures, and verified navigation destinations.
- Presentation: active stage, normalized progress, motion preference, input mode, readiness, and quality tier.
- Scene: interpolated transforms and resource ownership.
- Application: existing auth, organization, procurement, audit, and payment state. The landing page has no write access to these domains.

Use a small explicit state model: poster → loading → enhanced, with any graphics failure returning to poster. Stage and focus survive that transition. Scene errors must not propagate into auth or entry navigation.

Dependency versions and the compatibility of React, Next.js, R3F, Drei, Three.js, and GSAP are unresolved until the manifest and official documentation are checked at implementation time. This specification makes no version or licensing claim. Use the current project package manager and avoid dependency churn outside this feature. SplitText is optional; simple HTML word spans can provide the required reveal without assuming an additional plugin.

## 13. Review and implementation sequence

1. Review this document and recover the original reference image. Compare its headline geometry, negative space, object crop, metal roughness, shadows, and dark-section proportions against this proposal. Record approved departures.
2. Inspect the real source and existing Quiet Authority tokens, routes, entry links, security boundaries, test scripts, and dependency compatibility. Resolve the public route before editing routing.
3. Approve a static composition and artifact silhouette at desktop and mobile sizes. Produce assets only within the approved implementation scope.
4. Build server HTML and poster fallbacks first; verify real navigation and route isolation.
5. Add the single enhanced scene, entrance score, four canonical poses, and desktop scroll progression.
6. Add direct selection, conflict handling, pause, responsive modes, recovery, and cleanup.
7. Run the visual, accessibility, performance, and authenticated regression checks below. Submit evidence for review before release.

No implementation starts as part of this document delivery. No commit, push, deployment, or dependency change is included.

## 14. Acceptance criteria

### Design review acceptance

- [ ] The original reference image is available for side-by-side review, or the reviewer explicitly accepts proceeding from the written description. Until then, exact visual fidelity remains unverified.
- [ ] The reviewer approves the monochrome editorial direction, proposed type, chrome agreement silhouette, vermilion placement, composition, and motion score.
- [ ] Final copy is checked against actual capabilities. The settlement demonstration disclaimer is approved and visible.
- [ ] Public route and entry destinations are confirmed from source, with the existing application behavior documented.

### Visual and interaction acceptance after implementation

- [ ] Browser captures at 390, 768, 1024, 1280, 1440, and 1920px show the intended hierarchy, readable type, coherent chrome, and deliberate whitespace. Add a 320px reflow check and landscape/short-height checks.
- [ ] Reference comparison records the approved headline scale, sculpture position/crop, metal lighting, shadows, and section rhythm. No claim of fidelity relies only on technical completeness.
- [ ] Every stage has a distinct canonical composition, accurate HTML explanation, working direct selection, and reversible scroll behavior where enabled.
- [ ] Rapid selection, reversing scroll, interrupting programmatic scrolling, resizing, and returning through browser history produce no stale pose, stuck pin, or lost focus.
- [ ] Primary actions work immediately, including before graphics load, without JavaScript, and after renderer failure.
- [ ] No fabricated transactions, financial outcomes, customer evidence, compliance assertions, or live statuses appear.

### Accessibility and resilience acceptance

- [ ] Keyboard-only traversal, screen-reader reading order, tab semantics, skip navigation, focus visibility, and touch targets are manually verified.
- [ ] Normal text, large text, controls, and focus indicators meet their required measured contrast in light, dark, and transition states.
- [ ] Reduced motion, manual pause, forced colors, 200% text resizing, and 400% zoom preserve navigation and all content.
- [ ] No horizontal page overflow at tested widths; no scroll trap, pointer-only interaction, or hidden stage content in the static document.
- [ ] Slow loading, failed imports, unavailable WebGL, context loss, and missing optional assets retain a usable document.

### Performance and isolation acceptance

- [ ] Production measurements report each budget with device and network conditions; any exceptions have an explicit visual/performance review. Targets are not reported as achieved without measurements.
- [ ] Graphics and animation chunks are absent from authenticated-route loading unless the visitor actually enters the public page. Returning to the application stops scene work and leaves no accumulated listeners or active contexts.
- [ ] Repeated public-page entry/exit shows no persistent growth in scene-owned resources and no unexpected background rendering.
- [ ] Authenticated application screenshots retain Quiet Authority styling. Public styles do not affect forms, tables, shell navigation, auth screens, or settlement screens.
- [ ] Existing session restore, signed-in entry, signed-out entry, authorized deep links, organization switching, auth confirmation, and settlement return/cancel behavior remain intact.
- [ ] Protected routes remain protected; landing interactions send no business mutations and reveal no private organization data. Existing financial and authentication checks continue to pass.
- [ ] Run the repository's actual relevant tests, type check, lint, production build, security checks, and whitespace validation after implementation. Record exact commands and results; do not assume scripts or tools exist.

## 15. Specification delivery check

This check covers the design document only. UI rendering, build, contrast, frame-rate, and authenticated regressions are future acceptance work, not completed verification.

- PASS, scope: the deliverable is DESIGN.md only; no UI implementation or application modification is included.
- PASS, hard constraints: the specification forbids fictional social proof and financial status claims, requires functional HTML entry actions and fallbacks, and defines keyboard and motion behavior. Runtime conformance remains untested.
- PASS, purpose: editorial scale creates hierarchy; chrome carries the agreement metaphor; asymmetry gives the artifact room; vermilion marks alignment; dark contrast closes the narrative. Each major technique has a stated role.
- PASS, identity and rhythm: section 2 declares the design dials and recurring agreement motif; sections 4 through 7 specify different spatial and motion rhythms.
- PASS, resilience specification: sections 8 through 11 define mobile, reduced-motion, graphics failures, route isolation, and preservation of financial/auth safeguards.
- PASS, evidence honesty: section 1 records the unavailable image and source; section 10 labels all budgets as targets; section 14 leaves implementation acceptance unchecked.

Open review items: actual reference image, existing source tree and entry routes, approved font assets, final capability copy, and the measured cost of the chosen graphics dependencies.
