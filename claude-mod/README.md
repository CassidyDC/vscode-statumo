# Usage mod for Claude Code

**Usage** is the Claude Code mod that records each session's live usage in a small JSON file for Statumo to read. See the [Statumo README](../README.md#claude-code) to install it.

The mod writes one file per session to `~/.claude/usage/sessions/<session-id>.json`, or under your `CLAUDE_CONFIG_DIR` when you set one.

```json
{
  "version": 1,
  "tool": "claude-code",
  "sessionId": "8f0c…",
  "cwd": "/path/to/project",
  "title": "Refactor parser",
  "context": { "tokens": 48300, "window": 1000000, "percent": 5 },
  "rateLimits": {
    "fiveHour": { "percentUsed": 16, "resetsAt": "2026-11-22T14:30:00.000Z" },
    "sevenDay": { "percentUsed": 39, "resetsAt": "2026-11-27T09:00:00.000Z" }
  },
  "endedAt": null,
  "updatedAt": "2026-11-22T10:12:04.511Z",
  "rateLimitsUpdatedAt": "2026-11-22T10:12:04.511Z"
}
```

The file updates after turns and as Claude reports changes to plan limits. The mod checks the saved session title and project root every 10 seconds and rewrites the file only when one changes. A value Claude hasn't reported is `null`. When the session ends, the mod sets `endedAt` and leaves the file in place.

`rateLimitsUpdatedAt` says when Claude reported the saved limits. After a restart, such as a reloaded VS Code window, Claude has no rate-limit reading until its next reply, so the mod keeps the limits and time the file already holds until then.

The format is shared with Statumo's reader in [`src/claude.js`](../src/claude.js). When you change a field, change both and bump `formatVersion` in each if older readers can't handle the new file.

## Validation

From the repository root, run `claude plugin validate ./claude-mod/.claude-plugin/plugin.json --strict` and `claude plugin validate ./.claude-plugin/marketplace.json --strict`.
