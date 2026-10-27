export * as subtitles from "./subtitles.js";
export * as text from "./text.js";
export * as json from "./json.js";
export * as hash from "./hash.js";
export * as image from "./image.js";

export const VERSION = "0.1.0";
export const CAPABILITIES = [
  "subtitle: srt/vtt/sbv/ass parse, convert, shift, merge, stats",
  "text: multilingual word/char count, token estimation (gpt/claude/gemini), 8 case transforms",
  "json: validate, format, minify, sort keys, path get, stats",
  "hash: uuid, sha256/sha1/md5, hmac, base64, random hex",
  "image: jpg/png/webp/avif/tiff convert & compress & resize (needs optional sharp)",
];
