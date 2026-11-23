# Usage mod for Claude Code

**Usage** is the Claude Code mod that passes the two readings only Claude Code has, each session's context use and the account's rate limits, to Statumo in small JSON files. See the [Statumo README](../README.md#claude-code) to install it.

The mod writes to `~/.claude/statumo/`, or to `statumo/` in your `CLAUDE_CONFIG_DIR` when you set one. It finds that folder from the session's transcript path, so it never reads the environment.

## `sessions/<session-id>.json`

One file per session, named by the session's id:

```json
{
  "cwd": "/path/to/project",
  "transcriptPath": "/Users/you/.claude/projects/-path-to-project/8f0c….jsonl",
  "context": { "tokens": 48300, "window": 1000000, "percent": 5 }
}
```

The mod rewrites it after each turn, when a rate-limit window moves a whole point, and when a session starts, clears, resumes, or compacts, so a new session shows up before its first turn. A context value Claude hasn't reported yet is `null`. Statumo follows the newest session whose `cwd` is in the open workspace, and reads the chat title from the end of its `transcriptPath`. The mod can't delete files, so Statumo deletes session files that haven't changed in 30 days.

## `limits.json`

The account's latest rate limits, as Claude reported them:

```json
{
  "rateLimits": [
    { "kind": "five_hour", "percentUsed": 16, "resetsAt": "2026-11-22T14:30:00.000Z" },
    { "kind": "seven_day", "percentUsed": 39, "resetsAt": "2026-11-27T09:00:00.000Z" }
  ]
}
```

The mod writes it only after a turn that reported limits, so a session that has no reading yet, such as one just restarted, never replaces a newer reading from another session. Statumo reads the `five_hour` and `seven_day` windows and ignores any other kind, such as a gateway's `spend_limit`.

Neither file holds a timestamp: Statumo dates each file by when it was last modified. The formats are shared with Statumo's readers in [`src/providers/claude/sessions.js`](../src/providers/claude/sessions.js) and [`src/providers/claude/limits.js`](../src/providers/claude/limits.js). When you change a field, change both.

## Validation

From the repository root, run `claude plugin validate ./claude-mod/.claude-plugin/plugin.json --strict` and `claude plugin validate ./claude-mod/.claude-plugin/marketplace.json --strict`. This folder is both the mod and its `statumo` marketplace, whose one plugin's source is the folder itself.
