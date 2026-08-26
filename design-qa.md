# Design QA — Skills Manager Source-first Library

- source visual truth path: `C:\Users\YUJIYU\.codex\generated_images\01a03df7-d846-72d2-a982-53e70a093a9c\exec-45622f09-82f2-4a1c-b2f7-3350aad6b7ab.png`
- implementation URL: `http://127.0.0.1:4173/`
- implementation screenshot path: `D:\Repository\deepseek-harness-plugin\dsh-skills-manager\assets\screenshots\skills-manager-v2-preview.png`
- full-view comparison: `C:\Users\YUJIYU\.codex\visualizations\2026\08\26\01a03df7-d846-72d2-a982-53e70a093a9c\skills-manager-v2-comparison.png`
- focused comparison: `C:\Users\YUJIYU\.codex\visualizations\2026\08\26\01a03df7-d846-72d2-a982-53e70a093a9c\skills-manager-v2-focus-comparison.png`
- responsive evidence: `C:\Users\YUJIYU\.codex\visualizations\2026\08\26\01a03df7-d846-72d2-a982-53e70a093a9c\skills-manager-v2-responsive.png`
- viewport: `1726 x 911` CSS px; responsive check at `800 x 900`
- source pixels: `1726 x 911`
- implementation pixels: `1726 x 911`
- device scale / normalization: `1x`; no density normalization required
- state: Chinese dark-theme Settings, Codex source expanded, four Codex rows visible

## Findings

No actionable P0/P1/P2 differences remain.

- Fonts and typography: the implementation uses the host/system font stack and matches the reference hierarchy, weights, compact labels, and single-line truncation. Chinese text is slightly sharper than the generated reference, which is expected for live browser text.
- Spacing and layout rhythm: the final settings frame is `1020 x 730`, with a `178px` settings rail and an `820px` maximum content region. Header, summary, filters, source cards, table rows, radii, and vertical rhythm align with the focused reference comparison.
- Colors and visual tokens: implementation uses existing DSH `--dsw-*` tokens for backgrounds, borders, labels, primary controls, success, error, hover, and elevation. The dark neutral balance and green/orange state colors match the source.
- Image quality and asset fidelity: the target contains no raster content assets. Standard host navigation iconography was not re-created with handcrafted SVG/CSS assets; the functional plugin surface uses text labels and native controls instead.
- Copy and content: selected design copy is retained, while the implementation adds Gemini/OpenCode sources and real diagnostic/detail behavior requested by the user.
- Responsiveness: at `800 x 900`, document `scrollWidth` equals `innerWidth` (`800px`), so there is no horizontal overflow; the content section measures `718px` and the mobile/table fallback remains usable.
- Accessibility and interaction states: source headers expose `aria-expanded`; source/skill toggles use `role=switch` and `aria-checked`; dialogs are modal, Escape-dismissible, backdrop-dismissible, and focus-trapped; buttons and fields have visible focus states.

## Interaction verification

- Created a skill through the create dialog using realistic data.
- Disabled and re-enabled the Codex source.
- Opened a skill detail dialog and verified body/diagnostics content.
- Filtered to `unit-test-generator` through search.
- Opened Trash and verified Restore is available.
- Checked browser console after the final fixes: no new errors or warnings.

## Comparison history

### Iteration 1 — blocked

- P1: source toggle buttons were nested inside a source-header button, producing invalid interactive DOM and a React `validateDOMNesting` warning.
- P2: the preview frame was too wide/tall and exposed six Codex rows, changing the source design's information density.
- P2: the implementation added a fourth summary metric and a source note row, shifting the table down and diverging from the selected three-metric layout.

Fixes:

- Split each source header into a non-interactive wrapper, a dedicated expand button, and a sibling source switch.
- Set the Settings frame to `1020 x 730` and the plugin content maximum to `820px`.
- Restored the three-column summary, removed the extra source note from the expanded table, and aligned table headings with the source.
- Used four visible Codex examples in the visual fixture while preserving the displayed source count of nine.

### Iteration 2 — passed

- Post-fix full and focused comparisons show aligned frame proportions, hierarchy, density, table structure, colors, and copy.
- Browser console contained no new warnings or errors.
- No actionable P0/P1/P2 mismatches remain.

## Follow-up polish

- P3: the generated reference includes decorative source/overflow icons. The production plugin intentionally avoids inventing or handcrafting these assets until the host exposes a stable icon component/library.
- P3: Gemini and OpenCode are additional requested functional sources, so Trash may sit below the fold when every source is shown; filtering or collapsing sources keeps it immediately reachable.

## Implementation checklist

- [x] Match selected source-first layout and DSH dark design tokens.
- [x] Verify create, source toggle, detail, search, and Trash flows.
- [x] Verify responsive width and browser console.
- [x] Resolve P1/P2 findings and recapture evidence.

final result: passed
