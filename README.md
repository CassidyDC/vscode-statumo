# Claude Code Usage

A Claude Code mod that displays a plain-text usage line above the prompt when the graphical VS Code panel is the session's only display surface.

`Context <used>/<window>, x% used | 5h x% left, resets HH:mm | 7d x% left, resets Mon D | git-branch | session title`

Token counts use `k` for thousands and `m` for millions, as in `48.3k/1m`.

The line updates after turns and as Claude reports changes to plan limits. It checks the current Git worktree and saved session title every 10 seconds while the panel is attached. Reset times and dates use the local timezone.

A dash marks a reading Claude hasn't reported or a branch the mod couldn't read. A new session shows **Untitled** until Claude saves a title or summary.

## Install in VS Code

Use Claude Code for VS Code 2.1.299 or later. Sessions that run without feature flags require 2.1.304 or later. From a terminal in this directory, register the local marketplace and install the mod for the current project.

```sh
claude plugin marketplace add "$PWD"
claude plugin install code-usage-preview@code-usage-local --scope local
```

Open this folder in VS Code, dock the graphical Claude Code panel in the Secondary Side Bar, and start a new local conversation. Look for **Context** in the plugin’s status line. The line follows the Claude Code panel when you move it.

For validation, run `claude plugin validate ./.claude-plugin/plugin.json --strict`.

[Claude Code mod layout in VS Code](https://code.claude.com/docs/en/plugins/mods/interface#draw-in-the-vs-code-extension)
