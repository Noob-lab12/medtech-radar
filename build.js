// MedTech-Radar: holt alle Feeds aus sources.json, führt sie mit dem Archiv
// (data/items.json) zusammen und erzeugt die Übersichtsseite public/index.html.
import Parser from "rss-parser";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const DATA_FILE = path.join(ROOT, "data", "items.json");
const OUT_DIR = path.join(ROOT, "public");
const MAX_AGE_DAYS = 180; // Einträge älter als das fliegen aus dem Archiv

const parser = new Parser({
  timeout: 20000,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    Accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.8",
  },
});

const { sources } = JSON.parse(fs.readFileSync(path.join(ROOT, "sources.json"), "utf8"));

function loadArchive() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    return { items: {} };
  }
}

function stripHtml(s) {
  return (s || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function matchesFilter(item, filter) {
  if (!filter || filter.length === 0) return true;
  const haystack = `${item.title} ${item.summary}`.toLowerCase();
  return filter.some((kw) => haystack.includes(kw.toLowerCase()));
}

async function fetchSource(src) {
  const feed = await parser.parseURL(src.url);
  return (feed.items || []).map((it) => ({
    id: `${src.id}::${it.link || it.guid || it.title}`,
    source: src.id,
    sourceName: src.name,
    category: src.category,
    lang: src.lang,
    title: stripHtml(it.title).slice(0, 300),
    link: it.link || "",
    summary: stripHtml(it.contentSnippet || it.content || it.summary || "").slice(0, 400),
    published: it.isoDate || it.pubDate || null,
  }));
}

const archive = loadArchive();
const now = new Date().toISOString();
const status = [];

for (const src of sources) {
  try {
    const items = await fetchSource(src);
    let added = 0;
    for (const item of items) {
      if (!matchesFilter(item, src.filter)) continue;
      if (!archive.items[item.id]) {
        archive.items[item.id] = { ...item, firstSeen: now };
        added++;
      }
    }
    status.push({ id: src.id, name: src.name, ok: true, fetched: items.length, added });
    console.log(`OK   ${src.name}: ${items.length} Einträge, ${added} neu`);
  } catch (err) {
    status.push({ id: src.id, name: src.name, ok: false, error: String(err.message || err).slice(0, 200) });
    console.error(`FEHLER ${src.name}: ${err.message}`);
  }
}

// Alte Einträge entfernen
const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 3600 * 1000;
for (const [id, item] of Object.entries(archive.items)) {
  const t = Date.parse(item.published || item.firstSeen);
  if (!Number.isNaN(t) && t < cutoff) delete archive.items[id];
}

fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
fs.writeFileSync(DATA_FILE, JSON.stringify(archive, null, 1));

// ---------- Webseite erzeugen ----------
const itemList = Object.values(archive.items).sort((a, b) => {
  const ta = Date.parse(a.published || a.firstSeen) || 0;
  const tb = Date.parse(b.published || b.firstSeen) || 0;
  return tb - ta;
});

const categories = [...new Set(sources.map((s) => s.category))];
const sourcesMeta = sources.map(({ id, name, category }) => ({ id, name, category }));
const generatedAt = now;

const html = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>MedTech-Radar</title>
<style>
  :root{--bg:#f6f7f9;--card:#fff;--text:#1a212b;--muted:#5c6773;--accent:#0b6bcb;--chip:#e8edf3;--border:#dde3ea;--new:#0a7d33}
  @media (prefers-color-scheme: dark){:root{--bg:#12161c;--card:#1a2029;--text:#e8ecf1;--muted:#98a4b3;--accent:#5aa4ee;--chip:#242c37;--border:#2c3540;--new:#4cc272}}
  *{box-sizing:border-box}
  body{margin:0;font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:var(--bg);color:var(--text)}
  header{position:sticky;top:0;z-index:5;background:var(--bg);border-bottom:1px solid var(--border);padding:10px 14px}
  h1{font-size:1.15rem;margin:0 0 8px}
  h1 small{color:var(--muted);font-weight:400;font-size:.75rem;margin-left:8px}
  .controls{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
  .chip{border:1px solid var(--border);background:var(--chip);color:var(--text);border-radius:999px;padding:4px 12px;font-size:.85rem;cursor:pointer}
  .chip.active{background:var(--accent);border-color:var(--accent);color:#fff}
  #q{flex:1;min-width:140px;padding:6px 10px;border:1px solid var(--border);border-radius:8px;background:var(--card);color:var(--text);font-size:.9rem}
  main{max-width:860px;margin:0 auto;padding:12px 14px 60px}
  .day{margin:18px 0 6px;font-size:.8rem;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
  article{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:10px 12px;margin:8px 0}
  article a{color:var(--text);text-decoration:none;font-weight:600;display:block}
  article a:hover{color:var(--accent)}
  .meta{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:5px;font-size:.75rem;color:var(--muted)}
  .badge{background:var(--chip);border-radius:5px;padding:1px 7px}
  .badge.new{color:var(--new);font-weight:600}
  .summary{margin:6px 0 0;font-size:.85rem;color:var(--muted)}
  .empty{text-align:center;color:var(--muted);margin:40px 0}
  footer{max-width:860px;margin:0 auto;padding:0 14px 30px;font-size:.75rem;color:var(--muted)}
  details summary{cursor:pointer}
  .err{color:#c0392b}
</style>
</head>
<body>
<header>
  <h1>🩺 MedTech-Radar <small>Stand: <span id="stand"></span></small></h1>
  <div class="controls" id="cats"></div>
  <div class="controls" style="margin-top:6px"><input id="q" type="search" placeholder="Suchen (z. B. MDR, 13485, EUDAMED) …"></div>
</header>
<main id="list"></main>
<footer>
  <details><summary>Quellen-Status des letzten Laufs</summary><ul id="status"></ul></details>
</footer>
<script>
const ITEMS = ${JSON.stringify(itemList)};
const SOURCES = ${JSON.stringify(sourcesMeta)};
const STATUS = ${JSON.stringify(status)};
const GENERATED = ${JSON.stringify(generatedAt)};
const CATS = ["Alle", ...${JSON.stringify(categories)}];
let activeCat = "Alle", query = "";

document.getElementById("stand").textContent = new Date(GENERATED).toLocaleString("de-DE",{dateStyle:"medium",timeStyle:"short"});

const catBox = document.getElementById("cats");
CATS.forEach(c => {
  const b = document.createElement("button");
  b.className = "chip" + (c === activeCat ? " active" : "");
  b.textContent = c;
  b.onclick = () => { activeCat = c; render(); };
  catBox.appendChild(b);
});
document.getElementById("q").addEventListener("input", e => { query = e.target.value.toLowerCase(); render(); });

const stBox = document.getElementById("status");
STATUS.forEach(s => {
  const li = document.createElement("li");
  li.innerHTML = s.ok ? \`\${s.name}: \${s.fetched} Einträge, \${s.added} neu\` : \`<span class="err">\${s.name}: FEHLER – \${s.error}</span>\`;
  stBox.appendChild(li);
});

function fmtDay(iso){
  const d = new Date(iso);
  const today = new Date(); today.setHours(0,0,0,0);
  const that = new Date(d); that.setHours(0,0,0,0);
  const diff = Math.round((today - that) / 86400000);
  if (diff === 0) return "Heute";
  if (diff === 1) return "Gestern";
  return d.toLocaleDateString("de-DE",{weekday:"short",day:"2-digit",month:"long",year:"numeric"});
}

function isNew(it){
  return (Date.now() - Date.parse(it.firstSeen)) < 36*3600*1000;
}

function render(){
  const box = document.getElementById("list");
  box.innerHTML = "";
  document.querySelectorAll("#cats .chip").forEach(b => b.classList.toggle("active", b.textContent === activeCat));
  const items = ITEMS.filter(it =>
    (activeCat === "Alle" || it.category === activeCat) &&
    (!query || (it.title + " " + it.summary + " " + it.sourceName).toLowerCase().includes(query))
  );
  if (!items.length){ box.innerHTML = '<p class="empty">Keine Einträge gefunden.</p>'; return; }
  let lastDay = "";
  for (const it of items.slice(0, 400)){
    const day = fmtDay(it.published || it.firstSeen);
    if (day !== lastDay){
      const h = document.createElement("div"); h.className = "day"; h.textContent = day; box.appendChild(h); lastDay = day;
    }
    const a = document.createElement("article");
    a.innerHTML = \`<a href="\${it.link}" target="_blank" rel="noopener">\${esc(it.title)}</a>
      <div class="meta"><span class="badge">\${esc(it.sourceName)}</span><span>\${esc(it.category)}</span>\${isNew(it) ? '<span class="badge new">NEU</span>' : ''}</div>
      \${it.summary ? \`<p class="summary">\${esc(it.summary)}</p>\` : ""}\`;
    box.appendChild(a);
  }
}
function esc(s){ const d = document.createElement("div"); d.textContent = s || ""; return d.innerHTML; }
render();
</script>
</body>
</html>`;

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, "index.html"), html);

const failed = status.filter((s) => !s.ok).length;
console.log(`\nFertig: ${itemList.length} Einträge im Archiv, ${failed} Quelle(n) mit Fehler.`);
