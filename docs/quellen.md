# Quellenliste — MedTech-Radar (Stand 2026-07-17)

Recherchierte und geprüfte Nachrichtenquellen für den Aggregator.
"Verifiziert = ja" heißt: Der Feed wurde am 17.07.2026 abgerufen und lieferte gültige, aktuelle Einträge.

## 1. EU (Kern)

| Quelle | Feed-/Seiten-URL | Sprache | Frequenz | Verifiziert |
|---|---|---|---|---|
| EU-Kommission Health – Medical Devices Latest Updates (deckt MDCG-Guidance, harmonisierte Normen, EUDAMED, Delegated Acts ab — beste EU-Einzelquelle) | `https://health.ec.europa.eu/node/12916/rss_en` | EN | ~wöchentlich–monatlich | ja |
| ↳ HTML-Fallback | `https://health.ec.europa.eu/medical-devices-sector/latest-updates_en` | EN | — | ja |
| MDCG Guidance Documents (Übersichtsseite, neue Dokumente erscheinen auch im obigen RSS) | `https://health.ec.europa.eu/medical-devices-sector/new-regulations/guidance-mdcg-endorsed-documents-and-other-guidance_en` | EN | — | ja (kein eigener Feed) |
| EUR-Lex – Amtsblatt L (einzelne Rechtsakte; clientseitig auf MDR/IVDR-Stichworte filtern: 2017/745, 2017/746, "medical device") | `https://eur-lex.europa.eu/EN/display-feed.rss?rssId=222` | EN | täglich | ja |
| Harmonisierte Normen Medizinprodukte (DG GROW Newsroom) | `https://ec.europa.eu/newsroom/growth/feed?tpa_id=30111` | EN | unregelmäßig | ja |
| ↳ Referenzseite | `https://single-market-economy.ec.europa.eu/single-market/european-standards/harmonised-standards/medical-devices_en` | EN | — | ja |
| DG SANTE Newsroom (alle Gesundheits-News inkl. Medical Devices) | `https://ec.europa.eu/newsroom/sante/feed` | EN | mehrmals/Woche | ja |
| EMA News (Bonus, überwiegend Arzneimittel) | `https://www.ema.europa.eu/en/news.xml` | EN | täglich | ja |
| Team-NB (Notified Bodies: Position Papers, Statements) | `https://www.team-nb.org/feed/` | EN | ~wöchentlich | ja |

## 2. Deutschland (Kern)

| Quelle | Feed-URL | Sprache | Frequenz | Verifiziert |
|---|---|---|---|---|
| BfArM Medizinprodukte (Risikoinfos, Empfehlungen) | `https://www.bfarm.de/SiteGlobals/Functions/RSSFeed/DE/Medizinprodukte/RSSNewsfeed.xml` | DE | unregelmäßig | ja |
| BfArM Pressemitteilungen | `https://www.bfarm.de/SiteGlobals/Functions/RSSFeed/DE/Pressemitteilungen/RSSNewsfeed.xml` | DE | ~monatlich | ja |
| BfArM Pharmakovigilanz (eher Arzneimittel, optional) | `https://www.bfarm.de/SiteGlobals/Functions/RSSFeed/DE/Pharmakovigilanz/RSSNewsfeed.xml` | DE | mehrmals/Monat | ja |
| BfArM Feldkorrekturmaßnahmen (nur HTML-Datenbank) | `https://www.bfarm.de/DE/Medizinprodukte/Aufgaben/Risikobewertung-und-Forschung/Massnahmen-von-Herstellern/_node.html` | DE | — | — |
| Johner Institut Blog | `https://www.johner-institut.de/blog/feed/` | DE | ~wöchentlich | ja |

Hinweis: Nur diese drei BfArM-Feeds existieren; EN-Varianten und weitere Kategorien sind 404.

## 3. USA (Kern) — Achtung: fda.gov blockiert Rechenzentrums-IPs

Die FDA-Feeds existieren laut offizieller FDA-Feedliste, konnten aber aus der Recherche-Umgebung nicht abgerufen werden (Bot-/IP-Block). Aus GitHub Actions heraus unbedingt testen; Browser-User-Agent senden, moderate Abruf-Frequenz. Stabilste Alternative für Recalls: openFDA-API.

| Quelle | Feed-URL | Frequenz | Verifiziert |
|---|---|---|---|
| FDA Medical Devices (CDRH) | `https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/medical-devices/rss.xml` | mehrmals/Woche | nein (IP-Block) |
| FDA MedWatch Safety Alerts | `https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/medwatch/rss.xml` | mehrmals/Woche | nein |
| FDA Recalls/Safety Alerts | `https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/recalls/rss.xml` | täglich | nein |
| FDA Press Releases | `https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/press-releases/rss.xml` | täglich | nein |
| CDRH "What's New" (HTML-Fallback) | `https://www.fda.gov/medical-devices/medical-devices-news-and-events/cdrh-new-news-and-updates` | wöchentlich | nein |
| Medical Device Recalls DB Feed | `https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfRES/res-rss.cfm` | täglich | nein |
| openFDA API (`/device/recall.json`, `/device/enforcement.json`) | `https://api.fda.gov/` | täglich | offizielle API, ungetestet |
| Federal Register – FDA-Dokumente (inkl. Guidance-Ankündigungen) | `https://www.federalregister.gov/agencies/food-and-drug-administration.rss` | täglich | nein (Bot-Challenge) |

