# Field Assistant evidence

These screenshots show the isolated Field Assistant component using a **temporary local preview mount**, not the final Explore globe/map route. U1 owns the route and final integration captures. The preview mount is not committed.

- `field-assistant-desktop.png`: 1440 × 960, real `/api/plan` response for Ames, Iowa (42.03, -93.62); local AI correctly reports unconfigured.
- `field-assistant-mobile.png`: 375 × 812, same real plan; preview wrapper anchors the component to the bottom.
- `field-assistant-empty-desktop.png` and `field-assistant-empty-mobile.png`: no selected location.
- `field-assistant-axe.json`: full selected WCAG axe results for 1440 and 375 px, collapsed and expanded real plan facts. Zero violations in those states; `label-content-name-mismatch` remains incomplete for the symbol-only overflow control. This is not a WCAG conformance certification.

Component tests mock fetch with explicitly labeled fixtures and exercise actual AI SDK streaming, citations via ScoutMessage, selected location/field identifiers and plan facts in outgoing UI messages, offline AI, errors/rate limits, location change reset, clear-chat focus, Enter/Shift+Enter, and Spanish crop/control labels. Live AI inference is not verified because the offline worker has no AI binding.

The component has no route or backend changes. Import `FieldAssistantPanel` from `web/src/components/assistant/FieldAssistantPanel.tsx`, pass the contract context, and supply `onClose` to expose a dismiss button on mobile. The parent owns positioning and focus restoration to its open-assistant toggle. The panel applies a mobile max-height of 80dvh and rounded top corners; its `className` is appended to the root aside.

Explore requests a rain-fed, balanced default plan directly through authenticated fetch, without mutating the existing planner's global last-plan store. Scout receives location and plan context as extra text in the outgoing user UIMessage, the only context channel the current route accepts; server tools remain responsible for verifying claims. No extra backend protocol was introduced.
