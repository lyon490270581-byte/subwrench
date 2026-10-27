// subkit traffic dashboard: aggregates npm downloads + GitHub metrics (+ bot stats if present).
// Usage: node scripts/stats.mjs [--owner YOUR_GH_OWNER]
// Optional: set GITHUB_TOKEN for traffic/clones data (repo owner only).

const PACKAGES = ["subwrench-core", "subwrench-cli", "subwrench-mcp", "subwrench-bot"];
const owner = process.argv.includes("--owner")
  ? process.argv[process.argv.indexOf("--owner") + 1]
  : process.env.GH_OWNER || null;
const ghToken = process.env.GITHUB_TOKEN || null;

async function j(url, headers = {}) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": "subkit-stats", ...headers }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    return r.json();
  } catch {
    return null;
  }
}

function bar(n, max, width = 20) {
  const filled = max ? Math.round((n / max) * width) : 0;
  return "#".repeat(filled) + ".".repeat(width - filled);
}

console.log(`\nsubwrench traffic report ${new Date().toISOString().slice(0, 10)}\n`);

// ---- npm downloads ----
console.log("---- npm downloads ----");
let totalWeek = 0;
for (const pkg of PACKAGES) {
  const [day, week, month] = await Promise.all([
    j(`https://api.npmjs.org/downloads/point/last-day/${pkg}`),
    j(`https://api.npmjs.org/downloads/point/last-week/${pkg}`),
    j(`https://api.npmjs.org/downloads/point/last-month/${pkg}`),
  ]);
  if (!week) { console.log(`  ${pkg}: not published yet`); continue; }
  totalWeek += week.downloads || 0;
  const trend = day && week ? ((day.downloads * 7) / (week.downloads || 1) - 1) * 100 : 0;
  console.log(
    `  ${pkg.padEnd(14)} day:${String(day?.downloads ?? 0).padStart(6)}  week:${String(week.downloads).padStart(6)}  month:${String(month?.downloads ?? 0).padStart(7)}  mom-trend:${trend >= 0 ? "+" : ""}${trend.toFixed(0)}%`
  );
}
console.log(`  ${"TOTAL".padEnd(14)} week: ${totalWeek}  ${bar(totalWeek, Math.max(totalWeek, 100))}`);

// ---- npm dependents (skip until core is published) ----
const corePublished = await j("https://api.npmjs.org/downloads/point/last-week/subwrench-core");
if (corePublished) {
  console.log("\n---- npm dependents ----");
  const d = await j(`https://registry.npmjs.org/-/v1/search?text=dependencies:subwrench-core&size=5`);
  console.log(`  subwrench-core: ${d?.total ?? 0} packages depend on it`);
}

// ---- GitHub ----
if (owner) {
  const repo = `${owner}/subkit`;
  const headers = ghToken ? { Authorization: `Bearer ${ghToken}` } : {};
  console.log("\n---- GitHub ----");
  const r = await j(`https://api.github.com/repos/${repo}`, headers);
  if (r) {
    console.log(`  stars:${r.stargazers_count}  forks:${r.forks_count}  watchers:${r.subscribers_count}  open-issues:${r.open_issues_count}`);
    if (ghToken) {
      const views = await j(`https://api.github.com/repos/${repo}/traffic/views`, headers);
      const clones = await j(`https://api.github.com/repos/${repo}/traffic/clones`, headers);
      if (views) console.log(`  14d views: ${views.count} (unique ${views.uniques})`);
      if (clones) console.log(`  14d clones: ${clones.count} (unique ${clones.uniques})`);
    } else {
      console.log(`  (set GITHUB_TOKEN for clone/visitor data)`);
    }
    // star history last 7 days via stargazers with Accept header
    const sg = await j(`https://api.github.com/repos/${repo}/stargazers?per_page=100`, { ...headers, Accept: "application/star+json" });
    if (Array.isArray(sg)) {
      const weekAgo = Date.now() - 7 * 864e5;
      const recent = sg.filter((s) => new Date(s.starred_at).getTime() > weekAgo).length;
      console.log(`  stars gained in last 7 days: ${recent}`);
    }
  } else {
    console.log("  repo not found / private");
  }
} else {
  console.log("\n---- GitHub ---- (pass --owner <name> or set GH_OWNER)");
}

// ---- bot stats (reads local sqlite if bot runs on this machine) ----
import fs from "node:fs";
const botDb = "data/bot-stats.db";
if (fs.existsSync(botDb)) {
  const { Database } = await import("sql.js");
  const SQL = await Database.initFs?.(botDb) ?? null;
  console.log("\n---- Telegram bot ----");
  try {
    const db = new SQL.Database(fs.readFileSync(botDb));
    const q = (sql) => {
      const res = db.exec(sql);
      return res[0]?.values?.[0]?.[0] ?? 0;
    };
    console.log(`  users: ${q("SELECT COUNT(DISTINCT user_id) FROM events")}`);
    console.log(`  dau(24h): ${q("SELECT COUNT(DISTINCT user_id) FROM events WHERE ts > datetime('now','-1 day')")}`);
    console.log(`  messages(7d): ${q("SELECT COUNT(*) FROM events WHERE ts > datetime('now','-7 days')")}`);
    console.log("  top commands:");
    const res = db.exec("SELECT cmd, COUNT(*) c FROM events GROUP BY cmd ORDER BY c DESC LIMIT 5");
    for (const row of res[0]?.values ?? []) console.log(`    ${row[0]}: ${row[1]}`);
  } catch (e) {
    console.log(`  (bot db read failed: ${e.message})`);
  }
} else {
  console.log("\n---- Telegram bot ---- (no local db; run stats on the bot server)");
}
