# Sprout chat sessions

Explore's assistant and `#/scout` consume one account-scoped `ScoutSessionProvider` above the route split in `Shell`. Only that provider owns AI SDK `useChat`. Opening the full view, returning to Explore, closing the panel, and lazy-loading a view do not stop or replay a request. Changing the selected location updates context for the next turn without deleting the conversation or interrupting the current reply.

The transport adds the latest selected location and exact available client plan snapshot to the outgoing user turn, without putting that context into the visible user bubble. The full page uses the same transport and therefore keeps field context after leaving Explore. Language is read at send/retry time rather than captured when the session was created. Server tools remain the source of truth; a client plan is context, not a verified measurement.

## Persistence and Recent chats

Persistence is **browser-local only**, using the existing `chats.ts` localStorage store (up to 50 saved conversations). No account is required: public visitors use the existing `guest` scope. There is no server transcript database, public listing, R2 bucket, migration, or deployment in this change.

- Explore turns now populate the same Recent chats list as the full page, including partial streamed output.
- The active conversation ID and last field/plan context are saved in a separate owner-scoped localStorage key so a reload restores the same conversation.
- New chat starts an empty conversation and keeps the previous chat in Recent chats.
- Opening a Recent chat restores its messages; it does not generate a new reply.
- Clear chat removes the active conversation from saved history and starts empty.
- Deleting a Recent chat removes its saved history. Deleting the active chat starts empty too.
- Explicit new/open/clear/delete switches cancel any currently active request; route navigation does not. Clear/delete cannot be undone by a late streamed token.
- Switching accounts or signing out destroys the previous account's live session and cancels its request. Guest and account histories and context use different storage keys. This is browser UI isolation, not encryption: someone with access to this browser profile can inspect localStorage. Guest history is shared by people using the same browser profile.

Storage is best-effort: clearing site data, private browsing, quota exhaustion or blocked storage can remove/prevent persistence. No cross-device or cross-tab synchronization is promised.

## Full reload limitation

A browser reload closes the network stream. The latest received message snapshot is restored, possibly including an incomplete assistant answer, but the request is **not resumed or automatically retried**. There is no server-side resumable stream protocol here. The restored session is idle; a user may explicitly send a follow-up. Route changes within the running app preserve the actual stream and its progress.

## Verification

- `npx vitest run web/src/ScoutSession.test.ts web/src/ScoutSession.persistence.test.ts web/src/components/assistant/FieldAssistantPanel.test.ts web/src/Shell.explore.test.ts`
- `npm run typecheck`
- `npm run build`
- `node scripts/chat-sync-smoke.mjs`

The smoke launches an ephemeral static server on **127.0.0.1:8832** serving the production build. Its explicitly labeled API fixtures send a real, held-open AI SDK SSE stream. Chromium navigates Explore → full page → Explore while streaming, then exercises full-page follow-up context, reload, Recent chats, New, Open, Delete and Clear during streaming. It verifies three intentional user sends produce exactly three chat requests; navigation and reload produce none. It checks the full-chat menu anchor matches the Clear button's computed padding, border, background, radius and minimum height. It does not call a real model or verify map tiles/agronomy.

## Stacked integration

This branch is based on `feat/explore-chrome`, not on the coordinator's uncommitted Field Watch integration. When combining changes in `FieldAssistantContent.tsx`, retain the coordinator's exact `sharedPlan` selection and its no-fetch-when-defined guard. Retain this branch's `useScoutSession` consumer, context publication effect and shared `clearChat`; do not restore a view-owned `useChat` or an unmount `stop` effect. Keep `ScoutSessionProvider` above **every** route in `Shell`. No changes to shared `ScoutMessage` or LLM prompts are required.
