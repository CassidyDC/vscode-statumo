# Changelog

All notable changes to Statumo are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Show Claude Code and Codex context use, 5-hour and 7-day limits left, in the status bar, each tool marked by its name.
- Lead each percent with a circular progress ring that fills in 5% steps, marked inside by layers for context, a clock for the 5-hour limit, or a calendar for the 7-day limit.
- Follow the latest session in the current workspace for context, and the account's latest reading for rate limits.
- Add a hover tooltip on the context with session titles, token counts, exact reset times, plan, and reading age.
- Show when a limit resets, as a countdown and an exact time, when you hover over it.
- Use the warning and error backgrounds on a window that runs low, with configurable thresholds.
- Open the Claude Code or Codex panel when you click its item.
- Ship the Usage mod for Claude Code in `claude-mod/`, installed from this repository's `statumo` marketplace, to write each session's context use, rate limits, and title for Statumo to read.
