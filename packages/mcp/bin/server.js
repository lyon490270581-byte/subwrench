#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as core from "subwrench-core";

const server = new McpServer({ name: "subwrench-mcp", version: "0.1.0" });

const ok = (text) => ({ content: [{ type: "text", text }] });
const fail = (e) => ({ content: [{ type: "text", text: `Error: ${e.message}` }], isError: true });

const wrap = (fn) => async (args) => {
  try {
    return ok(await fn(args));
  } catch (e) {
    return fail(e);
  }
};

server.tool(
  "subtitle_convert",
  "Convert subtitles between srt/vtt/sbv/ass formats. Pass raw subtitle content (not a file path).",
  {
    content: z.string().describe("Raw subtitle file content"),
    to: z.enum(["srt", "vtt", "sbv", "ass"]).describe("Target format"),
    from: z.enum(["srt", "vtt", "sbv", "ass"]).optional().describe("Source format; auto-detected if omitted"),
  },
  wrap(({ content, from, to }) => core.subtitles.convert(content, from, to))
);

server.tool(
  "subtitle_shift",
  "Shift all subtitle cues by a millisecond offset (positive = later, negative = earlier).",
  {
    content: z.string().describe("Raw subtitle file content"),
    ms: z.number().int().describe("Offset in milliseconds"),
  },
  wrap(({ content, ms }) => core.subtitles.shift(content, ms))
);

server.tool(
  "subtitle_merge",
  "Merge two subtitle files (e.g. translated + original) into one, sorted by start time.",
  {
    a: z.string().describe("First subtitle content"),
    b: z.string().describe("Second subtitle content"),
    output_format: z.enum(["srt", "vtt", "sbv", "ass"]).optional(),
  },
  wrap(({ a, b, output_format }) => core.subtitles.merge(a, b, null, null, output_format || "srt"))
);

server.tool(
  "subtitle_stats",
  "Get stats for subtitle content: format, cue count, duration, character count.",
  { content: z.string() },
  wrap(({ content }) => JSON.stringify(core.subtitles.stats(content), null, 2))
);

server.tool(
  "text_count",
  "Count words/characters/sentences/paragraphs. Handles CJK (Chinese/Japanese/Korean) correctly: CJK chars count as words.",
  { text: z.string() },
  wrap(({ text }) => JSON.stringify(core.text.countStats(text), null, 2))
);

server.tool(
  "estimate_tokens",
  "Estimate LLM token count for text before sending to gpt/claude/gemini. Useful for prompt budgeting.",
  {
    text: z.string(),
    model: z.enum(["gpt", "claude", "gemini"]).default("gpt"),
  },
  wrap(({ text, model }) => `~${core.text.estimateTokens(text, model)} tokens (${model})`)
);

server.tool(
  "case_transform",
  "Transform text case: upper, lower, title, sentence, camel, pascal, snake, kebab, constant.",
  {
    text: z.string(),
    to: z.enum(["upper", "lower", "title", "sentence", "camel", "pascal", "snake", "kebab", "constant"]),
  },
  wrap(({ text, to }) => core.text.caseTransform(text, to))
);

server.tool(
  "json_tool",
  "Validate / format / minify / sort-keys / path-get on JSON strings.",
  {
    json: z.string().describe("Raw JSON string"),
    op: z.enum(["validate", "format", "minify", "sort", "get", "stats"]),
    indent: z.number().int().min(0).max(8).default(2),
    path: z.string().optional().describe("Dot path for 'get', e.g. a.b[1].c"),
  },
  wrap(({ json, op, indent, path }) => {
    switch (op) {
      case "validate": return JSON.stringify(core.json.validate(json));
      case "format": return core.json.format(json, indent);
      case "minify": return core.json.minify(json);
      case "sort": return core.json.sortKeys(json);
      case "get": return JSON.stringify(core.json.get(json, path ?? ""));
      case "stats": return JSON.stringify(core.json.stats(json));
    }
  })
);

server.tool(
  "hash_tool",
  "Generate uuid v4, sha256/sha1/md5, base64 encode/decode, hmac.",
  {
    op: z.enum(["uuid", "sha256", "sha1", "md5", "b64e", "b64d"]),
    input: z.string().optional(),
    n: z.number().int().min(1).max(100).default(1),
  },
  wrap(({ op, input = "", n }) => {
    switch (op) {
      case "uuid": return core.hash.uuid(n).join("\n");
      case "sha256": return core.hash.sha256(input);
      case "sha1": return core.hash.sha1(input);
      case "md5": return core.hash.md5(input);
      case "b64e": return core.hash.base64Encode(input);
      case "b64d": return core.hash.base64Decode(input);
    }
  })
);

await server.connect(new StdioServerTransport());
