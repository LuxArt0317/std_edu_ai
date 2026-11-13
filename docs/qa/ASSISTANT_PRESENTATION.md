# Shared assistant presentation — Issue #98

This is a presentation-only follow-up. Issue #100 remains user-paused. It does
not change conversation storage, authentication, prompts, answers, tools, API
handlers, action confirmation, text, preview notices or the shared Sheet.

## Layout

The existing native School Affairs/DTM drawer is the size reference. The copied
public-page host now reaches the right edge, starts at the viewport top and uses
the full dynamic viewport height. Both hosts use a 512 CSS-pixel maximum at
widths of 640px and above, and the full viewport width below 640px. The iframe
fills its host rather than nesting a second fixed-width panel.

Assistant-specific styles account for safe-area insets around the launcher,
header, close control and composer. The conversation remains independently
scrollable; on short screens the panel itself can scroll so the composer stays
reachable. Other page dialogs and notices retain their existing styles. The
existing embedded-launcher hiding rule now survives utility-layer display rules,
leaving the copied page's outer launcher as its entry point.

Fenced Markdown code has its own bounded horizontal scrollbar. The conversation
container must not clip preformatted lines without giving the reader a way to
reach their end; ordinary long prose continues to wrap.

Opening remains opt-in. Native pages retain their modal Sheet and copied pages
retain their nonmodal popover, including their existing Escape/close behavior.
This does not make chat persistently open or claim identical modality. Existing
native/public close-control styling and the native overlay are preserved.

## Verification

Run from the client checkout:

```sh
node --check tests/integration/assistant-presentation-ui.mjs
node node_modules/oxlint/bin/oxlint tests/integration/assistant-presentation-ui.mjs
node tests/integration/assistant-presentation-ui.mjs
```

The harness owns an ephemeral loopback Vite server and an isolated headless
Chrome context, and closes both in `finally`. It mounts the actual
`PublicAssistant` and shared Sheet with synthetic auth/session data. The copied
page uses the real generated outer markup, CSS, closing script and actual iframe
containing that same component. The notices remain in the presentation fixture;
the homepage's unrelated account-status iframe is omitted.

Service imports are blocked fixtures, API paths and external requests are
rejected, and there are no credential reads, database calls or model requests.
This establishes layout and UI behavior, not real authentication, conversation
persistence or answer quality.

The November 13 isolated run passed **24 states**: native/copy hosts and
guest/synthetic signed-in identities at 1533×900, 640×900, 639×844, 390×844,
320×568 and 844×390. Assertions cover:

- Exact panel top/right alignment, width and full height; iframe inner/outer fit.
- Document/panel containment, long-text wrapping and reachable conversation
  start/end, composer and Send/attachment controls.
- Fenced code horizontal wheel scrolling in all 24 states, with the final
  characters measured inside the code viewport; ordinary long text still wraps.
- Closed initial state, Escape, close/reopen and retained unsent draft.
- No duplicate embedded launcher, page errors, API/model calls or external
  requests.
- Emulated top/right/bottom/left safe-area insets in all four 320px host/identity
  combinations, with measured header and composer padding.

Four small synthetic screenshots and count/geometry results are ignored under
`artifacts/assistant-presentation/`. Native and copied desktop/mobile screenshots
were visually inspected. The unchanged guest preview notice stays beneath the
native drawer and does not cover its composer; no notice/z-index change was
needed.

Safe-area inset rules pass Chrome's emulation, but physical notched-device behavior
and on-screen keyboards have not been verified on hardware. The short landscape
viewport is a containment check, not a hardware keyboard claim. This batch does
not assert a complete accessibility audit, production acceptance, or completion
of the remaining protected Moodle destinations. Root owns build and release
verification.
