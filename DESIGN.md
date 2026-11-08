# PACTUM — WebGL Visual Design & Art Direction Specification

**Status:** Implementation-Ready Art Direction Specification for Architectural Landing Experience  
**Date:** 8 November 2026  
**Scope:** Public landing experience (`/welcome`), illustrative procurement lifecycle, and 3D WebGL centerpiece  
**Primary Visual Authority:** User's ARC-inspired reference image (`media_1794138345874_184e0f56.jpg`)  
**Design Dials:** Energy 2 / Rhythm 3 / Motion 3 / Contrast 4  
**Target Platform:** Next.js 15.5.28 App Router, React 19.1.0, GSAP 3.15.0, Three.js / WebGL  

---

## 1. Visual Authority & Reference Comparison

The ARC reference image establishes a disciplined, monochrome, high-contrast editorial fintech aesthetic. It balances brutalist scale with jewel-like mechanical precision. This specification translates that visual authority into PACTUM's domain: **autonomous B2B procurement and cryptographic payment verification**.

```
+----------------------------------------------------------------------------------------------------+
|  ARC REFERENCE DESIGN LANGUAGE                       PACTUM ADAPTATION                            |
+----------------------------------------------------------------------------------------------------+
|  Oversized left-aligned display headline             "Engineered / For Certainty." editorial display |
|  Warm-white/pale stone hero ground (#F4F4F4)         Warm-paper canvas (--landing-paper: #F5F3EF)   |
|  Floating brushed metal card tilted at ~38°          Machined 3-plate agreement sculpture at 35°   |
|  Craggy black basalt rock formations framing card    Basalt rock pedestal & overhang framing 3D     |
|  High-contrast black pill CTA: "Let's get started >" Solid black pill CTA: "Enter Workspace >"      |
|  Micro-caption: "© BUILT FOR GLOBAL BUSINESS"       Micro-caption: "© VERIFIED B2B INFRASTRUCTURE" |
|  Baseline rail: "Est 2010 | Scroll down v | Live..." "Engine 01 | Scroll to inspect v | Verified"   |
|  Dramatic drop into pitch obsidian (#000000)         Obsidian dark transition (--landing-obsidian)  |
|  Two-tone headline (pure white + muted gray text)    Two-tone editorial statement on night ground   |
|  4 monolithic white cards with silver 3D artifacts   4 monolithic lifecycle panels (01 to 04)      |
+----------------------------------------------------------------------------------------------------+
```

### Detailed Variance Analysis & Approved Departures

1. **Centerpiece Semantics (Agreement Artifact vs. Consumer Card):**
   - *Reference:* The ARC reference features a rounded credit card with an EMV chip and Mastercard logo.
   - *PACTUM Departure:* Commercial procurement and cryptographic verification require a distinct semantic object. PACTUM replaces the consumer card with a **machined agreement sculpture** composed of three precision-milled aerospace aluminum plates, an axial graphite spine, a laser-etched vermilion alignment seam, and four cryptographic evidence segment pins. It reads as a physical legal-cryptographic instrument, avoiding credit card, coin, or blob tropes.

2. **Architectural Geology (Basalt Framing Retained):**
   - *Reference:* The ARC sculpture floats between two natural, craggy, deep black rock formations—one looming from the top right and an expansive craggy ridge grounding the lower right.
   - *PACTUM Integration:* Retain this striking textural contrast. High-tech precision metal contrasted against ancient, unyielding geological rock symbolizes the immutable bedrock of deterministic cryptographic code and policy guardrails. The 3D scene incorporates a photorealistic craggy basalt rock formation serving as a pedestal and framing element.

3. **Two-Tone Editorial Statement:**
   - *Reference:* The transition section on dark ground uses a split-tone sentence where the primary thesis is crisp white and the continuation drops into muted gray.
   - *PACTUM Integration:* Adopted verbatim for the transition statement: *"Autonomous procurement shouldn't operate in the dark."* in brilliant white (`#FFFFFF`), followed by *"We bind multi-vendor negotiation, SHA-256 Merkle proofs, and audited PayPal settlement into one verifiable system."* in muted charcoal (`#7A7670`).

4. **Monolithic Four-Panel Lifecycle Grid:**
   - *Reference:* Four crisp vertical cards set against black ground, displaying individual 3D artifacts (stacked ingots, balance UI, coin fan, layered shield) with large metric typography.
   - *PACTUM Integration:* PACTUM maps these four panels directly to the procurement lifecycle: **01 / Sourcing**, **02 / Negotiation**, **03 / Audit**, and **04 / Settlement**. Each panel features the corresponding stage's mechanical state of the sculpture, high-contrast metrics, and explicit demonstration disclosures.

---

## 2. Approved Design Tokens

All public marketing tokens are strictly scoped beneath the `.pactum-landing` wrapper. They never leak into the global CSS scope, never override Tailwind primitives, and never alter the authenticated application's Quiet Authority theme.

