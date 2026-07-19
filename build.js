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
  ["rechtsakt", /implementing regulation|implementing decision|delegated act|delegated regulation|regulation \(eu\)|decision \(eu\)|directive \d|verordnung \(eu\)|richtlinie \d|amending|amendment of|durchführungsverordnung|delegierte verordnung|rechtsakt|final rule|proposed rule/i],
];

function classify(src, title, summary, typeHint) {
  if (src.forceType) return src.forceType;
  const text = `${title} ${summary}`;
  for (const [type, re] of TYPE_RULES) {
    if (re.test(text)) return type;
  }
  return typeHint || src.defaultType || "news";
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

async function fetchJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": "medtech-radar/1.0", Accept: "application/json" }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`Status code ${res.status}`);
  return res.json();
}

// openFDA-Enforcement: Geräte-Rückrufe als JSON (die klassischen FDA-RSS-Feeds sind abgeschaltet)
async function fetchOpenFda(src) {
  const data = await fetchJson(src.url);
  return (data.results || []).map((r) => {
    const d = r.report_date || ""; // Format JJJJMMTT
    return {
      id: `${src.id}::${r.recall_number || r.event_id}`,
      source: src.id,
      title: `${r.classification ? r.classification + ": " : ""}${stripHtml(r.product_description).slice(0, 220)}`,
      link: r.event_id ? `https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfRES/res.cfm?start_search=1&event_id=${r.event_id}` : "https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfRES/res.cfm",
      summary: stripHtml(`${r.recalling_firm || ""} – ${r.reason_for_recall || ""}`).slice(0, 400),
      published: d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : null,
    };
  });
}

// Federal Register: dort kündigt die FDA Guidances, Rules und Notices an
async function fetchFederalRegister(src) {
  const data = await fetchJson(src.url);
  return (data.results || []).map((r) => ({
    id: `${src.id}::${r.html_url}`,
    source: src.id,
    title: stripHtml(r.title).slice(0, 300),
    link: r.html_url,
    summary: stripHtml(r.abstract || "").slice(0, 400),
    published: r.publication_date || null,
    typeHint: r.type === "Rule" || r.type === "Proposed Rule" ? "rechtsakt" : undefined,
  }));
}

// RAPS Regulatory Focus hat keinen RSS-Feed mehr — Artikel direkt aus der Übersichtsseite lesen
async function fetchRaps(src) {
  const res = await fetch(src.url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36" },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Status code ${res.status}`);
  const html = await res.text();
  const items = [];
  for (const block of html.split(/<article[^>]*article-list-item/).slice(1)) {
    const linkM = block.match(/href="(https:\/\/www\.raps\.org\/resource\/[^"]+)"/);
    if (!linkM) continue;
    const link = linkM[1];
    // Titel: der erste Anker auf die Artikel-URL, der sichtbaren Text enthält (der Bild-Link ist leer)
    let title = "";
    const aRe = new RegExp(`<a[^>]+href="${link.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*>([\\s\\S]*?)</a>`, "g");
    let a;
    while ((a = aRe.exec(block))) {
      const text = stripHtml(a[1]);
      if (text) { title = text; break; }
    }
    if (!title) title = decodeURIComponent(link.split("/").pop().replace(/\.html$/, "").replace(/-/g, " "));
    const dateM = stripHtml(block).match(/\b(\d{1,2} [A-Z][a-z]{2} \d{4})\b/);
    const pM = block.match(/<p[^>]*>([\s\S]*?)<\/p>/);
    const published = dateM ? new Date(dateM[1] + " 12:00 UTC") : null;
    items.push({
      id: `${src.id}::${link}`,
      source: src.id,
      title: title.slice(0, 300),
      link,
      summary: pM ? stripHtml(pM[1]).slice(0, 400) : "",
      published: published && !Number.isNaN(published.getTime()) ? published.toISOString() : null,
    });
  }
  if (!items.length) throw new Error("Keine Artikel gefunden — Seitenstruktur hat sich vermutlich geändert");
  return items;
}

