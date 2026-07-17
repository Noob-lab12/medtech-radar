// MedTech-Radar: holt alle Feeds aus sources.json, führt sie mit dem Archiv
// (data/items.json) zusammen, klassifiziert die Dokumentart und erzeugt das
// Dashboard public/index.html (Gruppierung nach Quelle, Filter nach Dokumentart).
import Parser from "rss-parser";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const DATA_FILE = path.join(ROOT, "data", "items.json");
const OUT_DIR = path.join(ROOT, "public");
const MAX_AGE_DAYS = 180; // Einträge älter als das fliegen aus dem Archiv

// ---------- Dokumentarten ----------
// Reihenfolge der Regeln = Priorität. Die Farben sind nur Punkt-Markierungen
// neben dem immer sichtbaren Text-Label (nie Farbe allein).
const TYPES = {
  sicherheit: { label: "Sicherheit & Recalls", dot: "#ef4444" },
  rechtsakt: { label: "Rechtsakt", dot: "#8b5cf6" },
  norm: { label: "Norm", dot: "#f59e0b" },
  guidance: { label: "Guidance & Leitfäden", dot: "#14b8a6" },
  event: { label: "Veranstaltung", dot: "#22c55e" },
  fachbeitrag: { label: "Fachbeitrag", dot: "#3b82f6" },
  news: { label: "News", dot: "#94a3b8" },
};

const TYPE_RULES = [
  ["sicherheit", /rote[- ]hand[- ]brief|recall|rückruf|feldkorrektur|sicherheitsinformation|risikoinformation|safety alert|safety communication|safety notice|medwatch|warnt vor|field safety/i],
  ["event", /webinar|training|conference|konferenz|registration|register now|discussion day|schulung|veranstaltung|recording available|save the date|workshop/i],
  ["guidance", /guidance|guideline|leitfaden|mdcg \d|position paper|positionspapier|q&a|questions and answers|manual on|checkliste|broschüre|merkblatt|patientenkarte|information für|decision tree|hilfestellung|factsheet|best practice/i],
  ["norm", /harmonised standard|harmonized standard|harmonisierte norm|\biso[ /]\d|\biec[ /]\d|\bdin en\b|\ben iso\b/i],
  ["rechtsakt", /implementing regulation|implementing decision|delegated act|delegated regulation|regulation \(eu\)|decision \(eu\)|directive \d|verordnung \(eu\)|richtlinie \d|amending|amendment of|durchführungsverordnung|delegierte verordnung|rechtsakt/i],
];

function classify(src, title, summary) {
  if (src.forceType) return src.forceType;
  const text = `${title} ${summary}`;
  for (const [type, re] of TYPE_RULES) {
    if (re.test(text)) return type;
  }
  return src.defaultType || "news";
}

// ---------- Feeds abrufen ----------
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
  return (feed.items || []).map((it) => {
    const title = stripHtml(it.title).slice(0, 300);
    const summary = stripHtml(it.contentSnippet || it.content || it.summary || "").slice(0, 400);
    return {
      id: `${src.id}::${it.link || it.guid || it.title}`,
      source: src.id,
      title,
      link: it.link || "",
      summary,
      published: it.isoDate || it.pubDate || null,
    };
  });
}

const archive = loadArchive();
const now = new Date().toISOString();
const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 3600 * 1000;
const status = [];