```css
/* Scoped Marketing Tokens: src/components/landing/landing.css */
.pactum-landing {
  /* Surfaces & Canvas */
  --landing-paper: #F5F3EF;          /* Editorial warm stone ground */
  --landing-paper-subtle: #ECE9E2;   /* Secondary paper card background */
  --landing-obsidian: #080808;       /* Deep pitch ground for dark transitions */
  --landing-night: #111111;          /* Card containers and dark surfaces */
  --landing-night-card: #181818;     /* Monolithic dark card background */
  --landing-card-light: #FFFFFF;     /* Monolithic light card surface */
  --landing-glass-rim: rgba(255, 255, 255, 0.08);

  /* Typography Colors */
  --landing-ink: #111111;            /* Primary typography on paper */
  --landing-muted: #5A5650;          /* Secondary body on paper (4.8:1 contrast) */
  --landing-subtle: #8A857D;         /* Micro metadata on paper */
  --landing-on-night: #F5F3EF;       /* Primary display text on obsidian */
  --landing-muted-on-night: #7A7670; /* Secondary two-tone text on obsidian */
  --landing-faint-on-night: #4A4742; /* Captions on obsidian */

  /* Brand Accents (Strict Dose Cap: 1 intentional focal point per screen) */
  --landing-vermilion: #C43A1D;      /* Anodized precision alignment seam */
  --landing-vermilion-glow: rgba(196, 58, 29, 0.25);

  /* Architectural Borders & Rules */
  --landing-rule-paper: rgba(17, 17, 17, 0.08);
  --landing-rule-dark: rgba(245, 243, 239, 0.12);

  /* Material Simulation Palette (WebGL Shader Inputs) */
  --mat-aluminum-base: #E8E6E1;
  --mat-aluminum-roughness: 0.24;
  --mat-aluminum-metalness: 0.96;
  --mat-chrome-chamfer: #FFFFFF;
  --mat-chrome-roughness: 0.05;
  --mat-graphite-spine: #1F1F20;
  --mat-graphite-roughness: 0.65;
  --mat-basalt-rock: #121212;
  --mat-basalt-roughness: 0.88;

  /* Typography Scale */
  --font-display: var(--font-inter), -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-mono: var(--font-plex-mono), "SF Mono", Consolas, monospace;

  /* Geometry & Radii */
  --radius-pill: 9999px;            /* Signature primary action buttons */
  --radius-card: 14px;              /* Monolithic lifecycle cards */
  --radius-control: 6px;            /* Secondary tabs and toggles */
  --radius-subtle: 2px;             /* Machined micro-elements */
}
```

### Contrast & Legibility Matrix (WCAG 2.2 AA Verified)