## 4. Fachmedien (Kern)

| Quelle | Feed-URL | Sprache | Frequenz | Verifiziert |
|---|---|---|---|---|
| MedTech Dive | `https://www.medtechdive.com/feeds/news/` | EN | mehrmals täglich | ja (Topic-Feed `/feeds/topic/regulations/` existiert NICHT) |
| RAPS Regulatory Focus | Kein öffentlicher Feed mehr (historische URL 404). HTML: `https://www.raps.org/news-and-articles/news-articles`; Alternative: E-Mail "RF Today" | EN | täglich | — |

## 5. Zweite Ausbaustufe

| Quelle | Feed-/Seiten-URL | Sprache | Frequenz | Verifiziert |
|---|---|---|---|---|
| UK MHRA – gesamte Aktivität | `https://www.gov.uk/government/organisations/medicines-and-healthcare-products-regulatory-agency.atom` | EN | täglich | ja |
| UK MHRA – nur News/Comms | `https://www.gov.uk/search/news-and-communications.atom?organisations%5B%5D=medicines-and-healthcare-products-regulatory-agency` | EN | täglich | ja (gov.uk-Suchfeeds frei parametrisierbar; auch `https://www.gov.uk/drug-device-alerts.atom`, unverifiziert) |
| Swissmedic – "New on this website" (offizieller Feed via FetchRSS-Proxy — Fragilität einplanen) | `https://fetchrss.com/feed/X-CSwP0MWGVCaG_Z2JbPgiti.rss` | EN | wöchentlich | ja |
| Swissmedic – "Safety of medicines" | `https://fetchrss.com/feed/X-CSwP0MWGVCaCbucMe8csni.rss` | EN | — | nein |
| ↳ Swissmedic HTML-Fallback | `https://www.swissmedic.ch/swissmedic/en/home/medical-devices/overview-medical-devices.html` | EN/DE/FR/IT | — | ja |
| Health Canada – Medical Device Recalls/Alerts | `https://recalls-rappels.canada.ca/en/feed/medical-devices-alerts-recalls` | EN | täglich | ja |
| Health Canada – Health Products Recalls | `https://recalls-rappels.canada.ca/en/feed/health-products-alerts-recalls` | EN | täglich | nein |
| Health Canada – Dept. News Releases | `https://api.io.canada.ca/io-server/gc/news/en/v2?dept=departmentofhealth&type=newsreleases&format=atom` | EN | täglich | ja |
| TGA (AU) – Safety Alerts | `https://www.tga.gov.au/feeds/alert/safety-alerts.xml` | EN | täglich | nein (Host aus Recherche-Umgebung unerreichbar; URL von offizieller TGA-RSS-Seite) |
| TGA – Market Actions / alle Alerts | `https://www.tga.gov.au/feeds/alert/market-actions.xml`, `https://www.tga.gov.au/feeds/alert.xml` | EN | täglich | nein |
| PMDA (JP) – Top All (EN-Feed) | `https://www.pmda.go.jp/rss_008.xml` | EN | täglich | ja |
| ↳ PMDA HTML-Fallback | `https://www.pmda.go.jp/english/0006.html` | EN | — | — |
| NMPA (CN) – kein Feed, HTML gut scrapebar | `https://english.nmpa.gov.cn/news.html`, `https://english.nmpa.gov.cn/medicaldevices.html` | EN | ~wöchentlich | — |
| ANVISA (BR) – Notícias | `https://www.gov.br/anvisa/pt-br/assuntos/noticias-anvisa/RSS` | PT | täglich | ja (Plone: `/RSS` evtl. auch auf Unterbereichen wie `…/produtosparasaude/RSS`) |
| IMDRF – Documents | `https://www.imdrf.org/documents.xml` | EN | monatlich | nein (Host unerreichbar; URL von offizieller Seite `imdrf.org/rss-feeds`) |
| IMDRF – News / Consultations | `https://www.imdrf.org/news-events/news.xml`, `https://www.imdrf.org/consultations.xml` | EN | monatlich | nein |
| ISO/TC 210 – kein Feed | `https://www.iso.org/committee/54892.html` (nur Scraping/Diff) | EN | selten | — |

## Architektur-Erkenntnisse

1. Beste EU-Einzelquelle: `health.ec.europa.eu/node/12916/rss_en` (MDCG, harmonisierte Normen, EUDAMED in einem).
2. FDA-Feeds sind IP-gated: Browser-User-Agent, moderate Frequenz, openFDA-API als stabile Alternative für Recalls; aus GitHub Actions gegentesten.
3. RAPS hat seinen RSS-Feed eingestellt — nur Scraping oder Newsletter.
4. Swissmedic proxied offizielle Feeds über fetchrss.com — funktioniert, aber fragil.
5. gov.uk-Atom-Feeds sind frei parametrisierbar — sehr aggregatorfreundlich.
6. TGA/IMDRF aus Produktionsumgebung (GitHub Actions) nochmals gegentesten (in Recherche-Umgebung Netzwerk-/Geo-Block).
