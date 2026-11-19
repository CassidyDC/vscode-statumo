# Claude Code Usage

**Usage** is a Claude Code mod that displays a plain-text usage line above the prompt when the graphical VS Code panel is the session's only display surface.

`Context <used>/<window>, x% used | 5h x% left, resets HH:mm | 7d x% left, resets Mon D | session title | git-branch`

Token counts use `k` for thousands and `m` for millions, as in `48.3k/1m`.

The line updates after turns and as Claude reports changes to plan limits. It checks the current Git worktree and saved session title every 10 seconds while the panel is attached. Reset times and dates use the local timezone.

A dash marks a reading Claude hasn't reported or a branch the mod couldn't read. A new session shows **Untitled** until Claude saves a title or summary.

## Install in VS Code

Use Claude Code for VS Code 2.1.299 or later. Sessions that run without feature flags require 2.1.304 or later.

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

### Open the Claude Code panel

Open a project in VS Code, dock the graphical Claude Code panel in the Secondary Side Bar, and start a new local conversation. Look for **Context** in the Usage status line. The line follows the Claude Code panel when you move it.

### Migrate from the old plugin name

If you installed `code-usage-preview` in a project, run `claude plugin marketplace update code-usage-local` before installing Usage at your chosen scope. After the install succeeds, run `claude plugin uninstall code-usage-preview@code-usage-local --scope local --keep-data` from that project's root.

## Validation

For validation, run `claude plugin validate ./.claude-plugin/plugin.json --strict`.

[Claude Code mod layout in VS Code](https://code.claude.com/docs/en/plugins/mods/interface#draw-in-the-vs-code-extension)
