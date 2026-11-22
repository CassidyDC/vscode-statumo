# Claude Code Usage

**Usage** is a Claude Code mod that records each session's live usage in a small JSON file, so the [Statumo](https://marketplace.visualstudio.com/items?itemName=jacobcassidy.statumo) VS Code extension can show it in the editor's status bar.

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
  "updatedAt": "2026-11-22T10:12:04.511Z"
}
```

The file updates after turns and as Claude reports changes to plan limits. The mod checks the saved session title and project root every 10 seconds and rewrites the file only when one changes. A value Claude hasn't reported is `null`. When the session ends, the mod sets `endedAt` and leaves the file in place.

## Install

Use Claude Code 2.1.304 or later. Install the mod wherever you run Claude Code, whether in the VS Code panel or a terminal.

From the Usage checkout, register its marketplace once. Claude Code loads the mod from this checkout, so keep it at the registered path.

```sh
claude plugin marketplace add "$PWD"
```

### Local install for one project

Run the install command from the root of the project where you want Usage.

```sh
claude plugin install usage@code-usage-local --scope local
```

### Global install for all local projects

Install Usage at user scope to make it available across your local projects on this machine.

```sh
claude plugin install usage@code-usage-local --scope user
```

If you're switching from a local install, run this from that project's root after the global install succeeds.

```sh
claude plugin uninstall usage@code-usage-local --scope local --keep-data
```

### Update an existing install

After pulling a new version, run `claude plugin marketplace update code-usage-local`, then start a new Claude Code session.

### Migrate from the old plugin name

If you installed `code-usage-preview` in a project, run `claude plugin marketplace update code-usage-local` before installing Usage at your chosen scope. After the install succeeds, run `claude plugin uninstall code-usage-preview@code-usage-local --scope local --keep-data` from that project's root.

## Validation

For validation, run `claude plugin validate ./.claude-plugin/plugin.json --strict`.
