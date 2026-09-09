# 3D for Agents landing interface review

## Scope and Coverage

**Full mode.** The 3D for Agents landing page at `/compute/`: the brief, intended use, editable total budget, agent-plan handoff, pricing calculator, availability states, documentation links, and narrow-screen layout. Baseline: `6c062cf`. The same static page is served on the Agartha origin. Payment receipts, the Agartha world editor, external agent applications, and billing backend behavior are outside this review.

The landing page uses native HTML controls, plain CSS, a system font, and small browser JavaScript. The surrounding repository uses React/Vite, but this page deliberately remains static. Existing cream, green, and lime tokens are retained; CSS is extracted to `page.css` with semantic text and surface tokens. No UI library, font download, or production dependency was added.

Recon found `CONTRIBUTING.md` and the earlier world-editor review in `docs/reviews/2026-09-06-interface-review.md`. There is no repository `AGENTS.md`, `CLAUDE.md`, `CODING_STANDARDS.md`, Storybook, or landing design-system document. CONTRIBUTING requires focused patches, relevant tests, and browser verification. All six better-interface domain skills and the relevant focus, forms, zoom, adaptive spacing, and contrast references were read.

| Domain | Evidence inspected | Result |
| --- | --- | --- |
| Accessibility | Native controls and names, landmarks, required/error states, keyboard-only plan creation, clipboard fallback, range/disclosures, no-JavaScript fallback, reduced motion and forced colors | 5 findings fixed |
| Layout | Full-page Chromium renders at 320, 390, 640, 760, 761, 900 and 1440 CSS px; open instruction and calculator states; measured document bounds | 1 finding fixed |
| Writing | Complete visible landing flow, budget shortcuts, generated plan, loading/offline/test/unavailable pricing and copy feedback | 2 findings fixed |
| Typography | Rendered hierarchy, wrapping, 200% text resizing, 200% CSS zoom, 640px zoom-equivalent layout, changing currency/time values | 1 finding fixed |
| Colors | Computed foreground/background pairs, placeholder, dark-form focus perimeter, selected state, WCAG AA and APCA measurements | 2 findings fixed |
| UI | Primary-action emphasis, hover/press/busy states, disclosure affordances and reduced-motion behavior | 1 finding fixed |

## Findings

All rows below are **resolved**. Before snippets are from the baseline; locations point to the corresponding implementation after the fix. There are no remaining actionable interface findings in the inspected scope.

| # | Severity | Domain | Location | Before | After | Why |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | HIGH | Colors | `apps/web/public/compute/page.css:20`, `:40` | Every focus ring used `#357259`, including on the `#192e2b` form: **2.52:1** | The form inherits a lime focus token: **11.15:1** against its dark surrounding surface. The light-page ring remains **5.10:1**. Forced colors use `Highlight`. | The dark-form focus perimeter missed the 3:1 contrast target. Verified through computed styles and keyboard focus. |
| 2 | HIGH | Colors | `apps/web/public/compute/page.css:4`, `:9`, `:49` | The rendered placeholder used browser gray `#757575` on cream: **4.14:1**. Small explanatory copy also fell below the APCA body guidance. | Explicit placeholder and semantic muted tokens. Minimum rendered text ratio **6.04:1**; body-copy APCA minimum **Lc 75.83**, including **Lc 76.66** on the dark form. | The placeholder failed normal-text AA. Adjusting the muted roles also improves longer supporting copy without changing the palette's character. |
| 3 | HIGH | Accessibility | `apps/web/public/compute/index.html:41`, `apps/web/public/compute/page.css:62` | A preset's selected appearance changed only its colors; `aria-pressed` helped assistive technology but added no visible non-color cue. | A decorative check mark and stronger outline accompany `aria-pressed`. Quick amounts stay neutral; copy is the filled primary action. | Selection remains understandable without color perception and in forced-color mode. |
| 4 | MEDIUM | Accessibility | `apps/web/public/compute/index.html:28`, `:46`; `apps/web/public/compute/page.js:28`, `:99` | Brief validation existed only in a temporary browser validity message; required fields were not visibly identified. Currency used a numeric spinbutton. | Visible required labels, persistent described errors, `aria-invalid`, validation on blur/submit, first-error focus, decimal text input and whitespace-tolerant parsing. | Readers can locate and correct both fields. The monetary value no longer behaves like a quantity spinner. |
| 5 | MEDIUM | Accessibility | `apps/web/public/compute/index.html:13`; `apps/web/public/compute/page.js:78`, `:84` | No skip link; the plan anchor scrolled to a non-focusable container. | Skip-to-main, plan-link focus on the brief, and Ctrl/Cmd+Enter submission from the textarea. Modified link clicks retain native behavior. | Keyboard navigation reaches the task directly. Runtime verification caught and fixed the browser's default fragment jump resetting focus. |
| 6 | MEDIUM | Accessibility | `apps/web/public/compute/page.css:25`, `:51`, `:69`, `:83` | Copy was about **38.8px** high; summaries were about **22.4px** high. | Controls, navigation links and disclosures have at least **44px** target height with distinct spacing. | Improves touch activation without overlapping targets or hiding labels. |
| 7 | MEDIUM | Accessibility | `apps/web/public/compute/index.html:27`, `:55`, `:71`, `:78`; `apps/web/public/compute/page.js:173` | Without JavaScript, Copy was an ordinary form submission, the calculator could not update, and pricing stayed on “Checking…”. | Enable these controls only after their handlers are installed. No-JavaScript readers get the agent/pricing guide links. | Avoids an inactive advertised action, accidental form navigation, and a loading state that cannot finish. |
| 8 | MEDIUM | Writing | `apps/web/public/compute/index.html:38` | “Draft”, “Refined”, and “Detailed” named the $5/$15/$30 shortcuts, followed by a qualification that quality was not guaranteed. | “Quick budget amounts” with plain dollar amounts and an editable spending limit. | Removes the implied link between a particular spend and a quality level; the budget remains a ceiling. |
| 9 | MEDIUM | Writing | `apps/web/public/compute/index.html:20`, `:25`, `:51`, `:54`; `apps/web/public/compute/page.js:116`, `:163` | “A brief worth building”, “Copy modeling plan”, and “Copied”; the handoff explanation followed the whole form. | “Make a modeling plan”, “Copy plan to clipboard”, “Copied. Paste it into your agent.” and an explicit no-work/no-charge statement. Pricing errors state the next action. | Explains who builds the model and what this page's action does. Generated budget/approval safeguards are retained. |
| 10 | MEDIUM | Layout | `apps/web/public/compute/page.css:73`, `:106`, `:114` | Three facts became an uneven two-column group at 320px; controls and explanatory text used inconsistent grouping and narrow insets. | Facts stack at narrow widths; form groups use shared spacing, fluid controls, and a full-width inset copy action on small screens. | Keeps related content together and gives narrow-screen reading a consistent leading edge. No clipping was found in the baseline; this is a comprehension and adaptability fix. |
| 11 | MEDIUM | Typography | `apps/web/public/compute/page.css:13`, `:31`, `:41`, `:84` | Supporting paragraphs were 13px, headings inherited inconsistent leading, and changing estimates used proportional figures. | Semantic relative-size roles, 14px supporting copy, balanced headings, role-specific leading, a capped measure and tabular prices/time. | Improves dense-copy reading, text resizing and numeric stability. The system font is preserved. |
| 12 | LOW | UI | `apps/web/public/compute/page.css:54`, `:94`; `apps/web/public/compute/page.js:110` | Copy only became disabled during clipboard access; no visible busy message or intentional hover/press treatment. | Stable button label, busy cue plus polite status, restrained hover and 0.96 press feedback. Transitions only run when reduced motion is not requested. | Makes the action's progress and interaction states apparent without adding decorative motion. |

