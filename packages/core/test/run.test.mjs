import assert from "node:assert";
import * as core from "../../core/src/index.js";

const SRT = `1
00:00:01,000 --> 00:00:04,000
Hello world
Second line

2
00:00:05,500 --> 00:00:08,000
Second subtitle
`;

const VTT = `WEBVTT

00:00:01.000 --> 00:00:04.000
Hello world
Second line

00:00:05.500 --> 00:00:08.000
Second subtitle
`;

const SBV = `0:00:01.000,0:00:04.000
Hello world

0:00:05.500,0:00:08.000
Second subtitle
`;

const ASS = `[Script Info]
ScriptType: v4.00+

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:04.00,Default,,0,0,0,,Hello world
Dialogue: 0,0:00:05.50,0:00:08.00,Default,,0,0,0,,Second subtitle
`;

// ── subtitles ──
assert.equal(core.subtitles.detectFormat(SRT), "srt");
assert.equal(core.subtitles.detectFormat(VTT), "vtt");
assert.equal(core.subtitles.detectFormat(SBV), "sbv");
assert.equal(core.subtitles.detectFormat(ASS), "ass");

let cues = core.subtitles.parse(SRT);
assert.equal(cues.length, 2);
assert.equal(cues[0].start, 1000);
assert.equal(cues[1].start, 5500);

assert.ok(core.subtitles.convert(SRT, "srt", "vtt").startsWith("WEBVTT"));
assert.ok(core.subtitles.convert(VTT, "vtt", "srt").includes("00:00:01,000"));
assert.ok(core.subtitles.convert(SBV, "sbv", "ass").includes("[Script Info]"));
assert.ok(core.subtitles.convert(ASS, "ass", "srt").includes("Hello world"));

const shifted = core.subtitles.shift(SRT, 500);
assert.ok(shifted.includes("00:00:01,500 --> 00:00:04,500"));

const merged = core.subtitles.merge(SRT, VTT);
const mergedCues = core.subtitles.parse(merged);
assert.equal(mergedCues.length, 4);

const st = core.subtitles.stats(SRT);
assert.equal(st.cues, 2);
assert.equal(st.durationSec, 8);

// ── text ──
const ts = core.subtitles; // silence lint style
const stats = core.text.countStats("Hello world 你世界");
assert.equal(stats.words, 5); // 2 latin words + 3 cjk chars
assert.ok(core.text.estimateTokens("a".repeat(100)) >= 25);
assert.equal(core.text.caseTransform("hello world", "upper"), "HELLO WORLD");
assert.equal(core.text.caseTransform("hello world", "title"), "Hello World");
assert.equal(core.text.caseTransform("hello world test", "camel"), "helloWorldTest");
assert.equal(core.text.caseTransform("helloWorldTest", "snake"), "hello_world_test");
assert.equal(core.text.caseTransform("hello world", "kebab"), "hello-world");

// ── json ──
assert.ok(core.json.validate('{"a":1}').valid);
assert.ok(!core.json.validate('{"a":}').valid);
assert.equal(core.json.format('{"b":2,"a":1}'), '{\n  "b": 2,\n  "a": 1\n}');
assert.equal(core.json.sortKeys('{"b":2,"a":1}'), '{\n  "a": 1,\n  "b": 2\n}');
assert.equal(core.json.get('{"a":{"b":[10,20]}}', "a.b[1]"), 20);
assert.equal(core.json.minify('{ "a": 1 }'), '{"a":1}');
assert.ok(core.json.stats('{"a":[1,2,3]}').nodes >= 1);

// ── hash ──
assert.match(core.hash.uuid()[0], /^[0-9a-f-]{36}$/);
assert.equal(core.hash.sha256("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
assert.equal(core.hash.md5("abc"), "900150983cd24fb0d6963f7d28e17f72");
assert.equal(core.hash.base64Decode(core.hash.base64Encode("你好")), "你好");
assert.match(core.hash.randomHex(8), /^[0-9a-f]{16}$/);

console.log("ALL CORE TESTS PASSED");
