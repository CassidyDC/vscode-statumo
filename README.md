# Statumo

Statumo shows how much context and rate limit you have left in Claude Code and Codex, right in the VS Code status bar.

```text
Claude ctx 12% · 5h 84% 14:30 · 7d 61% Nov 27    Codex ctx 41% · 5h 16% 16:03 · 7d 80% Nov 27
```

Each tool gets its own item:

- **ctx** is how much of the current session's context window is used.
- **5h** and **7d** are how much of each rate-limit window is left, followed by when it resets.

Hover over an item for the full breakdown: the session title, token counts, exact reset times, your plan when the tool reports it, and how recently each reading arrived. Click an item to open that tool's panel.

## What each item follows

- **Context** comes from the most recently active session whose working folder is in the current VS Code workspace. Until a tool has a session here, context shows `—`.
- **Rate limits** belong to your account, so they come from the most recent reading in any session.
- When a window's reset time passes with no newer reading, it shows `—` and the item dims until the tool reports again.
- An item turns the warning color when either window has 25% or less left, and the error color at 10% or less. Both thresholds are settings.

An item stays hidden until its tool has written any usage on this machine.

## Requirements

### Claude Code

VS Code extensions can't see Claude Code's rate limits directly, so Statumo reads them from the [Usage](https://github.com/jacobcassidy/claude-code-usage) mod for Claude Code. Install the mod at user scope so every session writes its usage to `~/.claude/usage/sessions/`. Statumo deletes session files there that haven't changed in 30 days.

### Codex

Codex needs no setup. Statumo reads the session logs Codex already writes under `~/.codex/sessions/`, along with session titles from `~/.codex/session_index.jsonl`.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `statumo.warningThreshold` | `25` | Percent left at or below which an item uses the warning background. |
| `statumo.errorThreshold` | `10` | Percent left at or below which an item uses the error background. |
| `statumo.claude.enabled` | `true` | Show the Claude Code item. |
| `statumo.claude.configDirectory` | `""` | The Claude config folder. Empty uses `CLAUDE_CONFIG_DIR`, then `~/.claude`. |
| `statumo.claude.clickCommand` | `claude-vscode.focus` | The command a click on the Claude Code item runs. |
| `statumo.codex.enabled` | `true` | Show the Codex item. |
| `statumo.codex.homeDirectory` | `""` | The Codex home folder. Empty uses `CODEX_HOME`, then `~/.codex`. |
| `statumo.codex.clickCommand` | `chatgpt.openSidebar` | The command a click on the Codex item runs. |

## Commands

- **Statumo: Refresh Usage** re-reads both tools right away. Statumo also refreshes every 3 seconds and whenever the window regains focus.
- **Statumo: Open Claude Code** and **Statumo: Open Codex** run the click commands.

## Privacy

Statumo only reads files on your machine and makes no network requests. Session titles and folders appear only in the hover tooltip.

## Development

Run the tests with `npm test`. Build a package with `npm run package` (requires [`@vscode/vsce`](https://github.com/microsoft/vscode-vsce)), or build and install it into VS Code with `npm run install:local`.
