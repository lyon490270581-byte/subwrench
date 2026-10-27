#!/usr/bin/env node
import { program } from "commander";
import fs from "node:fs";
import path from "node:path";
import * as core from "subwrench-core";

program.name("subkit").description("Swiss-army CLI for files & text").version(core.VERSION);

const readInput = (file) => (file === "-" ? fs.readFileSync(0, "utf8") : fs.readFileSync(file, "utf8"));
const writeOut = (out, str) => {
  if (out) fs.writeFileSync(out, str);
  else process.stdout.write(str);
};

const subtitle = program.command("subtitle").description("Subtitle tools (srt/vtt/sbv/ass)");
subtitle
  .command("convert <file>")
  .description("convert subtitle file between srt/vtt/sbv/ass")
  .requiredOption("--to <fmt>", "target format: srt|vtt|sbv|ass")
  .option("--from <fmt>", "source format (auto-detected if omitted)")
  .option("-o, --out <file>", "write to file instead of stdout")
  .action((file, opts) => writeOut(opts.out, core.subtitles.convert(readInput(file), opts.from, opts.to)));
subtitle
  .command("shift <file> <ms>")
  .description("shift all cues by milliseconds (negative to move earlier)")
  .option("-o, --out <file>", "write to file instead of stdout")
  .action((file, ms, opts) => writeOut(opts.out, core.subtitles.shift(readInput(file), Number(ms))));
subtitle
  .command("merge <fileA> <fileB>")
  .description("merge two subtitle files, sorted by time")
  .option("--out-format <fmt>", "output format (default: same as fileA)")
  .option("-o, --out <file>", "write to file instead of stdout")
  .action((a, b, opts) => writeOut(opts.out, core.subtitles.merge(readInput(a), readInput(b), null, null, opts.outFormat)));
subtitle
  .command("stats <file>")
  .description("show cue count, duration, char count")
  .action((file) => console.log(JSON.stringify(core.subtitles.stats(readInput(file)), null, 2)));

const text = program.command("text").description("Text tools");
text
  .command("count [text...]")
  .description("word/char/sentence stats (multilingual). Reads stdin with -")
  .action((parts) => {
    const input = parts.length ? parts.join(" ") : fs.readFileSync(0, "utf8");
    console.log(JSON.stringify(core.text.countStats(input), null, 2));
  });
text
  .command("tokens [text...]")
  .description("estimate LLM tokens. Reads stdin with -")
  .option("--model <m>", "gpt|claude|gemini", "gpt")
  .action((parts, opts) => {
    const input = parts.length ? parts.join(" ") : fs.readFileSync(0, "utf8");
    console.log(core.text.estimateTokens(input, opts.model));
  });
for (const to of ["upper", "lower", "title", "sentence", "camel", "pascal", "snake", "kebab", "constant"]) {
  text
    .command(`${to} [text...]`)
    .description(`transform case to ${to}. Reads stdin with -`)
    .action((parts) => {
      const input = parts.length ? parts.join(" ") : fs.readFileSync(0, "utf8");
      process.stdout.write(core.text.caseTransform(input, to) + "\n");
    });
}

const json = program.command("json").description("JSON tools");
json.command("validate <file>").description("validate JSON, show error position").action((file) => {
  const r = core.json.validate(readInput(file));
  console.log(r.valid ? "valid" : `INVALID: ${r.error}${r.context ? `\nnear: ...${r.context}...` : ""}`);
  if (!r.valid) process.exitCode = 1;
});
json.command("format <file>").option("-i, --indent <n>", "indent spaces", "2").option("-o, --out <file>").description("pretty-print JSON").action((file, opts) => writeOut(opts.out, core.json.format(readInput(file), +opts.indent)));
json.command("minify <file>").option("-o, --out <file>").description("minify JSON").action((file, opts) => writeOut(opts.out, core.json.minify(readInput(file))));
json.command("sort <file>").option("--desc").description("sort all object keys recursively").action((file, opts) => process.stdout.write(core.json.sortKeys(readInput(file), opts.desc ? "desc" : "asc")));
json.command("get <file> <path>").description("extract value by dot path, e.g. a.b[1].c").action((file, p) => {
  const v = core.json.get(readInput(file), p);
  console.log(v === null ? "null" : typeof v === "object" ? JSON.stringify(v, null, 2) : v);
});

const hash = program.command("hash").description("Hash & id tools");
hash.command("uuid").option("-n <count>", "how many", "1").description("generate UUID v4").action((opts) => console.log(core.hash.uuid(+opts.n).join("\n")));
hash.command("sha256 <input>").option("-f, --file <file>", "hash file content instead of arg").description("SHA-256 hex digest").action((input, opts) => console.log(core.hash.sha256(opts.file ? fs.readFileSync(opts.file) : input)));
hash.command("md5 <input>").option("-f, --file <file>", "hash file content instead of arg").description("MD5 hex digest").action((input, opts) => console.log(core.hash.md5(opts.file ? fs.readFileSync(opts.file) : input)));
hash.command("b64e <input>").description("base64 encode").action((input) => console.log(core.hash.base64Encode(input)));
hash.command("b64d <input>").description("base64 decode").action((input) => process.stdout.write(core.hash.base64Decode(input) + "\n"));

const image = program.command("image").description("Image tools (requires optional sharp)");
image
  .command("convert <file>")
  .requiredOption("--format <fmt>", "jpg|png|webp|avif|tiff")
  .option("--quality <n>", "1-100", "80")
  .option("--width <px>")
  .option("--height <px>")
  .option("-o, --out <file>", "output file (default: same name with new extension)")
  .description("convert / compress / resize an image")
  .action(async (file, opts) => {
    const buf = fs.readFileSync(file);
    const r = await core.image.convertImage(buf, {
      format: opts.format,
      quality: +opts.quality,
      width: opts.width ? +opts.width : undefined,
      height: opts.height ? +opts.height : undefined,
    });
    const out = opts.out || file.replace(path.extname(file), "") + "." + (opts.format === "jpeg" ? "jpg" : opts.format);
    fs.writeFileSync(out, r.data);
    console.log(`${out}: ${r.format} ${r.width}x${r.height} ${(r.size / 1024).toFixed(1)}KB (saved ${r.savedPct}%)`);
  });
image.command("info <file>").description("image metadata").action(async (file) => {
  const meta = await core.image.imageInfo(fs.readFileSync(file));
  console.log(JSON.stringify({ format: meta.format, width: meta.width, height: meta.height, size: meta.size }, null, 2));
});

program.parseAsync();
