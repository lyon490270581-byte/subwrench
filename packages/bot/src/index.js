import { Telegraf, Input } from "telegraf";
import http from "node:http";
import * as core from "subwrench-core";
import { initBotDb, track, saveDb } from "./analytics.js";

const TOKEN = process.env.BOT_TOKEN;
if (!TOKEN) {
  console.error("Set BOT_TOKEN env var (get one from @BotFather)");
  process.exit(1);
}

await initBotDb();
setInterval(saveDb, 30_000); // persist analytics every 30s
process.once("SIGINT", () => { saveDb(); process.exit(0); });
process.once("SIGTERM", () => { saveDb(); process.exit(0); });

// Minimal health endpoint (Render web services require an open port)
const PORT = process.env.PORT || 0;
if (PORT) {
  http.createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, server: "subwrench-bot" }));
    } else {
      res.writeHead(302, { Location: "https://github.com/lyon490270581-byte/subwrench" });
      res.end();
    }
  }).listen(PORT, () => console.log(`health on :${PORT}`));
}

// Optional HTTP proxy for Telegram API (needed in CN; not on Render)
let agent;
if (process.env.HTTPS_PROXY) {
  const { HttpsProxyAgent } = await import("https-proxy-agent");
  agent = new HttpsProxyAgent(process.env.HTTPS_PROXY);
}

// Route Telegram API through a reverse proxy (e.g. Cloudflare Worker) if set
const apiRoot = process.env.TELEGRAM_API_ROOT;

const bot = new Telegraf(TOKEN, {
  handlerTimeout: 60000,
  telegram: { agent, apiRoot: apiRoot || undefined },
});
const SUB_EXTS = ["srt", "vtt", "sbv", "ass"];
const IMG_EXTS = ["jpg", "jpeg", "png", "webp", "avif", "tiff", "gif"];

const HELP = `<b>subwrench</b> - file &amp; text swiss-army knife

<b>Subtitles</b> - send a .srt/.vtt/.sbv/.ass file with a caption:
"to vtt" convert | "shift 500" shift ms | "stats"

<b>Images</b> - send a photo with caption:
"webp 80" convert to webp at q80 | "png" | "resize 800" (width)

<b>Text</b> - send any text message:
/count, /tokens, /case title
Send raw JSON -&gt; auto-formatted.`;

bot.start((ctx) => ctx.replyWithHTML(HELP));
bot.help((ctx) => ctx.replyWithHTML(HELP));

// 鈹€鈹€ subtitle / json documents 鈹€鈹€
bot.on("document", async (ctx) => {
  const doc = ctx.message.document;
  const ext = (doc.file_name || "").split(".").pop().toLowerCase();
  const caption = (ctx.message.caption || "").trim().toLowerCase();

  if (!SUB_EXTS.includes(ext) && ext !== "json" && ext !== "txt") {
    return ctx.reply(`Unsupported file type .${ext}. Send subtitle files (${SUB_EXTS.join("/")}), .json, or images.`);
  }
  const link = await ctx.telegram.getFileLink(doc.file_id);
  const buf = Buffer.from(await (await fetch(link)).arrayBuffer());
  const content = buf.toString("utf8");

  try {
    if (ext === "json" || (ext === "txt" && caption.startsWith("json"))) {
      const v = core.json.validate(content);
      if (!v.valid) return ctx.reply(`Invalid JSON: ${v.error}`);
      const out = caption.includes("min") ? core.json.minify(content) : core.json.format(content);
      return ctx.replyWithDocument({ source: Buffer.from(out), filename: "formatted.json" });
    }
    // subtitles
    const fmt = core.subtitles.detectFormat(content);
    if (fmt === "unknown") return ctx.reply("Could not detect subtitle format.");
    if (caption.startsWith("stats") || !caption) {
      const s = core.subtitles.stats(content, fmt);
      return ctx.reply(
        `Detected: ${fmt}\nCues: ${s.cues}\nChars: ${s.chars}\nDuration: ${s.durationSec}s\n\nCaption "to vtt|srt|sbv|ass" to convert, "shift 500" (ms), or "stats".`
      );
    }
    if (caption.startsWith("to ")) {
      const to = caption.split(/\s+/)[1];
      const out = core.subtitles.convert(content, fmt, to);
      return ctx.replyWithDocument({ source: Buffer.from(out), filename: doc.file_name.replace(/\.\w+$/, "") + "." + to });
    }
    if (caption.startsWith("shift")) {
      const ms = Number(caption.split(/\s+/)[1]);
      if (Number.isNaN(ms)) return ctx.reply("Usage: shift 500 (milliseconds)");
      const out = core.subtitles.shift(content, ms);
      return ctx.replyWithDocument({ source: Buffer.from(out), filename: doc.file_name });
    }
    return ctx.reply("Unknown caption. Use: `to vtt` / `shift 500` / `stats`");
  } catch (e) {
    return ctx.reply(`Error: ${e.message}`);
  }
});

// 鈹€鈹€ images (compressed photos) 鈹€鈹€
bot.on("photo", async (ctx) => {
  const caption = (ctx.message.caption || "webp 80").trim().toLowerCase().match(/\S+/g) || ["webp", "80"];
  const photo = ctx.message.photo[ctx.message.photo.length - 1];
  const link = await ctx.telegram.getFileLink(photo.file_id);
  const buf = Buffer.from(await (await fetch(link)).arrayBuffer());
  try {
    const fmt = ["webp", "png", "jpg", "avif", "tiff"].includes(caption[0]) ? caption[0] : "webp";
    const q = Math.min(100, Math.max(1, Number(caption[1]) || 80));
    const width = caption[0] === "resize" ? Number(caption[1]) || 800 : undefined;
    const r = await core.image.convertImage(buf, {
      format: fmt,
      quality: q,
      width,
    });
    return ctx.replyWithDocument(
      { source: r.data, filename: `subwrench.${fmt}` },
      { caption: `${r.format} ${r.width}x${r.height} ${(r.size / 1024).toFixed(0)}KB (saved ${r.savedPct}%)` }
    );
  } catch (e) {
    return ctx.reply(`Error: ${e.message}`);
  }
});

// 鈹€鈹€ plain text 鈹€鈹€
bot.on("text", (ctx) => {
  const msg = ctx.message.text;
  const [, cmd] = msg.match(/^(\/\w+)\s*([\s\S]*)$/) || [];
  if (cmd === "/count") return ctx.reply(JSON.stringify(core.text.countStats(msg.replace(/^\/count\s*/, "")), null, 2));
  if (cmd === "/tokens") return ctx.reply(`~${core.text.estimateTokens(msg.replace(/^\/tokens\s*/, ""))} tokens`);
  const caseMatch = msg.match(/^\/case\s+(\w+)\s*([\s\S]*)$/);
  if (caseMatch) {
    try {
      return ctx.reply(core.text.caseTransform(caseMatch[2], caseMatch[1].toLowerCase()));
    } catch {
      return ctx.reply("Cases: upper lower title sentence camel pascal snake kebab constant");
    }
  }
  const trimmed = msg.trim();
  if ((trimmed.startsWith("{") || trimmed.startsWith("[")) && core.json.validate(trimmed).valid) {
    return ctx.reply(core.json.format(trimmed), { parse_mode: undefined });
  }
  return ctx.reply("Send a subtitle/image file, raw JSON, or use /count /tokens /case. /help for details.");
});

bot.catch((err, ctx) => console.error(`bot error for ${ctx.updateType}:`, err.message));
bot.launch();
console.log("subwrench bot running");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
