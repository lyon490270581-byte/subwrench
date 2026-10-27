// subwrench MCP over Streamable HTTP (for Smithery / remote installs)
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import * as core from "subwrench-core";

function buildServer() {
  const server = new McpServer({ name: "subwrench-mcp", version: "0.1.0" });
  const ok = (text) => ({ content: [{ type: "text", text }] });
  const wrap = (fn) => async (args) => {
    try {
      return ok(await fn(args));
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
    }
  };

  server.tool("subtitle_convert", "Convert subtitles between srt/vtt/sbv/ass formats.", {
    content: z.string().describe("Raw subtitle file content"),
    to: z.enum(["srt", "vtt", "sbv", "ass"]),
    from: z.enum(["srt", "vtt", "sbv", "ass"]).optional(),
  }, wrap(({ content, from, to }) => core.subtitles.convert(content, from, to)));

  server.tool("subtitle_shift", "Shift all subtitle cues by milliseconds.", {
    content: z.string(), ms: z.number().int(),
  }, wrap(({ content, ms }) => core.subtitles.shift(content, ms)));

  server.tool("subtitle_merge", "Merge two subtitle files, sorted by time.", {
    a: z.string(), b: z.string(),
    output_format: z.enum(["srt", "vtt", "sbv", "ass"]).optional(),
  }, wrap(({ a, b, output_format }) => core.subtitles.merge(a, b, null, null, output_format || "srt")));

  server.tool("subtitle_stats", "Stats: format, cue count, duration, chars.", { content: z.string() },
    wrap(({ content }) => JSON.stringify(core.subtitles.stats(content), null, 2)));

  server.tool("text_count", "Multilingual word/char/sentence count (CJK-aware).", { text: z.string() },
    wrap(({ text }) => JSON.stringify(core.text.countStats(text), null, 2)));

  server.tool("estimate_tokens", "Estimate LLM tokens for gpt/claude/gemini.", {
    text: z.string(), model: z.enum(["gpt", "claude", "gemini"]).default("gpt"),
  }, wrap(({ text, model }) => `~${core.text.estimateTokens(text, model)} tokens (${model})`));

  server.tool("case_transform", "Transform case (upper/lower/title/camel/snake/...).", {
    text: z.string(), to: z.enum(["upper", "lower", "title", "sentence", "camel", "pascal", "snake", "kebab", "constant"]),
  }, wrap(({ text, to }) => core.text.caseTransform(text, to)));

  server.tool("json_tool", "Validate/format/minify/sort/get on JSON.", {
    json: z.string(), op: z.enum(["validate", "format", "minify", "sort", "get", "stats"]),
    indent: z.number().int().min(0).max(8).default(2), path: z.string().optional(),
  }, wrap(({ json, op, indent, path }) => {
    switch (op) {
      case "validate": return JSON.stringify(core.json.validate(json));
      case "format": return core.json.format(json, indent);
      case "minify": return core.json.minify(json);
      case "sort": return core.json.sortKeys(json);
      case "get": return JSON.stringify(core.json.get(json, path ?? ""));
      case "stats": return JSON.stringify(core.json.stats(json));
    }
  }));

  server.tool("hash_tool", "uuid/sha256/sha1/md5/base64.", {
    op: z.enum(["uuid", "sha256", "sha1", "md5", "b64e", "b64d"]),
    input: z.string().optional(), n: z.number().int().min(1).max(100).default(1),
  }, wrap(({ op, input = "", n }) => {
    switch (op) {
      case "uuid": return core.hash.uuid(n).join("\n");
      case "sha256": return core.hash.sha256(input);
      case "sha1": return core.hash.sha1(input);
      case "md5": return core.hash.md5(input);
      case "b64e": return core.hash.base64Encode(input);
      case "b64d": return core.hash.base64Decode(input);
    }
  }));

  return server;
}

const app = express();
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => res.json({ ok: true, server: "subwrench-mcp", version: "0.1.0" }));

app.post("/mcp", async (req, res) => {
  try {
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => { transport.close(); server.close(); });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const GET_DELETE = async (_req, res) => res.status(405).json({ error: "Method not allowed: stateless server" });
app.get("/mcp", GET_DELETE);
app.delete("/mcp", GET_DELETE);

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`subwrench-mcp http listening on :${port}/mcp`));
