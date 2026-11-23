# Statumo

Statumo shows how much context and rate limit you've used in Claude Code and Codex, right in the VS Code status bar.

```text
Claude (layers) 12% (clock) 16% (calendar) 39%    Codex (layers) 41% (clock) 84% (calendar) 20%
```

Each tool is one status bar item that starts with its name, Claude or Codex, and shows three percents, each led by a ring that fills to match it in 5% steps:

- **Context** (layers in the ring) is how much of the current session's context window is used.
- **5-hour limit** (clock) and **weekly limit** (calendar) are how much of each rate-limit window is used.

Hover over an item for the full breakdown, with a progress bar for context and each limit that turns the warning or error color when a limit runs low: the session title, token counts, when each limit resets (as today or tomorrow when it's that soon), your plan when the tool reports it, and how recently each reading arrived. Click an item to open that tool's panel, or right-click the status bar to hide either one.

## What each part follows

- **Context** comes from the most recently active session whose working folder is in the current VS Code workspace. Until a tool has a session here, context shows just an empty ring.
- **Rate limits** belong to your account, so they come from the most recent reading in any session.
- When a window's reset time passes with no newer reading, it shows just an empty ring, and its hover section reads Inactive, until the tool reports again. So does a window the tool hasn't reported yet.
- An item turns the warning color when either window has 25% or less left (75% or more used), and the error color at 10% or less left (90% or more used). Both thresholds are settings, set as percent left.

A tool's item stays hidden until it has written any usage on this machine.

## Requirements

Statumo needs VS Code 1.100 or later on the desktop.

### Claude Code

VS Code extensions can't see Claude Code's rate limits or context window directly, so Statumo reads them from **Usage**, a Claude Code mod that ships inside Statumo, in its [`claude-mod/`](claude-mod/README.md) folder. Usage writes them to `~/.claude/statumo/`, or to `statumo/` in your `CLAUDE_CONFIG_DIR`:

- `sessions/` holds one small file per session with its folder, transcript path, and context use. Statumo deletes session files that haven't changed in 30 days.
- `limits.json` holds the account's latest 5-hour and 7-day limits, rewritten after each reply that reports them.

Chat titles come from Claude Code's own transcripts: Statumo reads the end of the transcript of the session it follows. Your plan, and whether you sign in with a subscription or an API key, come from the signed-in account Claude Code records in `~/.claude.json`. Statumo can't see an `ANTHROPIC_API_KEY` set in Claude Code's own environment, so when one takes the place of your subscription, the hover still shows the subscription.

Usage needs Claude Code 2.1.304 or later. When Usage isn't installed, or an update to it ships with Statumo, Statumo offers to install it. Choose **Install** or **Update**, and Statumo runs Claude Code's own command line to register its copy of the mod as the `statumo` marketplace and install Usage at user scope, so every session writes its usage, whether it runs in the VS Code panel or a terminal. Statumo uses the command line that ships with the Claude Code extension, or `claude` on your `PATH`. Start a new Claude Code session, or restart running ones, once it's installed. **Don't Ask Again** turns the offer off, and **Statumo: Install or Update the Usage Mod for Claude Code** runs it any time.

To install Usage by hand instead, from the root of a Statumo checkout:

```sh
claude plugin marketplace add "$PWD/claude-mod"
claude plugin install usage@statumo --scope user
```

### Codex

Codex needs no setup. Statumo reads the session logs Codex already writes under `~/.codex/sessions/`, along with session titles from `~/.codex/session_index.jsonl` and, from `~/.codex/auth.json`, only whether you sign in with ChatGPT or an API key.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `statumo.warningThreshold` | `25` | Percent left at or below which an item uses the warning background. |
| `statumo.errorThreshold` | `10` | Percent left at or below which an item uses the error background. |
| `statumo.timeFormat` | `12h` | The clock the hover shows reset times on: `12h`, such as `2:30 PM`, or `24h`, such as `14:30`. |
| `statumo.showTimeUntilReset` | `false` | Add how long until each limit resets after its reset time in the hover, such as `(4h 30m)`. |
| `statumo.claude.enabled` | `true` | Show the Claude Code item. |
| `statumo.claude.configDirectory` | `""` | The Claude config folder. Empty uses `CLAUDE_CONFIG_DIR`, then `~/.claude`. |
| `statumo.claude.clickCommand` | `claude-vscode.focus` | The command a click on the Claude Code item runs. |
| `statumo.codex.enabled` | `true` | Show the Codex item. |
| `statumo.codex.homeDirectory` | `""` | The Codex home folder. Empty uses `CODEX_HOME`, then `~/.codex`. |
| `statumo.codex.clickCommand` | `chatgpt.openSidebar` | The command a click on the Codex item runs. |

## Commands

- **Statumo: Refresh Usage** re-reads both tools right away. Statumo also refreshes every 3 seconds while the window has focus, and whenever the window regains focus.
- **Statumo: Install or Update the Usage Mod for Claude Code** installs the Usage mod that ships with Statumo, or updates an older one.

## Privacy

Statumo only reads files on your machine and makes no network requests. It runs Claude Code's command line only to list your plugins and, once you agree, to install or update the Usage mod. For Claude Code, that includes the end of the followed session's transcript, which Statumo reads only to find the chat title. Session titles and folders appear only in the hover tooltip.

## Development

Run the tests with `npm test`, and lint with `npm run lint`, which checks the documentation and spacing rules in `AGENTS.md` with ESLint and the repository's own rules in `scripts/lint/`. `npx eslint --fix .` fixes most spacing problems. The progress rings in the status bar come from an icon font that `npm run build:icons` builds from the ring shapes drawn in `scripts/icons/`. The script also rewrites `contributes.icons` in `package.json` to match. Build a package with `npm run package`, or build and install it into VS Code with `npm run install:local`. Both use the [`@vscode/vsce`](https://github.com/microsoft/vscode-vsce) that `npm install` adds. The package holds only the files listed under `files` in `package.json`.

The Usage mod for Claude Code lives in `claude-mod/`, which is also its `statumo` marketplace: `claude-mod/.claude-plugin/` holds both the mod's `plugin.json` and the `marketplace.json` that lists the folder itself. The folder ships in the extension package, so Statumo can install the mod. Bump the mod's version in `claude-mod/.claude-plugin/plugin.json` whenever it changes, since Statumo offers an update only when the version that ships is newer than the installed one. The mod's [README](claude-mod/README.md) documents the files Statumo reads and how to validate the mod.

## Trademarks

Claude is a trademark of Anthropic. OpenAI and Codex are trademarks of OpenAI. Statumo isn't affiliated with or endorsed by either company, and uses their names only to label each tool's usage.
