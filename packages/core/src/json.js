// JSON tools: validate, format, minify, sort keys, get by path.

function stripBom(str) {
  return str.replace(/^\uFEFF/, "");
}

export function validate(str) {
  try {
    JSON.parse(stripBom(str));
    return { valid: true };
  } catch (e) {
    const pos = e.message.match(/position (\d+)/);
    let context = null;
    if (pos) {
      const p = +pos[1];
      context = str.slice(Math.max(0, p - 20), p + 20);
    }
    return { valid: false, error: e.message, context };
  }
}

export function format(str, indent = 2) {
  return JSON.stringify(JSON.parse(stripBom(str)), null, indent);
}

export function minify(str) {
  return JSON.stringify(JSON.parse(stripBom(str)));
}

function sortDeep(v, dir) {
  if (Array.isArray(v)) return v.map((x) => sortDeep(x, dir));
  if (v && typeof v === "object") {
    const keys = Object.keys(v).sort((a, b) => (dir === "desc" ? b.localeCompare(a) : a.localeCompare(b)));
    const out = {};
    for (const k of keys) out[k] = sortDeep(v[k], dir);
    return out;
  }
  return v;
}

export function sortKeys(str, dir = "asc") {
  return JSON.stringify(sortDeep(JSON.parse(stripBom(str)), dir), null, 2);
}

export function get(str, path) {
  const data = JSON.parse(stripBom(str));
  const parts = path.split(".").map((p) => p.replace(/\[(\d+)\]$/, ":$1")).flatMap((p) => {
    const [k, idx] = p.split(":");
    return idx !== undefined ? [k, Number(idx)] : [k];
  });
  let cur = data;
  for (const p of parts) {
    if (cur == null) return null;
    cur = cur[p];
  }
  return cur === undefined ? null : cur;
}

export function stats(str) {
  const data = JSON.parse(stripBom(str));
  const count = (v) => {
    if (Array.isArray(v)) return v.reduce((n, x) => n + count(x), 1);
    if (v && typeof v === "object") return Object.values(v).reduce((n, x) => n + count(x), 1);
    return 1;
  };
  return {
    nodes: count(data),
    bytes: Buffer.byteLength(str, "utf8"),
    minifiedBytes: Buffer.byteLength(JSON.stringify(data), "utf8"),
  };
}

