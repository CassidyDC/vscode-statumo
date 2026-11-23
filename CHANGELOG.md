# Changelog

All notable changes to Statumo are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Show Claude Code and Codex context use and 5-hour and 7-day limit use in the status bar, one item per tool that starts with the tool's name, kept side by side.
- Lead each percent with a circular progress ring that fills in 5% steps, marked inside by layers for context, a clock for the 5-hour limit, or a calendar for the 7-day limit.
- Follow the latest session in the current workspace for context, and the account's latest reading for rate limits.
- Add a hover tooltip with a section and progress bar for context and each limit, session titles, token counts, when each limit resets, plan, and reading age. Claude Code titles come from the end of the session's own transcript.
- Use the warning and error backgrounds on a tool when either window runs low, with configurable thresholds.
- Run each item's configured click command, which opens the Claude Code or Codex panel by default.
- Ship the Usage mod for Claude Code inside the extension, and offer to install or update it through Claude Code's command line with one click, or with **Statumo: Install or Update the Usage Mod for Claude Code**. The mod writes each session's folder, transcript path, and context use, and the account's latest rate limits, to `~/.claude/statumo/` for Statumo to read.
