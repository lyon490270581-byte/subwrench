# subkit

Swiss-army toolkit for files & text 鈥?**one engine, four distribution channels**.

One zero-dependency core (`subwrench-core`) exposed as:

| Package | Channel | Status |
|---|---|---|
| `subwrench-cli` | npm / CLI | ready |
| `subwrench-mcp` | MCP server for Claude / Cursor / Windsurf | ready |
| `subwrench-bot` | Telegram bot | ready (needs BOT_TOKEN) |
| core lib | embed anywhere | ready |

## Capabilities

- **Subtitles**: parse / convert / shift / merge / stats across `srt`, `vtt`, `sbv`, `ass` 鈥?auto format detection, BOM-safe, CRLF-safe
- **Text**: multilingual word count (CJK-aware), LLM token estimation (gpt/claude/gemini), 9 case transforms
- **JSON**: validate (with error position), format, minify, recursive key sort, dot-path get
- **Hash/ID**: uuid v4, sha256/sha1/md5, hmac, base64, random hex (node:crypto)
- **Image**: jpg/png/webp/avif/tiff convert + compress + resize (optional `sharp`)

Everything runs locally. No API keys, no telemetry, no servers.

## CLI

```bash
npm i -g subwrench-cli
subkit subtitle convert movie.srt --to vtt
subkit subtitle shift movie.srt -500 -o fixed.srt
subkit subtitle merge en.srt zh.srt --out-format srt
subkit text tokens "$(cat draft.txt)" --model claude
subkit json get data.json a.b[1].c
subkit image convert photo.png --format webp --quality 80
```

## MCP

```jsonc
// claude_desktop_config.json / .cursor/mcp.json
{
  "mcpServers": {
    "subkit": { "command": "npx", "args": ["-y", "subwrench-mcp"] }
  }
}
```

9 tools: subtitle_convert, subtitle_shift, subtitle_merge, subtitle_stats, text_count, estimate_tokens, case_transform, json_tool, hash_tool.

## Telegram bot

```bash
BOT_TOKEN=<from @BotFather> npm run bot
```

Send a `.srt` file 鈫?caption `to vtt`. Send a photo 鈫?caption `webp 80`. Send raw JSON 鈫?formatted back.

## Development

```bash
npm install
npm test              # core unit tests
node scripts/mcp-smoke.mjs   # MCP protocol smoke test
```

MIT license.