async function fetchSource(src) {
  if (src.kind === "openfda") return fetchOpenFda(src);
  if (src.kind === "federalregister") return fetchFederalRegister(src);
  if (src.kind === "raps") return fetchRaps(src);
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

// Abruf-Historie pro Quelle fortschreiben (für die Quellen-Übersicht auf der Seite)
archive.sourceStatus ||= {};
for (const st of status) {
  const prev = archive.sourceStatus[st.id] || {};
  archive.sourceStatus[st.id] = {
    lastAttempt: now,
    lastOk: st.ok ? now : prev.lastOk || null,
    lastNew: st.ok && st.added > 0 ? now : prev.lastNew || null,
    lastError: st.ok ? null : st.error,
    fetched: st.ok ? st.fetched : (prev.fetched ?? null),
  };
}
const activeIds = new Set(sources.map((s) => s.id));
for (const id of Object.keys(archive.sourceStatus)) {
  if (!activeIds.has(id)) delete archive.sourceStatus[id];
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
      type: classify(srcById[it.source], it.title, it.summary, it.typeHint),
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
const sourcesOverview = sources.map((s) => ({
  id: s.id, name: s.name, category: s.category, url: s.url,
  ...(archive.sourceStatus[s.id] || {}),
}));
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
  .err{color:#c0392b}
  .headrow{display:flex;justify-content:space-between;align-items:center;gap:8px}
  .overlay{position:fixed;inset:0;background:var(--bg);z-index:20;overflow:auto;padding:14px 16px 40px}
  .overlay .headrow{position:sticky;top:0;background:var(--bg);padding:4px 0 10px}
  .tablewrap{overflow-x:auto;background:var(--card);border:1px solid var(--border);border-radius:12px}
  .overlay table{border-collapse:collapse;width:100%;font-size:.84rem;min-width:640px}
  .overlay th,.overlay td{padding:8px 10px;border-bottom:1px solid var(--border);text-align:left;vertical-align:top}
  .overlay th{font-size:.72rem;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}
  .overlay td a{color:var(--accent);text-decoration:none}
  .st-ok{color:var(--new);font-weight:600}
  .st-fail{color:#c0392b;font-weight:600}
  .overlay .cat td{background:var(--chip);font-weight:600;font-size:.76rem;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}
</style>
</head>
<body>
<header>
  <div class="headrow">
    <h1>🩺 MedTech-Radar <small>Stand: <span id="stand"></span></small></h1>
    <button class="chip" id="srcbtn">📋 Quellen</button>
  </div>
  <div class="controls" id="catchips"></div>
  <div class="controls" style="margin-top:6px" id="typechips"></div>
  <div class="controls" style="margin-top:6px"><input id="q" type="search" placeholder="Suchen (z. B. MDR, 13485, EUDAMED) …"></div>
</header>
<main>
  <div class="tiles" id="tiles"></div>
  <div id="sections"></div>
</main>
<footer>Alle Quellen und ihr Abruf-Status: Knopf „📋 Quellen" oben rechts.</footer>
<div class="overlay" id="srcpanel" hidden>
  <div class="headrow">
    <h1>📋 Beobachtete Quellen</h1>
    <button class="chip" id="srcclose">✕ Schließen</button>
  </div>
  <div class="tablewrap"><table>
    <thead><tr><th>Quelle</th><th>Status</th><th>Letzter Abruf</th><th>Letzter Erfolg</th><th>Zuletzt Neues</th><th>Einträge im Feed</th></tr></thead>
    <tbody id="srcrows"></tbody>
  </table></div>
</div>
<script>
const ITEMS = ${JSON.stringify(itemList)};
const SOURCES = ${JSON.stringify(sourcesMeta)};
const CATS = ${JSON.stringify(categories)};
const TYPES = ${JSON.stringify(TYPES)};
const STATUS = ${JSON.stringify(status)};
const GENERATED = ${JSON.stringify(generatedAt)};
const COLLAPSED = 5; // Einträge pro Karte, bevor "mehr anzeigen" kommt

let activeType = "alle", activeCat = "alle", query = "";
const expanded = new Set();

document.getElementById("stand").textContent = new Date(GENERATED).toLocaleString("de-DE",{dateStyle:"medium",timeStyle:"short"});

// Quellen-Übersicht (Overlay)
const SRC_OVERVIEW = ${JSON.stringify(sourcesOverview)};
function fmtDT(iso){
  return iso ? new Date(iso).toLocaleString("de-DE",{dateStyle:"medium",timeStyle:"short"}) : "—";
}
function renderSources(){
  const tb = document.getElementById("srcrows");
  tb.innerHTML = "";
  let lastCat = "";
  for (const s of SRC_OVERVIEW){
    if (s.category !== lastCat){
      const tr = document.createElement("tr");
      tr.className = "cat";
      tr.innerHTML = '<td colspan="6">' + esc(s.category) + "</td>";
      tb.appendChild(tr);
      lastCat = s.category;
    }
    const ok = !s.lastError;
    const tr = document.createElement("tr");
    tr.innerHTML =
      '<td><a href="' + s.url + '" target="_blank" rel="noopener">' + esc(s.name) + "</a></td>" +
      '<td class="' + (ok ? "st-ok" : "st-fail") + '">' + (ok ? "✓ OK" : "✗ Fehler") +
        (ok ? "" : '<br><span style="font-weight:400;font-size:.76rem">' + esc(s.lastError) + "</span>") + "</td>" +
      "<td>" + fmtDT(s.lastAttempt) + "</td>" +
      "<td>" + fmtDT(s.lastOk) + "</td>" +
      "<td>" + fmtDT(s.lastNew) + "</td>" +
      "<td>" + (s.fetched ?? "—") + "</td>";
    tb.appendChild(tr);
  }
}
document.getElementById("srcbtn").onclick = () => { renderSources(); document.getElementById("srcpanel").hidden = false; };
document.getElementById("srcclose").onclick = () => { document.getElementById("srcpanel").hidden = true; };

function esc(s){ const d = document.createElement("div"); d.textContent = s || ""; return d.innerHTML; }
function ts(it){ return Date.parse(it.published || it.firstSeen) || 0; }
function isNew(it){ return (Date.now() - Date.parse(it.firstSeen)) < 36*3600*1000; }
function fmtDate(it){
  return new Date(ts(it)).toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit",year:"2-digit"});
}
function matchesQuery(it){
  return !query || (it.title + " " + it.summary + " " + it.sourceName).toLowerCase().includes(query);
}
function matchesType(it){ return activeType === "alle" || it.type === activeType; }
function matchesCat(it){ return activeCat === "alle" || it.category === activeCat; }
function matches(it){ return matchesType(it) && matchesCat(it) && matchesQuery(it); }

// Filterleisten: Region und Dokumentart, kombinierbar.
// Die Anzahl an jedem Chip berücksichtigt jeweils den anderen aktiven Filter.
function renderChips(){
  const catBox = document.getElementById("catchips");
  catBox.innerHTML = "";
  const catBase = ITEMS.filter(it => matchesType(it) && matchesQuery(it));
  for (const cat of ["alle", ...CATS]){
    const n = cat === "alle" ? catBase.length : catBase.filter(it => it.category === cat).length;
    const b = document.createElement("button");
    b.className = "chip" + (cat === activeCat ? " active" : "");
    b.innerHTML = esc(cat === "alle" ? "🌍 Alle Regionen" : cat) + ' <span class="n">' + n + "</span>";
    b.onclick = () => { activeCat = cat; render(); };
    catBox.appendChild(b);
  }

  const box = document.getElementById("typechips");
  box.innerHTML = "";
  const typeBase = ITEMS.filter(it => matchesCat(it) && matchesQuery(it));
  const counts = {};
  typeBase.forEach(it => counts[it.type] = (counts[it.type] || 0) + 1);
  const defs = [["alle", {label:"Alle Arten", dot:null}], ...Object.entries(TYPES)];
  for (const [key, def] of defs){
    const n = key === "alle" ? typeBase.length : (counts[key] || 0);
    if (key !== "alle" && !ITEMS.some(it => it.type === key)) continue;
    const b = document.createElement("button");
    b.className = "chip" + (key === activeType ? " active" : "");
    b.innerHTML = (def.dot ? '<span class="dot" style="background:' + def.dot + '"></span>' : "") +
      esc(def.label) + ' <span class="n">' + n + "</span>";
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
