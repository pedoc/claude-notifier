# Auto-mute When Focused — Design

**Target release:** v3.6.0
**Closes:** #71
**Status:** Draft for review

## Summary

Add an opt-in setting, `claudeNotifier.autoMuteWhenFocused`, that suppresses the
extension-played notifications (the "done" sound and every popup) for a task
when the VS Code window that owns that task currently has OS focus. The premise:
if you are looking at the window where Claude is working, the notification is
redundant. Suppression is scoped per-window so it never silences work happening
in another window — the failure mode that a naive global-mute implementation
would introduce. Ship with an easy in-panel toggle plus a command.

## Goals

- Suppress redundant notifications for the window the user is actively looking at.
- Never degrade multi-window / tabbed usage: a task finishing in a background
  window still notifies, even while another window is focused.
- Make the feature trivial to turn on and off (status-bar panel toggle +
  command), not just a buried settings checkbox.
- Preserve all current behavior when the setting is off (the default).

## Non-goals

- Suppressing the **hook-played** permission/question *sounds*. Those are played
  by the hook process, which cannot see window focus; covering them would require
  a per-window focus marker that the hooks read. Deferred to a possible v2. Their
  **popups** (extension-played) are still suppressed by this feature.
- Terminal-visibility granularity ("is the Claude terminal the active view").
  Focus is window-level only.
- Deferring/queuing suppressed notifications for later replay. Suppression drops
  the notification.
- Any use of, or interaction with, the global `MUTE_FLAG`. That remains the
  manual machine-wide kill switch and is untouched.

## Background: why the naive design breaks tabbed mode

The feature request proposed listening to `onDidChangeWindowState` and writing
the global `MUTE_FLAG` (`~/.claude/hooks/claude-notifier-muted`) when focused.
`MUTE_FLAG` is a single machine-wide file checked by every hook, so focusing any
one window would silence **every** window's and terminal's notifications. A task
finishing in a background window (a different project) would go silent purely
because an unrelated window was in front. That is the exact regression to avoid.

The codebase already routes signals per-window: `handleSignal()` in
`src/signals/dispatch.ts` early-returns for any signal whose `cwd` is not inside
this window's own workspace folders (via `cwdMatchesFolder`). So each window's
dispatch only ever acts on its own workspace's tasks. That existing scoping is
what makes a correct per-window implementation possible without new machinery.

## Design

### Setting

`claudeNotifier.autoMuteWhenFocused` — boolean, default `false`. Declared in
`package.json` `contributes.configuration`, with a description explaining that it
suppresses the completion sound and popups while the owning window is focused,
and that permission/question sounds still play.

### Core suppression

Add `getAutoMuteWhenFocused(): boolean` to `src/settings/sync.ts` alongside the
existing getters.

In `src/signals/dispatch.ts`, add one early return at the top of
`showNotification()`:

```ts
function showNotification(reason: string, cwd: string): void {
  if (getAutoMuteWhenFocused() && vscode.window.state.focused) return;
  // ...existing body...
}
```

`showNotification()` is the single choke point for all extension-played output
(done sound + done/permission/question/subagent popups), so one guard covers the
whole surface. `vscode.window.state.focused` is read on-demand at signal time —
no event listeners, always current.

**Per-window correctness** falls out of the existing dispatch scoping: window A
being focused suppresses only window A's own-workspace tasks. A task finishing in
background window B runs through B's dispatch, where `window.state.focused` is
`false`, so it notifies normally. `MUTE_FLAG` is never involved.

**Coverage.** Suppressed when focused: the extension-played "done" sound and all
extension-played popups (done, permission, question, subagent). Unaffected: the
hook-played permission/question sounds (per non-goals), the stage-dedup state
(`shouldFire` still runs before `showNotification`, so a focused-and-suppressed
event still consumes its stage slot — correct: the user saw it, no catch-up).

### Easy toggle (UX)

- Extend `PanelState` in `src/ui/panel-markdown.ts` with
  `autoMuteWhenFocused: boolean`, and render a row in the hover panel, e.g.:

  ```
  Auto-mute when focused: $(check) On  ·  Off
  ```

  Each state is a command link; the active state shows `$(check)`.
- New command `claudeNotifier.toggleAutoMuteWhenFocused` that flips the config
  value (global target) and refreshes the panel + status bar.
- Register the command in `package.json` (`contributes.commands` and the command
  palette) so it is also reachable via Command Palette.

## Data flow

1. Hook fires → writes signal → dispatch `handleSignal()`.
2. Existing cwd scoping: proceed only if the signal belongs to this window's
   workspace.
3. Existing stage dedup (`shouldFire`) runs.
4. `showNotification()` → **new guard**: if `autoMuteWhenFocused` and this window
   is focused, return without emitting anything.
5. Otherwise, existing behavior.

## Testing

- **Dispatch matrix** (`test/unit/signals.dispatch.*`): mock
  `vscode.window.state.focused` and the getter; assert the extension-played
  notification is suppressed only when `enabled && focused`, and fires in the
  other three combinations. Confirm a background-window scenario (focused
  `false`) still notifies.
- **Panel markdown** (`test/unit/…panel-markdown…`): the toggle row renders and
  reflects `autoMuteWhenFocused` state (check on the active option).
- Full suite green; typecheck / lint / format clean.

## Docs

- README: add the `autoMuteWhenFocused` setting to the settings list, and mention
  the panel toggle.
- CHANGELOG: `Added` entry under the target release, crediting #71.

## Rollout / compatibility

Default `false` means no behavior change on upgrade. No hook changes, so no
`~/.claude` re-install is required for the feature to work — it is entirely
extension-side.
