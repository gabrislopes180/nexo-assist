# Console key collision

## Intent

Stop React from reconciling the selected conversation thread and its ticket panel as siblings with the same key. This warning occurs in the wide console layout when both keys equal the selected conversation ID.

## Goals and non-goals

- Give the thread and ticket panel stable, distinct keys while retaining their remount-on-conversation-change behavior.
- Do not alter conversation selection, API data, or the user's in-progress diagnostic edits.
- This change addresses the confirmed key collision; it does not assume the warning alone fully explains every visual symptom.

## Approaches

- **Namespace sibling keys (selected):** use component-specific prefixes for the thread and inline ticket panel. This removes the collision and preserves the existing lifecycle.
- **Remove the keys:** simpler, but may preserve component state when the selected conversation changes.

## Constraints and verification

Change only the relevant key assignments in `AnalystConsole`; verify with the focused frontend lint and test commands available for this change.
