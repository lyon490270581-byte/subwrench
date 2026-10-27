// Text utilities: multilingual stats, token estimation, case transforms.

const CJK_RE = /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/;

export function countStats(text) {
  const chars = text.length;
  const charsNoSpaces = text.replace(/\s/g, "").length;
  const wordsLatin = (text.match(/[A-Za-z0-9]+(?:[''-][A-Za-z0-9]+)*/g) || []).length;
  const cjkChars = (text.match(new RegExp(CJK_RE.source, "g")) || []).length;
  const sentences = (text.match(/[^.!?。！？…]+[.!?。！？…]+/g) || []).length || (text.trim() ? 1 : 0);
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim()).length;
  const lines = text ? text.split("\n").length : 0;
  return {
    chars,
    charsNoSpaces,
    words: wordsLatin + cjkChars,
    cjkChars,
    sentences,
    paragraphs,
    lines,
    readingTimeMin: Math.max(1, Math.round((wordsLatin + cjkChars) / 200)),
  };
}

// Rough token estimate good enough for budgeting prompts.
export function estimateTokens(text, model = "gpt") {
  const asciiChars = text.replace(/[^\x00-\x7F]/g, "").length;
  const nonAscii = text.length - asciiChars;
  const ratios = { gpt: 4, claude: 3.6, gemini: 4 };
  const divisor = ratios[model] ?? 4;
  return Math.ceil(asciiChars / divisor + nonAscii * 1.1);
}

const SMALL_WORDS = new Set(["a","an","and","as","at","but","by","for","if","in","nor","of","on","or","so","the","to","up","yet"]);

export function caseTransform(text, to) {
  switch (to) {
    case "upper": return text.toUpperCase();
    case "lower": return text.toLowerCase();
    case "sentence": {
      return text.toLowerCase().replace(/(^\s*\w|[.!?]\s+\w)/g, (c) => c.toUpperCase());
    }
    case "title": {
      return text.toLowerCase().split(/(\s+)/).map((w, i, arr) => {
        if (!w.trim()) return w;
        const isEdge = i === 0 || i === arr.length - 1;
        if (!isEdge && SMALL_WORDS.has(w)) return w;
        return w[0].toUpperCase() + w.slice(1);
      }).join("");
    }
    case "camel": {
      const parts = text.split(/[^A-Za-z0-9]+/).filter(Boolean);
      return parts.map((p, i) => (i === 0 ? p.toLowerCase() : p[0].toUpperCase() + p.slice(1).toLowerCase())).join("");
    }
    case "pascal": {
      const parts = text.split(/[^A-Za-z0-9]+/).filter(Boolean);
      return parts.map((p) => p[0].toUpperCase() + p.slice(1).toLowerCase()).join("");
    }
    case "snake": {
      return text.replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(/[^A-Za-z0-9]+/).filter(Boolean).map((p) => p.toLowerCase()).join("_");
    }
    case "kebab": {
      return text.replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(/[^A-Za-z0-9]+/).filter(Boolean).map((p) => p.toLowerCase()).join("-");
    }
    case "constant": {
      return text.replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(/[^A-Za-z0-9]+/).filter(Boolean).map((p) => p.toUpperCase()).join("_");
    }
    default: throw new Error(`Unknown case: ${to}`);
  }
}