## Considered but Rejected

| Location | Candidate | Rejected because |
| --- | --- | --- |
| `apps/web/public/compute/page.css:1` | Convert the palette to OKLCH or add a dark theme | Existing hex tokens are consistent. Contrast is fixed in that system; a second appearance is not part of this page's established behavior. |
| `apps/web/public/compute/index.html:32`, `:52`, `:71` | Replace native select/disclosures with custom widgets | Native controls already supply the needed keyboard behavior and accessible names. A new library would add complexity. |
| `apps/web/public/compute/index.html:40` | Turn quick amounts into a required radio choice | They set an editable monetary amount; entering a custom value legitimately clears preset selection. They are shortcuts rather than a separate required mode. |
| `apps/web/public/compute/page.css:28` | Fill the hero's whitespace with a decorative render or autoplay | There is no validated model example to present as a result. Decoration would compete with the brief and increase loading/motion cost. |
| `apps/web/public/compute/index.html:71` | Expand the compute calculator by default | Session time is subordinate to total task budget. The named native disclosure makes it reachable without suggesting that users must plan individual sessions. |

## Verification

Passed locally:

- `npx vitest run scripts/computePage.test.ts scripts/agentDocs.test.ts --maxWorkers=1`: **20 tests passed**. Includes budget bounds, private-input handling, clipboard races/fallback, pricing recovery, persistent errors, first-error focus, whitespace-pasted currency and the textarea keyboard shortcut.
- Headless Chromium and axe-core: **29 checks passed**. At **320, 390, 640, 760, 761, 900 and 1440px**, document width did not exceed the viewport and axe reported zero WCAG A/AA violations for the inspected page. Desktop, narrow, text-resized, clipboard-fallback, forced-color and no-JavaScript screenshots were inspected.
- Keyboard: Tab → Skip to content → Enter focuses main; Create a plan → Enter focuses brief; empty Copy focuses and describes the first invalid field; Ctrl+Enter copies a custom $12.75 game-asset plan; Space selects $15; Enter opens both disclosures; End reaches the slider's $1.65 maximum estimate. The calculator does not change the task budget.
- Clipboard rejection selects the complete plan, opens its disclosure and focuses the fallback. Async copy edits do not report stale content as copied.
- Pricing: mocked offline → retry → live, test-only, disabled purchase and pending-request states. Pending requests leave the copied plan explicitly unverified. No payment or compute session was created.
- Adaptivity: 200% root text sizing at 1280px, 200% CSS zoom, and the equivalent 640px CSS viewport were inspected with no horizontal overflow. Open disclosures also fit at 320px.
- Contrast: every measured rendered text pair meets AA; lowest ratio **6.04:1**. APCA body guidance reaches at least **Lc 75.83**. Focus perimeter pairs are **11.15:1** on dark and **5.10:1** on light. Forced-color focus and selection stay visible.
- Reduced motion: authored button transitions become `0s` and no animations run. Busy/selected states retain static text or marks.
- JavaScript disabled: the form, calculator and loading status are hidden; readable guide links remain. No misleading native form submission is exposed.
- No browser JavaScript errors were observed. Test-only browser/audit packages were installed outside the repository; production dependencies are unchanged.

**Not verified:** physical Safari/iOS interaction, the actual browser-toolbar zoom command, and VoiceOver speech output. The Mac was locked during the interactive-browser attempt. Chromium rendering, keyboard operations, computed styles, semantic checks and the stated zoom equivalents were used instead; this review makes no cross-browser or full assistive-technology certification claim.

Release validation and public deployment evidence are recorded in the pull request and final delivery message; a local interface verdict does not itself mean the change is deployed.

## Verdict

Approve
