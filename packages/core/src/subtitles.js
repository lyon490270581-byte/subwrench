// Subtitle engine: parse/build SRT, VTT, SBV, ASS + shift + merge.
// Intermediate format: { start: ms, end: ms, text: string }

const RE_SRT_TIME = /(\d{2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{1,3})/;
const RE_VTT_TIME = /(?:(\d{1,2}):)?(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(?:(\d{1,2}):)?(\d{2}):(\d{2})[.,](\d{3})/;
const RE_SBV_TIME = /(\d+):(\d{2}):(\d{2})[.,](\d{3}),(\d+):(\d{2}):(\d{2})[.,](\d{3})/;
const RE_ASS_TIME = /(\d+):(\d{2}):(\d{2})[.,](\d{2})/;

function pad(n, w) {
  return String(n).padStart(w, "0");
}

function hmsms(h, m, s, ms) {
  return h * 3600000 + m * 60000 + s * 1000 + ms;
}

function msToStamp(ms, sep) {
  ms = Math.max(0, Math.round(ms));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const milli = ms % 1000;
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)}${sep}${pad(milli, 3)}`;
}

function msToAssStamp(ms) {
  ms = Math.max(0, Math.round(ms));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  return `${h}:${pad(m, 2)}:${pad(s, 2)}.${pad(cs, 2)}`;
}

function detectFormat(content) {
  const head = content.slice(0, 2048);
  if (/^\uFEFF?WEBVTT/.test(head.trimStart()) || RE_VTT_TIME.test(head)) {
    if (/^\uFEFF?WEBVTT/.test(head.trimStart())) return "vtt";
    if (!RE_SRT_TIME.test(head)) return "vtt";
  }
  if (/\[Script Info\]|\[V4\+ Styles\]|\[Events\]/i.test(head)) return "ass";
  if (RE_SRT_TIME.test(head)) return "srt";
  if (RE_SBV_TIME.test(head)) return "sbv";
  return "unknown";
}

function parseSRT(content) {
  const norm = content.replace(/\r\n?/g, "\n").replace(/^\uFEFF/, "");
  const blocks = norm.split(/\n{2,}/);
  const cues = [];
  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.trim() !== "");
    if (lines.length === 0) continue;
    let idx = 0;
    if (RE_SRT_TIME.test(lines[0])) idx = 0;
    else if (lines.length > 1 && RE_SRT_TIME.test(lines[1])) idx = 1;
    else continue;
    const m = lines[idx].match(RE_SRT_TIME);
    const cue = {
      start: hmsms(+m[1], +m[2], +m[3], +m[4]),
      end: hmsms(+m[5], +m[6], +m[7], +m[8]),
      text: lines.slice(idx + 1).join("\n"),
    };
    if (cue.text) cues.push(cue);
  }
  return cues;
}

function parseVTT(content) {
  const norm = content.replace(/\r\n?/g, "\n").replace(/^\uFEFF/, "");
  const blocks = norm.split(/\n{2,}/);
  const cues = [];
  for (const block of blocks) {
    const lines = block.split("\n");
    let timeIdx = -1;
    let timeMatch = null;
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(RE_VTT_TIME);
      if (m) { timeIdx = i; timeMatch = m; break; }
    }
    if (timeIdx === -1) continue;
    const h1 = timeMatch[1] ? +timeMatch[1] : 0;
    const h2 = timeMatch[5] ? +timeMatch[5] : 0;
    const cue = {
      start: hmsms(h1, +timeMatch[2], +timeMatch[3], +timeMatch[4]),
      end: hmsms(h2, +timeMatch[6], +timeMatch[7], +timeMatch[8]),
      text: lines.slice(timeIdx + 1).join("\n"),
    };
    if (cue.text) cues.push(cue);
  }
  return cues;
}

function parseSBV(content) {
  const norm = content.replace(/\r\n?/g, "\n").replace(/^\uFEFF/, "");
  const blocks = norm.split(/\n{2,}/);
  const cues = [];
  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.trim() !== "");
    if (lines.length < 2) continue;
    const m = lines[0].match(RE_SBV_TIME);
    if (!m) continue;
    cues.push({
      start: hmsms(+m[1], +m[2], +m[3], +m[4]),
      end: hmsms(+m[5], +m[6], +m[7], +m[8]),
      text: lines.slice(1).join("\n"),
    });
  }
  return cues;
}

// Split ASS dialogue fields but keep the last field (Text) intact
// because it may contain commas.
function splitAssFields(rest, n) {
  const parts = [];
  let cur = rest;
  for (let i = 0; i < n - 1; i++) {
    const idx = cur.indexOf(",");
    if (idx === -1) {
      parts.push(cur);
      cur = "";
    } else {
      parts.push(cur.slice(0, idx));
      cur = cur.slice(idx + 1);
    }
  }
  parts.push(cur);
  return parts;
}

function parseASS(content) {
  const norm = content.replace(/\r\n?/g, "\n").replace(/^\uFEFF/, "");
  const cues = [];
  let formatFields = null;
  let section = "";
  for (const line of norm.split("\n")) {
    const secMatch = line.match(/^\[(.+)\]\s*$/);
    if (secMatch) { section = secMatch[1].toLowerCase(); continue; }
    if (section !== "events") continue;
    if (/^Format:/i.test(line)) {
      formatFields = line.replace(/^Format:\s*/i, "").split(",").map((f) => f.trim().toLowerCase());
      continue;
    }
    if (/^Dialogue:/i.test(line) && formatFields) {
      const rest = line.replace(/^Dialogue:\s*/i, "");
      const parts = splitAssFields(rest, formatFields.length);
      const map = {};
      formatFields.forEach((f, i) => { map[f] = parts[i] ?? ""; });
      const sm = (map.start || "").match(RE_ASS_TIME);
      const em = (map.end || "").match(RE_ASS_TIME);
      if (!sm || !em) continue;
      const text = (map.text || "")
        .replace(/\\N|\\n/g, "\n")
        .replace(/\{[^}]*\}/g, "")
        .trim();
      if (!text) continue;
      cues.push({
        start: hmsms(+sm[1], +sm[2], +sm[3], +sm[4] * 10),
        end: hmsms(+em[1], +em[2], +em[3], +em[4] * 10),
        text,
      });
    }
  }
  return cues;
}

function buildSRT(cues) {
  return (
    cues
      .map((c, i) => {
        return `${i + 1}\n${msToStamp(c.start, ",")} --> ${msToStamp(c.end, ",")}\n${c.text}`;
      })
      .join("\n\n") + "\n"
  );
}

function buildVTT(cues) {
  return (
    "WEBVTT\n\n" +
    cues
      .map((c) => `${msToStamp(c.start, ".")} --> ${msToStamp(c.end, ".")}\n${c.text}`)
      .join("\n\n") +
    "\n"
  );
}

function buildSBV(cues) {
  return (
    cues
      .map((c) => {
        const s = msToStamp(c.start, ".").replace(/^00:/, "0:");
        const e = msToStamp(c.end, ".").replace(/^00:/, "0:");
        return `${s},${e}\n${c.text}`;
      })
      .join("\n\n") + "\n"
  );
}

function buildASS(cues) {
  const header = `[Script Info]
; Generated by subkit
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,54,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2.4,0,2,60,60,40,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const body = cues
    .map(
      (c) =>
        `Dialogue: 0,${msToAssStamp(c.start)},${msToAssStamp(c.end)},Default,,0,0,0,,${c.text.replace(/\n/g, "\\N")}`
    )
    .join("\n");
  return header + body + "\n";
}