for (const src of sources) {
  try {
    const items = await fetchSource(src);
    let added = 0;
    for (const item of items) {
      if (!matchesFilter(item, src.filter)) continue;
      const t = Date.parse(item.published);
      if (!Number.isNaN(t) && t < cutoff) continue; // zu alt fürs Archiv
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
for (const [id, item] of Object.entries(archive.items)) {
  const t = Date.parse(item.published || item.firstSeen);
  if (!Number.isNaN(t) && t < cutoff) delete archive.items[id];
}

fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
fs.writeFileSync(DATA_FILE, JSON.stringify(archive, null, 1));

// ---------- Daten für die Seite aufbereiten ----------
const srcById = Object.fromEntries(sources.map((s) => [s.id, s]));
const itemList = Object.values(archive.items)
  .filter((it) => srcById[it.source]) // Quellen, die aus sources.json entfernt wurden, ausblenden
  .map((it) => {
    // Generische Titel wie "Medical devices" durch die aussagekräftige Beschreibung ersetzen
    const generic = /^medical devices?$/i.test(it.title.trim());
    const title = generic && it.summary ? it.summary.slice(0, 160) : it.title;
    return {
      ...it,
      title,
      type: classify(srcById[it.source], it.title, it.summary),
      sourceName: srcById[it.source].name,
      category: srcById[it.source].category,
    };
  })
  .sort((a, b) => (Date.parse(b.published || b.firstSeen) || 0) - (Date.parse(a.published || a.firstSeen) || 0));

const typeCounts = {};
for (const it of itemList) typeCounts[it.type] = (typeCounts[it.type] || 0) + 1;
console.log("\nDokumentarten:", Object.entries(typeCounts).map(([k, v]) => `${TYPES[k]?.label || k}: ${v}`).join(", "));

const categories = [...new Set(sources.map((s) => s.category))];
const sourcesMeta = sources.map(({ id, name, category }) => ({ id, name, category }));
const generatedAt = now;

// ---------- Dashboard erzeugen ----------
const html = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>MedTech-Radar</title>
<style>
  :root{--bg:#f4f6f8;--card:#fff;--text:#1a212b;--muted:#5c6773;--accent:#0b6bcb;--chip:#e8edf3;--border:#dde3ea;--new:#0a7d33}
  @media (prefers-color-scheme: dark){:root{--bg:#12161c;--card:#1a2029;--text:#e8ecf1;--muted:#98a4b3;--accent:#5aa4ee;--chip:#242c37;--border:#2c3540;--new:#4cc272}}
  *{box-sizing:border-box}
  body{margin:0;font:15px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:var(--bg);color:var(--text)}
  header{position:sticky;top:0;z-index:5;background:var(--bg);border-bottom:1px solid var(--border);padding:10px 16px}
  h1{font-size:1.1rem;margin:0 0 8px}
  h1 small{color:var(--muted);font-weight:400;font-size:.72rem;margin-left:8px}
  .controls{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
  .chip{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--border);background:var(--chip);color:var(--text);border-radius:999px;padding:4px 12px;font-size:.82rem;cursor:pointer}
  .chip.active{background:var(--accent);border-color:var(--accent);color:#fff}
  .chip .dot{width:8px;height:8px;border-radius:50%;flex:none}
  .chip .n{color:var(--muted);font-size:.75rem}
  .chip.active .n{color:#dce9f8}
  #q{flex:1;min-width:150px;padding:6px 10px;border:1px solid var(--border);border-radius:8px;background:var(--card);color:var(--text);font-size:.88rem}
  main{max-width:1100px;margin:0 auto;padding:14px 16px 60px}
  .tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:6px}
  .tile{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:10px 14px}
  .tile b{display:block;font-size:1.5rem;line-height:1.2}
  .tile span{font-size:.75rem;color:var(--muted)}
  h2{font-size:.8rem;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin:22px 0 8px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px;align-items:start}
  .card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:12px 14px}
  .card h3{margin:0 0 8px;font-size:.95rem;display:flex;align-items:center;justify-content:space-between;gap:8px}
  .card h3 .newpill{background:var(--new);color:#fff;border-radius:999px;font-size:.68rem;font-weight:600;padding:2px 8px;flex:none}
  .card ul{list-style:none;margin:0;padding:0}
  .card li{padding:7px 0;border-top:1px solid var(--border)}
  .card li a{color:var(--text);text-decoration:none;font-weight:500;font-size:.88rem;display:block}
  .card li a:hover{color:var(--accent)}
  .meta{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:3px;font-size:.72rem;color:var(--muted)}
  .meta .type{display:inline-flex;align-items:center;gap:5px}
  .meta .dot{width:7px;height:7px;border-radius:50%;flex:none}
  .meta .neu{color:var(--new);font-weight:700}
  .more{margin-top:8px;width:100%;border:1px solid var(--border);background:var(--chip);color:var(--muted);border-radius:8px;padding:6px;font-size:.8rem;cursor:pointer}
  .empty{text-align:center;color:var(--muted);margin:40px 0}
  footer{max-width:1100px;margin:0 auto;padding:0 16px 30px;font-size:.74rem;color:var(--muted)}
  details summary{cursor:pointer}
  .err{color:#c0392b}
</style>
</head>
<body>
<header>
  <h1>🩺 MedTech-Radar <small>Stand: <span id="stand"></span></small></h1>
  <div class="controls" id="typechips"></div>
  <div class="controls" style="margin-top:6px"><input id="q" type="search" placeholder="Suchen (z. B. MDR, 13485, EUDAMED) …"></div>
</header>
<main>
  <div class="tiles" id="tiles"></div>
  <div id="sections"></div>
</main>
<footer>
  <details><summary>Quellen-Status des letzten Laufs</summary><ul id="status"></ul></details>
</footer>
<script>
const ITEMS = ${JSON.stringify(itemList)};
const SOURCES = ${JSON.stringify(sourcesMeta)};
const CATS = ${JSON.stringify(categories)};
const TYPES = ${JSON.stringify(TYPES)};
const STATUS = ${JSON.stringify(status)};
const GENERATED = ${JSON.stringify(generatedAt)};
const COLLAPSED = 5; // Einträge pro Karte, bevor "mehr anzeigen" kommt

let activeType = "alle", query = "";
const expanded = new Set();

document.getElementById("stand").textContent = new Date(GENERATED).toLocaleString("de-DE",{dateStyle:"medium",timeStyle:"short"});

const stBox = document.getElementById("status");
STATUS.forEach(s => {
  const li = document.createElement("li");
  li.innerHTML = s.ok ? esc(s.name) + ": " + s.fetched + " Einträge, " + s.added + " neu"
                      : '<span class="err">' + esc(s.name) + ": FEHLER – " + esc(s.error) + "</span>";
  stBox.appendChild(li);
});

function esc(s){ const d = document.createElement("div"); d.textContent = s || ""; return d.innerHTML; }
function ts(it){ return Date.parse(it.published || it.firstSeen) || 0; }
function isNew(it){ return (Date.now() - Date.parse(it.firstSeen)) < 36*3600*1000; }
function fmtDate(it){
  return new Date(ts(it)).toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit",year:"2-digit"});
}
function matches(it){
  return (activeType === "alle" || it.type === activeType) &&
         (!query || (it.title + " " + it.summary + " " + it.sourceName).toLowerCase().includes(query));
}

// Filterleiste: Dokumentarten mit Anzahl
function renderChips(){
  const box = document.getElementById("typechips");
  box.innerHTML = "";
  const counts = {};
  ITEMS.forEach(it => counts[it.type] = (counts[it.type] || 0) + 1);
  const defs = [["alle", {label:"Alle", dot:null}], ...Object.entries(TYPES).filter(([k]) => counts[k])];
  for (const [key, def] of defs){
    const b = document.createElement("button");
    b.className = "chip" + (key === activeType ? " active" : "");
    b.innerHTML = (def.dot ? '<span class="dot" style="background:' + def.dot + '"></span>' : "") +
      esc(def.label) + ' <span class="n">' + (key === "alle" ? ITEMS.length : counts[key]) + "</span>";
    b.onclick = () => { activeType = key; render(); };
    box.appendChild(b);
  }
}

function renderTiles(items){
  const week = Date.now() - 7*24*3600*1000;
  const tiles = [
    [items.filter(isNew).length, "Neu"],
    [items.filter(it => ts(it) > week).length, "Letzte 7 Tage"],
    [items.length, "Meldungen gesamt"],
    [STATUS.filter(s => s.ok).length + " / " + STATUS.length, "Quellen aktiv"],
  ];
  document.getElementById("tiles").innerHTML =
    tiles.map(([n, l]) => '<div class="tile"><b>' + n + "</b><span>" + l + "</span></div>").join("");
}

function renderCard(src, items){
  const card = document.createElement("div");
  card.className = "card";
  const fresh = items.filter(isNew).length;
  const h = document.createElement("h3");
  h.innerHTML = esc(src.name) + (fresh ? '<span class="newpill">' + fresh + " neu</span>" : "");
  card.appendChild(h);
  const ul = document.createElement("ul");
  const isOpen = expanded.has(src.id);
  const shown = isOpen ? items : items.slice(0, COLLAPSED);
  for (const it of shown){
    const t = TYPES[it.type] || TYPES.news;
    const li = document.createElement("li");
    li.innerHTML = '<a href="' + it.link + '" target="_blank" rel="noopener">' + esc(it.title) + "</a>" +
      '<div class="meta"><span>' + fmtDate(it) + "</span>" +
      '<span class="type"><span class="dot" style="background:' + t.dot + '"></span>' + esc(t.label) + "</span>" +
      (isNew(it) ? '<span class="neu">NEU</span>' : "") + "</div>";
    ul.appendChild(li);
  }
  card.appendChild(ul);
  if (items.length > COLLAPSED){
    const btn = document.createElement("button");
    btn.className = "more";
    btn.textContent = isOpen ? "Weniger anzeigen" : "Alle " + items.length + " anzeigen";
    btn.onclick = () => { isOpen ? expanded.delete(src.id) : expanded.add(src.id); render(); };
    card.appendChild(btn);
  }
  return card;
}

function render(){
  renderChips();
  const visible = ITEMS.filter(matches);
  renderTiles(visible);
  const box = document.getElementById("sections");
  box.innerHTML = "";
  let any = false;
  for (const cat of CATS){
    const catSources = SOURCES.filter(s => s.category === cat);
    const grid = document.createElement("div");
    grid.className = "grid";
    for (const src of catSources){
      const items = visible.filter(it => it.source === src.id).sort((a, b) => ts(b) - ts(a));
      if (!items.length) continue;
      grid.appendChild(renderCard(src, items));
      any = true;
    }
    if (grid.children.length){
      const h = document.createElement("h2");
      h.textContent = cat;
      box.appendChild(h);
      box.appendChild(grid);
    }
  }
  if (!any) box.innerHTML = '<p class="empty">Keine Einträge gefunden.</p>';
}
document.getElementById("q").addEventListener("input", e => { query = e.target.value.toLowerCase(); render(); });
render();
</script>
</body>
</html>`;

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, "index.html"), html);

const failed = status.filter((s) => !s.ok).length;
console.log(`Fertig: ${itemList.length} Einträge im Archiv, ${failed} Quelle(n) mit Fehler.`);