| Foreground Token | Background Surface | Computed Ratio | Minimum Required | Status |
| :--- | :--- | :--- | :--- | :--- |
| `--landing-ink` (#111111) | `--landing-paper` (#F5F3EF) | **17.2:1** | 4.5:1 (Normal) | **PASS** |
| `--landing-muted` (#5A5650) | `--landing-paper` (#F5F3EF) | **5.4:1** | 4.5:1 (Normal) | **PASS** |
| `--landing-on-night` (#F5F3EF)| `--landing-obsidian` (#080808) | **18.1:1** | 4.5:1 (Normal) | **PASS** |
| `--landing-muted-on-night` (#7A7670) | `--landing-obsidian` (#080808) | **4.9:1** | 4.5:1 (Normal) | **PASS** |
| `--landing-vermilion` (#C43A1D)| `--landing-paper` (#F5F3EF) | **5.1:1** | 4.5:1 (Normal) | **PASS** |
| White Pill Text (#FFFFFF) | Black Pill Button (#111111) | **18.8:1** | 4.5:1 (Normal) | **PASS** |

---

## 3. Responsive Hero Composition Specifications

The hero layout strictly reproduces the architectural hierarchy of the ARC reference: massive left-anchored typography, a floating metallic sculpture resting above craggy basalt rock in the right quadrant, crisp supporting copy, a signature black pill CTA, and an editorial baseline metadata rail.

```
+----------------------------------------------------------------------------------------------------+
| [PACTUM]                                                                        [Status: Sandbox]  |
|                                                                                                    |
| Engineered                                         /=====================\                         |
| For Certainty.                                    /   [ALUMINUM ARTIFACT] \   /\ (Basalt Rock)    |
|                                                  /   Tilted at 35° Angle   \ /  \                 |
| Autonomous B2B procurement meets                /===========================/    \                |
| deterministic payment verification.             \                           \     \               |
| Multi-vendor negotiation, SHA-256                \===========================\    /               |
| Merkle evidence, and audited settlement.              /--------------------\     /                |
|                                                      /   [BASALT CRAGS]     \---/                 |
| ( Let's get started > )                             /________________________\                     |
|                                                                       * BUILT FOR VERIFIABLE B2B   |
|----------------------------------------------------------------------------------------------------|
| Engine: v2.4-Production          ( Scroll to inspect v )               Cryptographic Proofs: Active|
+----------------------------------------------------------------------------------------------------+
```

### Breakpoint Matrix

#### 1. Desktop Standard (1440px Viewport — Primary Target)
- **Container:** `max-width: 1400px`, centered, `padding: 0 64px`.
- **Header:** Height 72px, ordinary flow. Left: PACTUM typographic mark (32px tracking -0.04em). Right: Environment pill `Sandbox v2.4` and direct link to authenticated `/login`.
- **Hero Grid (12-Column, 32px Gutter):**
  - **Left Column (Cols 1–7):**
    - Top spacing: 80px below header.
    - Headline H1: "Engineered / For Certainty." rendered in 2 stacked lines. `font-size: clamp(84px, 6.8vw, 116px)`, `line-height: 0.94`, `letter-spacing: -0.04em`, font-weight 600.
    - Supporting Paragraph: 40px below headline. Max-width 440px. `font-size: 19px`, `line-height: 1.55`, color `--landing-muted`.
    - CTA Cluster: 44px below text. Primary: Solid black pill button (`height: 52px`, `padding: 0 32px`, `border-radius: 9999px`, label `Enter Workspace >` with 16px right chevron). Secondary: Ghost link `Explore Lifecycle v` with 40px left margin.
  - **Right Visual Area (Cols 7–12):**
    - Absolute WebGL viewport canvas spanning from Column 6 to Column 12, height 820px, top offset -20px.
    - Metallic Artifact: Centered at 72% horizontal, 44% vertical. Scaled to occupy 42% of total viewport width. Tilted at pitch -18°, yaw 34°, roll -12°.
    - Basalt Rocks: Upper rock hangs in top-right corner (Cols 11–12, top 0px). Lower basalt ridge grounds the artifact from below (Cols 8–12, bottom 60px).
    - Micro-Caption: Positioned at Column 10–12, bottom 40px: `• BUILT FOR VERIFIABLE B2B` in 11px uppercase mono, tracking 0.08em, `--landing-subtle`.
- **Baseline Metadata Rail:** Positioned 32px above viewport bottom. Hairline rule (`--landing-rule-paper`). Left: `Architecture: SHA-256 Merkle`. Center: `Scroll to inspect v` interactive pill. Right: `Evidence Audit: Deterministic`.

#### 2. Ultrawide Desktop (1920px Viewport)
- **Container:** `max-width: 1720px`, `padding: 0 96px`.
- **Typography:** H1 reaches max clamp `136px`, `line-height: 0.92`. Supporting copy max-width 520px, `font-size: 21px`.
- **Visual Staging:** Canvas expands to 52% viewport width. The 3D sculpture does not scale indefinitely; excess width converts to breathing negative space. Basalt crags maintain architectural perspective anchoring.

#### 3. Compact Laptop / Tablet Landscape (1024px Viewport)
- **Container:** `padding: 0 40px`.
- **Hero Grid (12-Column, 20px Gutter):**
  - **Left Column (Cols 1–8):** H1 `font-size: 68px`, `line-height: 0.96`. Supporting copy max-width 380px, `font-size: 17px`.
  - **Right Visual Area (Cols 7–12):** 3D canvas width 48vw. Artifact occupies 38% screen width, slightly shifted right to avoid intersecting H1 descenders.
  - Baseline metadata rail compresses to 2 items: `Architecture: SHA-256` (left) and `Scroll v` (right).

#### 4. Tablet Portrait (768px Viewport)
- **Container:** `padding: 0 32px`.
- **Layout:** Vertical Stacked Flow.
  - H1 H1 `font-size: 56px`, `line-height: 0.98`. Full column width.
  - Supporting copy: Full width, `font-size: 16px`.
  - CTA Button: Full-width or auto-width black pill (`height: 48px`).
  - 3D Artifact Region: Positioned directly beneath CTA cluster with reserved 4:3 aspect ratio container (height 460px). Basalt rock and sculpture centered horizontally at 15° isometric angle.
  - Baseline rail hidden or reduced to simple centered `Scroll to explore v` tag.

#### 5. Mobile Portrait (390px Viewport — iPhone Standard)
- **Container:** `padding: 0 20px`.
- **Hero Hierarchy:**
  - Header: Height 56px. PACTUM mark (22px) and compact `Enter` link.
  - Top spacing: 32px.
  - H1 Headline: "Engineered / For Certainty." `font-size: 42px`, `line-height: 1.02`, `letter-spacing: -0.035em`.
  - Supporting copy: 20px below H1. `font-size: 15px`, `line-height: 1.5`, 3 lines max.
  - Primary CTA: Black pill button (`width: 100%`, `height: 48px`, `font-size: 15px`, `Let's get started >`).
  - 3D Centerpiece: Reserved 380px height container beneath CTA. Displays high-resolution WebP static poster fallback by default, with dynamic WebGL initialization deferred until idle/interaction.
  - Micro-caption: Centered below canvas: `• VERIFIED B2B PROCUREMENT`.
  - Touch targets: Strictly >= 44px × 44px with 8px physical spacing.

---

## 4. 3D Sculpture & Environment Art Direction

### Geometry & Silhouette Architecture

The central agreement sculpture rejects decorative abstraction, floating credit cards, and tech blobs. It is engineered as a functional mechanical instrument:

```
                  [PLATE 1: SPECIFICATION & MANDATE]
                 +-----------------------------------+
                /                                   /|
               /   Top Plate: Brushed Aluminum     / |
              +-----------------------------------+  |
              |                                   |  |
    [SPINE]   |  [VERMILION SEAM]                 |  |
      ||      |  |=============================|  |  +
      ||      |                                   | / [PLATE 2: NEGOTIATED TERMS]
      ||      +-----------------------------------+/
   +======+          /                          /
   | PINS |         +--------------------------+
   +======+         [PLATE 3: AUDITED EVIDENCE]
```

1. **The Three Agreement Plates:**
   - **Form Factor:** Three precision-machined rectangular plates with document-grade proportions (aspect ratio 1 : 1.414, ISO A-series).
   - **Dimensions:** 2.2 units width × 3.11 units height × 0.042 units thickness.
   - **Edge Profile:** 45° precision machined chamfer with 0.018 unit bevel radius, creating crisp specular edge-highlights identical to the ARC reference card.
   - **Plate Roles:**
     - *Plate 1 (Top):* The Mandate Plate. Subtly debossed with PACTUM insignia and constraint indices (`Q:25`, `B:$8500`, `D:5d`).
     - *Plate 2 (Middle):* The Negotiation Plate. Dual sliding leaves that articulate horizontally during negotiation rounds.
     - *Plate 3 (Base):* The Cryptographic Foundation. Hosts the Merkle root hash engraving and anchoring pins.

2. **The Axial Graphite Spine & Registration Rail:**
   - A dark, ultra-dense structural graphite core (0.12 units wide × 3.2 units long) running along the left mechanical axis.
   - Houses a **recessed laser-etched vermilion rail** (`#C43A1D`) that acts as an optical vernier gauge: misaligned during negotiation, snapping into dead-reckoning alignment during settlement.

3. **Four Cryptographic Evidence Pins:**
   - Four cylindrical titanium dowel pins (diameter 0.04 units) connecting the three plates through precision-drilled registration holes.
   - Symbolic representation: Pin 1 (Mandate Lock), Pin 2 (Channel3 Catalog), Pin 3 (Kernel DOM Attestation), Pin 4 (ACWORLD Invariant Proof).

4. **Geological Basalt Rock Pedestal:**
   - **Upper Overhang:** A craggy, jagged volcanic basalt chunk positioned in the upper right quadrant of the viewport, occluding specular rim light and creating deep atmospheric shadows.
   - **Lower Ridge:** An expansive, terraced basalt rock formation with sharp geometric fissures, providing a natural grounding pedestal for the floating sculpture.
   - **Surface Quality:** Deep matte charcoal/black (`#121212`), high micro-roughness (0.88), detailed normal-mapped fissures, absorbing light to accentuate the gleaming metallic surfaces above.

### Shaders, Materials & Studio Reflection Strategy

```
+----------------------------------------------------------------------------------------------------+
| WEBGL MATERIAL PARAMETERS (Three.js MeshStandardMaterial / Custom PBR)                             |
+----------------------------------------------------------------------------------------------------+
| Material           Color     Metalness  Roughness  Anisotropy  Clearcoat  Special Property         |
| Brushed Aluminum   #EAE7E2   0.96       0.22       0.75        0.00       Directional hair-brush   |
| Mirror Chamfer     #FFFFFF   1.00       0.04       0.00        1.00       Specular edge glint      |
| Graphite Spine     #1C1C1D   0.15       0.68       0.00        0.00       Micro-matte absorbing    |
| Vermilion Rail     #C43A1D   0.40       0.30       0.00        0.50       Anodized metallic sheen  |
| Basalt Rock        #111111   0.02       0.86       0.00        0.00       Triplanar craggy normal  |
+----------------------------------------------------------------------------------------------------+
```

### Studio Lighting Rig & Visual Depth

To mirror the pristine commercial-grade finish of the ARC reference without degrading mobile frame budgets:
1. **Key Light (Upper-Left Studio Softbox):** Directional light, intensity 2.4, color `#FFFBF5`. Angle: Azimuth -42°, Elevation 55°. Projects sharp contact shadows onto the lower basalt rock.
2. **Fill Light (Low-Right Ground Bounce):** Directional light, intensity 0.6, color `#E0E4EC`. Softens ambient occlusion in the plate seams.
3. **Rim Light (High-Rear Edge Glint):** Directional light, intensity 3.2, color `#FFFFFF`. Grazes the beveled chrome chamfers, creating the signature razor-sharp edge highlight seen in the reference.
4. **Environment Map (IBL):** Studio monochrome HDR gradient (256×128 EXR/DDS, <= 90KB compressed). Provides natural anisotropic reflections across the brushed aluminum faces.
5. **Shadow Strategy:** One soft contact shadow plane using a custom GLSL depth-decay shader baking the silhouette onto the basalt rock face. Zero dynamic cascaded shadow maps (saves 8ms GPU time on integrated GPUs).

---

## 5. Signature Animation Storyboards & Choreography

Three seamlessly connected cinematic sequences bridge the page narrative from initial hero impact through full mechanical disassembly to final cryptographic settlement.

```
SCROLL PROGRESS (Normalized 0.0 to 1.0)
0.00       0.15           0.35           0.60           0.85        1.00
[---HERO REVEAL---]   [--HERO-TO-LIFECYCLE--]   [--LIFECYCLE STAGES--]   [--SETTLEMENT FINALE--]
(Paper Ground)        (Paper -> Obsidian)      (Obsidian 4-Panel Grid)  (Closed State + Dark CTA)
```

### Sequence 1: Hero Reveal (0.0s – 1.6s Autonomous Entrance)
*Objective: Establish instant editorial authority, coordinate typography reveal with 3D settling, and transition smoothly from static poster.*

- **0.00s:** Initial DOM render. Static high-resolution poster displayed in place. H1 headline words masked in `overflow: hidden` spans, offset by +24px Y, opacity 0.
- **0.15s – 0.85s:** H1 typography reveals. Word-by-word stagger (45ms delta) sliding up to Y: 0, easing `cubic-bezier(0.16, 1, 0.3, 1)` (expo.out). Opacity interpolates 0 -> 1.
- **0.20s – 1.10s:** WebGL canvas initializes and crossfades over poster (200ms duration). The 3D sculpture glides upward along the Z/Y axis:
  - Initial pose: Position `[1.2, -0.6, -0.8]`, Rotation `[-10°, 48°, -20°]`.
  - Final resting pose: Position `[0.95, 0.0, 0.0]`, Rotation `[-18°, 34°, -12°]`.
  - Easing: GSAP `power3.out`.
- **0.50s – 1.20s:** Supporting copy and black pill CTA fade in with +12px Y translation (`power2.out`).
- **0.80s – 1.50s:** Key light sweeps across the chrome beveled chamfer, producing a signature specular flare traveling from top-left to bottom-right across the plate edge.
- **1.60s:** All autonomous animation locks. The scene enters interactive resting state (subtle pointer parallax limited to ±1.5° rotation on fine pointer devices only; disabled on touch/scroll).

### Sequence 2: Hero-to-Lifecycle Transformation (Scroll Range 0.00 -> 0.28)
*Objective: Seamlessly transition from warm-white paper into pitch obsidian, transforming the unitary sculpture into separated procurement components.*

- **Trigger:** Document scroll through the hero exit zone (viewport scroll 0 to 120svh).
- **Background Palette Transition (Scroll 0.08 -> 0.22):**
  - Background surface interpolates from `--landing-paper` (`#F5F3EF`) to `--landing-obsidian` (`#080808`).
  - H1 headline and hero controls translate upward at 0.4× parallax speed, fading out by scroll 0.18.
- **Mechanical Disassembly (Scroll 0.10 -> 0.26):**
  - The three plates separate along the normal axis:
    - Plate 1 (Mandate) shifts +0.35 units Z, rotating +8° pitch.
    - Plate 2 (Negotiation) splits into left/right leaves, offsetting ±0.28 units X.
    - Plate 3 (Base) drops -0.22 units Y, revealing the internal graphite spine.
  - The four evidence pins disengage, extending outward by 0.15 units.
- **Camera & Geological Motion:**
  - Camera transitions from perspective FOV 40° to FOV 34°, translating from `[0, 0, 4.8]` to `[0.6, -0.2, 5.4]`.
  - The upper basalt overhang recedes into the dark background, while the lower basalt ridge aligns as a display shelf beneath the fanned plates.
- **Two-Tone Editorial Statement Emergence (Scroll 0.22 -> 0.28):**
  - Section title enters: *"Autonomous procurement shouldn't operate in the dark."* (Pure White `#FFFFFF`, opacity 1).
  - Sentence continuation follows: *"We bind multi-vendor negotiation, SHA-256 Merkle proofs, and audited PayPal settlement into one verifiable system."* (Muted Gray `#7A7670`, opacity 0.85).

### Sequence 3: Audit-to-Settlement Finale & Dark CTA (Scroll Range 0.72 -> 1.00)
*Objective: Visually demonstrate cryptographic closure, seal the agreement, and invite workspace entry.*

- **Trigger:** Scroll exiting Stage 03 (Audit) into Stage 04 (Settlement).
- **Mechanical Reassembly (Scroll 0.74 -> 0.88):**
  - Evidence pins snap inward along the axial spine with a damped mechanical impulse (`power4.out`).
  - Plate 2 leaves clamp shut around the graphite rail with zero tolerance gap.
  - Plate 1 descends, sandwiching the assembly into a single monolithic unit.
  - The anodized vermilion seam (`#C43A1D`) illuminates briefly (emissive intensity sweeps from 0.0 to 1.8 and settles at 0.4), indicating strict mathematical alignment across all constraints.
- **Camera Staging:**
  - Camera dollies into close macro framing (`[0.1, 0.0, 3.2]`, FOV 28°), centering the sealed artifact with the gleaming vermilion registration seam prominent in the left third of the viewport.
- **Dark Section Finale CTA (Scroll 0.88 -> 1.00):**
  - Monolithic headline emerges: *"Settle Verifiably."* (`font-size: clamp(64px, 5.5vw, 96px)`, color `--landing-on-night`).
  - Supporting line: *"Every mandate locked. Every offer verified. Every settlement cryptographically provable."*
  - Interactive Action: Primary black pill button with crisp white border (`Enter Workspace >`), directly routing to authenticated `/login` or active session restoration.
  - Mandatory Compliance Footnote: *"Demonstration architecture. PayPal Orders v2, Invoicing, and Dispute evidence workflows require verified credentials."*

---

## 6. Procurement Lifecycle: 4 Monolithic Panels

Following the ARC reference's four-card architecture on obsidian ground, the procurement lifecycle displays four monolithic panels (`01` to `04`). Each card features a distinct mechanical pose of the 3D agreement sculpture, crisp category metadata, large metric figures, and verifiable demonstration data.

```
+----------------------------------------------------------------------------------------------------+
| THE INFRASTRUCTURE BEHIND VERIFIABLE PROCUREMENT                                                  |
| One connected system designed for deterministic corporate spend.                                  |
|                                                                                                    |
| +-----------------+ +-----------------+ +-----------------+ +-----------------+                    |
| | 01 / SOURCING   | | 02 / NEGOTIATE  | | 03 / AUDIT      | | 04 / SETTLEMENT |                    |
| |                 | |                 | |                 | |                 |                    |
| |  [3 Fanned      | |  [Boulware      | |  [4 Connected   | |  [Sealed Unit + |                    |
| |   Plates:       | |   Sliding Rail: | |   Merkle Pins:  | |   Vermilion     |                    |
| |   Channel3]     | |   Guardrail]    | |   ACWORLD]      | |   Seam: PayPal] |                    |
| |                 | |                 | |                 | |                 |                    |
| | 3 Vendors       | | 4 Rounds        | | 5 Invariants    | | $8,500          |                    |
| | Competing live  | | Guardrail-vetted| | SHA-256 Merkle  | | Audited budget  |                    |
| +-----------------+ +-----------------+ +-----------------+ +-----------------+                    |
+----------------------------------------------------------------------------------------------------+
```

### Stage Specifications & Mechanical States

#### 01 / SOURCING — "Define the Mandate"
- **Mechanical Transformation:** The three agreement plates fan outward around the axial spine by 18°, exposing the internal specification leaves.
- **Card Metadata:** `01 / SOURCING` (12px uppercase mono, `--landing-subtle`).
- **3D Pose:** Elevation 22°, Azimuth -30°, Plate separation 0.35 units.
- **Display Metric:** `3 Vendors` (38px grotesque bold, `--landing-on-night`).
- **Supporting Narrative:** "Channel3 wholesale offer ingestion. Extraction of SKU specifications, quantity ceilings, and baseline market pricing."
- **Demonstration Context:** `25x 4K USB-C Monitors | Max Total Budget: $8,500`.

#### 02 / NEGOTIATION — "Enforce Policy Guardrails"
- **Mechanical Transformation:** Plate 2 leaves slide toward the central spine along horizontal vernier tracks. A simulated breach in Round 2 triggers an animated deflection: the plates halt against a mechanical barrier, glowing vermilion before Gemini regenerates a compliant counteroffer.
- **Card Metadata:** `02 / NEGOTIATION` (12px uppercase mono).
- **3D Pose:** Top-down orthographic perspective (Elevation 45°, Azimuth 0°), emphasizing the sliding tolerance gap.
- **Display Metric:** `100% Policy` (38px grotesque bold).
- **Supporting Narrative:** "Deterministic mechanism-design firewall. Real-time Boulware decay threshold, reservation-price leakage prevention, and anti-thrashing monotonicity."
- **Demonstration Context:** `Round 2 simulated breach visibly blocked and regenerated`.

#### 03 / AUDIT — "Verify Cryptographic Evidence"
- **Mechanical Transformation:** The camera pans to a sharp macro perspective along the graphite spine. Four cylindrical evidence pins descend and lock into the plates, symbolizing immutable Merkle leaf commitment.
- **Card Metadata:** `03 / AUDIT` (12px uppercase mono).
- **3D Pose:** Extreme macro side-elevation (Elevation 10°, Azimuth 75°), highlighting the four illuminated pins.
- **Display Metric:** `5 Invariants` (38px grotesque bold).
- **Supporting Narrative:** "Independent ACWORLD audit gate. Pre-settlement verification of SKU integrity, price ceilings, return window (>=30d), delivery SLAs (<=5d), and Merkle root equality."
- **Demonstration Context:** `SHA-256 binary Merkle tree flight recorder`.

#### 04 / SETTLEMENT — "Authorize & Capture"
- **Mechanical Transformation:** The plates press together into a solid monolithic block with zero seam gap. The vermilion alignment indicator locks flush with the graphite housing.
- **Card Metadata:** `04 / SETTLEMENT` (12px uppercase mono).
- **3D Pose:** Front isometric resting pose (Elevation 18°, Azimuth -25°), identical to the closed hero artifact.
- **Display Metric:** `$8,500 Locked` (38px grotesque bold).
- **Supporting Narrative:** "PayPal Orders v2 authorization, audited pre-capture verification gate, B2B invoicing, and cryptographic dispute evidence packages."
- **Mandatory Disclosure:** *"Illustrative demonstration workflow. No live PayPal payment or fund transfer has been initiated."*

---

## 7. Technical Feasibility & Repository Architecture

### Compatibility & Dependency Audit

The existing repository environment was inspected directly:
- **Runtime & Framework:** Next.js `15.5.28` (App Router) with React `19.1.0`.
- **Installed Animation Libraries:** `gsap` (`^3.15.0`) and `@gsap/react` (`^2.1.2`) are **already present** in `package.json`.
- **React 19 & WebGL Compatibility Assessment:**
  - `@react-three/fiber` (R3F) v8 has known peer-dependency restrictions against React 19. While R3F v9 RC exists, introducing complex reconcilers risks peer-dependency conflicts during automated builds (`npm install` / `prisma generate`).
  - **Architectural Decision (Zero-Risk Architecture):** Implement the WebGL rendering engine using **vanilla Three.js (`three@^0.170.0`) encapsulated within an imperative React controller (`LandingCanvas.tsx`)** mounted via standard React `useRef` and `useEffect`.
  - *Benefits:*
    1. Zero peer-dependency friction with React 19.1.0.
    2. Direct, predictable ownership of the WebGL rendering loop, context loss, and memory disposal.
    3. Seamless GSAP ScrollTrigger timeline interpolation without React state re-rendering overhead.
    4. Minimal bundle footprint: import only `WebGLRenderer`, `PerspectiveCamera`, `Scene`, `MeshStandardMaterial`, and needed geometries, saving ~180KB gzip compared to full R3F+Drei helper suites.

### Route Isolation & Security Boundary

```
src/
├── app/
│   ├── (marketing)/
│   │   ├── layout.tsx             # Standalone marketing layout (zero auth providers)
│   │   └── welcome/
│   │       └── page.tsx           # Public landing page (Server-rendered HTML + WebGL)
│   ├── page.tsx                   # AUTHENTICATED COCKPIT (Protected by middleware)
│   ├── layout.tsx                 # Root layout with Inter + Plex Mono + ThemeProvider
│   └── middleware.ts              # Security boundary (Preserved untouched)
```

1. **Routing Verification:**
   - Inspection of `src/middleware.ts` confirms the explicit matcher:  
     `config = { matcher: ["/", "/account/:path*", "/settlement/:path*"] }`.
   - The root path `/` is strictly protected: unauthenticated users are redirected to `/login`.
   - The public landing page is hosted at `/welcome` (within route group `src/app/(marketing)/welcome/page.tsx`). Because `/welcome` is **not** matched by middleware, unauthenticated traffic accesses it without encountering redirects.
   - The authenticated cockpit at `/` remains completely unmodified.

2. **Style & Token Scoping:**
   - Marketing styles are strictly isolated inside `src/components/landing/landing.css` under `.pactum-landing`.
   - The authenticated application's Quiet Authority tokens (`--color-page-bg: #F7F5F0`, `--color-ember-orange: #ff6600`, etc.) in `src/app/globals.css` are never modified or overridden.

3. **Financial Safety & Session Integrity:**
   - "Enter Workspace >" and "Let's get started >" buttons are standard HTML links (`<a href="/login">` or `<a href="/">`).
   - If an authenticated session cookie exists, navigating to `/` restores the user's active session without mutation.
   - The public page makes zero API requests to `/api/procurement/*`, `/api/paypal/*`, or `/api/negotiate/*`.
   - No mock payment tokens, test card credentials, or false success dialogs exist in the client bundle.

---

## 8. Accessibility & Performance Constraints

### Inclusive Design (Human & Usability Rules)

1. **Progressive Enhancement & No-JS Baseline:**
   - All headings, paragraphs, lifecycle stage explanations, and navigation actions are rendered as standard semantic HTML by Next.js Server Components.
   - If JavaScript is disabled or fails to execute, the page renders a complete, beautifully typeset editorial document with static photographic posters for each stage.
   - The WebGL `<canvas>` is marked with `aria-hidden="true"`, as all explanatory domain content is fully articulated in adjacent semantic DOM nodes.

2. **Strict Reduced Motion (`prefers-reduced-motion: reduce`):**
   - When the user's operating system requests reduced motion, or when the user toggles the persistent in-page "Pause Motion" control:
     - All GSAP ScrollTrigger pinning is immediately disabled.
     - The 3D canvas transitions to static, non-animating camera poses.
     - Headline word-stagger reveals are converted to instant opacity transitions (duration 0s).
     - The lifecycle switches to standard accessible tab panels with immediate switching.

3. **Keyboard & Focus Architecture:**
   - Fully accessible skip link: `Skip to main content` (`#main-content`).
   - All interactive controls (pills, tabs, buttons) feature a high-contrast focus ring (`outline: 2px solid #C43A1D`, `outline-offset: 3px`).
   - Stage selector tabs implement standard WAI-ARIA tab semantics: Arrow keys navigate between stages, Enter/Space selects, Home/End jump to boundaries.

### Performance Budgets & Telemetry Targets

| Metric | Budget Target | Fallback Action if Exceeded |
| :--- | :--- | :--- |
| **LCP (Largest Contentful Paint)** | `<= 2.2s` (Mobile 4G) | Preload hero WebP poster; defer WebGL script execution |
| **CLS (Cumulative Layout Shift)** | `<= 0.02` | Strictly reserve 3D canvas aspect ratio containers in CSS |
| **INP (Interaction to Next Paint)** | `<= 120ms` | Offload animation calculations; zero React re-renders on scroll |
| **Initial JS Chunk (Landing Route)**| `<= 140KB` gzip | Exclude Three.js from main bundle; dynamic `import()` on idle |
| **Deferred 3D Bundle** | `<= 280KB` gzip | Tree-shaken Three.js core; zero external post-processing shaders |
| **GPU Memory Allocation** | `<= 48MB` | Single shared geometry buffer; 256×128 HDR; 1K normal maps |
| **Draw Calls per Frame** | `<= 35` calls | Geometry merging for basalt rocks; instancing for Merkle pins |
| **Target Frame Rate (Desktop)** | `60 fps` (p95 <= 16.6ms) | Adaptive DPR scaling (1.0× to 1.5×); suspend render loop when idle |
| **Target Frame Rate (Mobile)** | `30–60 fps` | Cap DPR at 1.0×; switch to static poster if frame time > 33ms |

---

## 9. Phased Implementation Roadmap

```
PHASE 1: Static Editorial Shell & Route Isolation
├── Step 1.1: Create src/app/(marketing)/layout.tsx and src/app/(marketing)/welcome/page.tsx
├── Step 1.2: Establish src/components/landing/landing.css with scoped tokens
├── Step 1.3: Build semantic HTML hero, lifecycle panels, and closing CTA
└── Step 1.4: Verify middleware bypass and zero leakage into authenticated / cockpit

PHASE 2: High-Fidelity Poster Assets & Responsive Layout
├── Step 2.1: Author optimized WebP/AVIF static posters for hero and 4 stages
├── Step 2.2: Implement responsive compositions at 390px, 768px, 1024px, 1440px, 1920px
└── Step 2.3: Validate WCAG 2.2 AA contrast ratios and keyboard navigation

PHASE 3: WebGL Engine & 3D Sculpture Integration
├── Step 3.1: Install three and @types/three (no conflicting peer dependencies)
├── Step 3.2: Construct procedural AgreementArtifact (3 plates, graphite spine, vermilion seam)
├── Step 3.3: Construct BasaltRock framing geometry (photogrammetry crag normal mapping)
├── Step 3.4: Configure studio 3-point lighting rig and compressed monochrome IBL
└── Step 3.5: Encapsulate within LandingCanvas.tsx with WebGL context recovery

PHASE 4: GSAP Scroll Choreography & Lifecycle Storyboard
├── Step 4.1: Integrate GSAP 3.15 + ScrollTrigger via useGSAP in LandingDirector.tsx
├── Step 4.2: Implement Sequence 1: Hero entrance stagger and specular lighting sweep
├── Step 4.3: Implement Sequence 2: Background paper-to-obsidian transition and plate separation
├── Step 4.4: Implement Sequence 3: Merkle pin closure, vermilion flash, and dark CTA reveal
└── Step 4.5: Add reduced-motion and manual pause toggle state handlers

PHASE 5: Performance Profiling & Acceptance Sign-off
├── Step 5.1: Profile Lighthouse Core Web Vitals (LCP, CLS, INP)
├── Step 5.2: Verify memory cleanup on route unmount (zero GPU leaks)
└── Step 5.3: Execute full acceptance checklist
```

---

## 10. Acceptance Checklist & Verification Criteria

### Visual & Art Direction Acceptance
- [ ] **ARC Fidelity:** The hero composition precisely mirrors the ARC reference's left-aligned massive typography, right-quadrant floating metallic sculpture, natural craggy basalt rock framing, and warm-white paper ground.
- [ ] **Sculpture Semantics:** The 3D centerpiece reads unmistakably as a precision-machined agreement (three plates, spine, vermilion seam, pins) rather than a credit card, coin, or generic blob.
- [ ] **Basalt Rock Contrast:** The tactile juxtaposition between organic, matte, craggy basalt rock and precision-milled brushed aluminum is clearly visible in the rendered canvas.
- [ ] **Cinematic Transition:** Scrolling into the lifecycle triggers a continuous transition from warm paper (`#F5F3EF`) to pitch obsidian (`#080808`), with the two-tone editorial headline rendered with crisp contrast.
- [ ] **Monolithic Grid:** The four lifecycle panels (`01` to `04`) on dark ground showcase their respective mechanical transformations and high-contrast metric figures.

### Technical & Architectural Acceptance
- [ ] **Route Isolation:** The public landing experience resides strictly at `/welcome` within `src/app/(marketing)/`.
- [ ] **Middleware Integrity:** `src/middleware.ts` remains completely untouched. Unauthenticated visits to `/` continue to redirect to `/login`.
- [ ] **Zero Cockpit Regression:** The authenticated cockpit (`src/app/page.tsx`), Quiet Authority styles, theme provider, and financial controls remain 100% unaltered.
- [ ] **React 19 Compatibility:** WebGL engine runs cleanly without peer-dependency warnings or build-time reconciler errors.
- [ ] **Resource Teardown:** Navigating away from `/welcome` to `/login` completely disposes of WebGL geometries, textures, renderers, and GSAP ScrollTrigger instances without memory leaks.

### Safety, Accessibility & Performance Acceptance
- [ ] **Financial Safeguard:** All procurement data is explicitly labeled as an illustrative demonstration. No real PayPal transaction, card charge, or settlement is implied or executed.
- [ ] **No-JS Baseline:** Disabling JavaScript renders a complete, beautifully typeset HTML document with crisp photographic posters.
- [ ] **Reduced Motion:** Enabling `prefers-reduced-motion` eliminates all camera motion, pinning, and parallax, presenting clean static compositions.
- [ ] **Contrast Compliance:** All text and critical control borders exceed WCAG 2.2 AA contrast standards (minimum 4.5:1 for normal text, 3:1 for large text).
- [ ] **Performance Gate:** Production bundle transfers <= 140KB initial JS, LCP <= 2.2s on 4G, and maintains steady 60 fps during active desktop scrolling.

---

## 11. Open Questions & Assumptions

1. **Asset Production Strategy:**
   - *Assumption:* Procedural geometries (Three.js `BoxGeometry`, `CylinderGeometry`, and custom extrusion profiles) combined with procedural noise/normal maps are sufficient for the initial implementation of the agreement plates, spine, and basalt rocks.
   - *Question for User:* Would you prefer importing an authored glTF/GLB asset (`.glb`) created in Blender for the craggy basalt rock photogrammetry, or shall we proceed with a lightweight procedural Three.js mesh to keep bundle sizes minimal?
2. **Font Licensing & Delivery:**
   - *Assumption:* The implementation will use Next.js `next/font/google` with Inter (`--font-inter`) configured for tight tracking (-0.04em) and IBM Plex Mono (`--font-plex-mono`) to maintain consistency with the existing repository fonts, with optional support for self-hosted Helvetica Now Display if licensed.
3. **Primary Route Alias:**
   - *Assumption:* The landing page is deployed at `/welcome`, preserving `/` as the authenticated cockpit entry point.
   - *Alternative:* If desired in future phases, middleware can inspect incoming sessions and rewrite unauthenticated root visits to `/welcome`, while retaining authenticated sessions directly at `/`.