export function parse(content, format) {
  format = (format || detectFormat(content)).toLowerCase();
  switch (format) {
    case "srt": return parseSRT(content);
    case "vtt": return parseVTT(content);
    case "sbv": return parseSBV(content);
    case "ass": return parseASS(content);
    default: throw new Error(`Unknown subtitle format. Supported: srt, vtt, sbv, ass. Got: "${format}"`);
  }
}

export function build(cues, format) {
  switch ((format || "").toLowerCase()) {
    case "srt": return buildSRT(cues);
    case "vtt": return buildVTT(cues);
    case "sbv": return buildSBV(cues);
    case "ass": return buildASS(cues);
    default: throw new Error(`Unsupported target format: "${format}"`);
  }
}

export function convert(content, from, to) {
  return build(parse(content, from), to);
}

export function shift(content, ms, format) {
  const fmt = (format || detectFormat(content)).toLowerCase();
  if (fmt === "unknown") throw new Error("Cannot detect subtitle format");
  const cues = parse(content, fmt).map((c) => ({
    start: Math.max(0, c.start + ms),
    end: Math.max(0, c.end + ms),
    text: c.text,
  }));
  return build(cues, fmt);
}

export function merge(a, b, formatA, formatB, outputFormat) {
  const fa = formatA || detectFormat(a);
  const fb = formatB || detectFormat(b);
  const out = outputFormat || fa;
  const cues = [...parse(a, fa), ...parse(b, fb)].sort((x, y) => x.start - y.start);
  return build(cues, out);
}

export function stats(content, format) {
  const fmt = (format || detectFormat(content)).toLowerCase();
  const cues = parse(content, fmt);
  if (cues.length === 0) return { format: fmt, cues: 0 };
  const chars = cues.reduce((n, c) => n + c.text.length, 0);
  return {
    format: fmt,
    cues: cues.length,
    chars,
    durationSec: Math.round(cues[cues.length - 1].end / 1000),
    firstStart: cues[0].start,
    lastEnd: cues[cues.length - 1].end,
  };
}

export { detectFormat };
