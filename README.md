# Claude Context

A VS Code status bar item that shows how full the context window of your Claude Code session is,
plus the 5-hour and weekly account limits:

```
🤖 158k/400k 40% · 5h 17% · 7d 70%
```

The Claude Code panel in VS Code does not run the `statusLine` command, so status line tools such
as [claude-hud](https://github.com/jarrodwatts/claude-hud) work only in the terminal. This
extension reads the same data from local files instead. It makes no network requests and needs no
credentials.

## What it shows

- **Context:** tokens of the last reply in the session's main thread, out of the context window.
  The item turns yellow from 80% and red from 90% (of the context or of either limit).
- **Tooltip:** session title, model, where the limit came from, reset times of the account limits
  and how old they are.
- **`$(fold)`** after the session was compacted, until the next reply.
- **`🤖 –`** when the folder has no Claude Code session with a reply yet.

Click the item to refresh it. It refreshes by itself every 2 seconds.

## Where the data comes from

- **Session:** the newest `~/.claude/projects/<folder>/*.jsonl` of the open folder. A session from
  the VS Code panel (`entrypoint: claude-vscode`) is preferred over a CLI one. A window without a
  folder shows the newest session of any project. Only the end of the file is read, and only
  when it changed.
- **Context tokens:** `input_tokens + cache_read_input_tokens + cache_creation_input_tokens` of the
  last `iterations[]` item of type `message`. With advisor calls, the top-level `usage` is the sum
  of all iterations, which would roughly double the number.
- **Compaction:** a `compact_boundary` newer than the last reply shows its `postTokens`.
- **Context window**, first match wins:
  1. `claudeContext.windows` in the VS Code settings,
  2. `modelSettings.<model>.autoCompactWindow` in `~/.claude/settings.json`,
  3. 1M for a model id ending in `[1m]`,
  4. `claudeContext.defaultWindow` (1M).

  Auto-compact starts a little before 100%: with a 400k limit it was observed around 372k.
- **Account limits:** `rate_limits` from `~/.claude/plugins/claude-hud/heartbeat.json`, where
  [claude-hud](https://github.com/jarrodwatts/claude-hud) saves the last status line input. They are
  refreshed only while a Claude Code CLI session with claude-hud runs. A value older than
  `claudeContext.limitsStaleMinutes` (15) gets a `?`, and after its reset time it shows `–`.
  Without claude-hud only the context is shown. This file is internal to claude-hud and may change.

## Settings

| setting | default | meaning |
| --- | --- | --- |
| `claudeContext.language` | `auto` | `auto` (VS Code display language), `en` or `cs` |
| `claudeContext.windows` | `{}` | context window per model id |
| `claudeContext.defaultWindow` | `1000000` | window for a model without any other source |
| `claudeContext.warningPercent` | `80` | yellow from this percentage |
| `claudeContext.errorPercent` | `90` | red from this percentage |
| `claudeContext.showLimits` | `true` | show the 5 h / 7 day limits |
| `claudeContext.limitsStaleMinutes` | `15` | minutes until the limits get a `?` |
| `claudeContext.preferVsCodeSession` | `true` | prefer the VS Code panel session over the CLI one |

## Install

Download the `.vsix` from the [releases](https://github.com/atep77/claude-context/releases) and run:

```
code --install-extension claude-context-<version>.vsix
```

or in VS Code: Extensions → `...` → Install from VSIX. The item appears after a reload or in a new
window. If the status bar is hidden, run **View: Toggle Status Bar Visibility**.

## Build

No dependencies and no build step. To package:

```
npx @vscode/vsce package
```

To try it without installing:

```
code --new-window --extensionDevelopmentPath=/path/to/this/folder
```

## License

MIT
