#!/usr/bin/env node
// Crawls the divine-pride.net item list (paginated) and rewrites
// `public/db/dp-item.json`.
//
// USAGE (PowerShell):
//   $env:DP_ASPXAUTH="..."; $env:DP_ASPNET_SESSION="..."; node tools/scrape-dp-items.mjs
//
// Cookies come from devtools after logging into divine-pride.net manually:
// the .ASPXAUTH and ASP.NET_SessionId cookies on www.divine-pride.net.
// Both are required — the search endpoint redirects unauthenticated users.
//
// Output is written incrementally to public/db/dp-item.json.new and renamed
// only after the last page succeeds, so a crashed run never corrupts the
// shipped JSON.

import { readFile, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, "..");
const OUT_FINAL = join(REPO_ROOT, "public", "db", "dp-item.json");
const OUT_TMP = OUT_FINAL + ".new";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";

const ASPXAUTH = process.env.DP_ASPXAUTH;
const ASPNET = process.env.DP_ASPNET_SESSION;
const LANG = process.env.DP_LANG ?? "pt";

if (!ASPXAUTH || !ASPNET) {
  console.error(
    "Missing cookies. Set DP_ASPXAUTH and DP_ASPNET_SESSION env vars.\n" +
      "Grab them from devtools (Application → Cookies → www.divine-pride.net)\n" +
      "after logging into the site manually.",
  );
  process.exit(1);
}

const COOKIE = [
  `.ASPXAUTH=${ASPXAUTH}`,
  `ASP.NET_SessionId=${ASPNET}`,
  `lang=${LANG}`,
  "cookieconsent_status=dismiss",
].join("; ");

const BASE = "https://www.divine-pride.net/database/item";
const SEARCH_QS = "?Name=&Description=&function=&find=Busca";

async function fetchPage(pageNum) {
  // DP pagination uses `Page=N` (capital P) in its <a href> links.
  const sep = pageNum === 1 ? "" : `&Page=${pageNum}`;
  const url = BASE + SEARCH_QS + sep;
  const res = await fetch(url, {
    headers: {
      "user-agent": UA,
      accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      cookie: COOKIE,
      referer: BASE,
    },
    redirect: "manual",
  });
  if (res.status === 302 || res.status === 301) {
    throw new Error(
      `Redirected on page ${pageNum} (status ${res.status}). Cookies probably expired — re-grab them from devtools.`,
    );
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} on page ${pageNum}`);
  }
  return await res.text();
}

// Parses item rows from the list HTML.
// Match link-anchors like:
//   <a href="/database/item/590/">[PH] Item Name</a>
//   <a href="/database/item/501">Poção Vermelha</a>
//   <a href="/database/item/1173/aluguel-muramasa">[Aluguel] Muramasa</a>
// (DP appends a slug for items that have a real name — pages 25+ are
// almost entirely slugged.)
// Names are HTML-entity-escaped (`Po&#231;&#227;o`) so we decode those
// after extraction. "[PH] Item Name" rows are real entries on DP where
// no friendly name exists — we filter them out at merge time so they
// don't regress real names already in the bundled JSON.
const ITEM_RE = /<a[^>]*href="\/database\/item\/(\d+)[^"]*"[^>]*>([^<]+)<\/a>/g;

const NAMED_ENTITIES = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&nbsp;": " ",
};

function decodeEntities(s) {
  return s
    // Numeric decimal entities (most common on DP): &#231; → ç
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
    // Numeric hex entities
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&(?:amp|lt|gt|quot|nbsp);/g, (m) => NAMED_ENTITIES[m] ?? m);
}

function extractItems(html) {
  const out = new Map();
  for (const m of html.matchAll(ITEM_RE)) {
    const id = Number(m[1]);
    const name = decodeEntities(m[2]).trim();
    if (!id || !name) continue;
    // Same item can appear twice on a row (icon link + name link); prefer
    // the longer/non-placeholder text.
    const existing = out.get(id);
    if (!existing || name.length > existing.length) out.set(id, name);
  }
  return out;
}

// Pagination renders e.g.:
//   <a class="page-link" href="/database/item?find=Busca&amp;Page=2">2</a>
//   ...
//   <a class="page-link" href="/database/item?find=Busca&amp;Page=309">Last</a>
// The `&` between query params is HTML-entity-encoded as `&amp;`, so the
// char preceding `Page` in the raw HTML is `;` (not `&`). Match either.
function detectLastPage(html) {
  let max = 1;
  for (const m of html.matchAll(/(?:[?&;]|&amp;)[Pp]age=(\d+)/g)) {
    const n = Number(m[1]);
    if (n > max) max = n;
  }
  return max;
}

// Items the DP list page has no friendly name for are rendered with the
// literal placeholder "[PH] Item Name". We don't want those overwriting
// real names already present in the bundled JSON.
function isPlaceholderName(name) {
  return /^\[PH\]/i.test(name);
}

async function loadExisting() {
  try {
    const buf = await readFile(OUT_FINAL, "utf8");
    return JSON.parse(buf);
  } catch {
    return {};
  }
}

async function writeIncremental(merged) {
  // `merged` is a plain object keyed by id, ready to serialize.
  await writeFile(OUT_TMP, JSON.stringify(merged));
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Build the merged JSON object: start from the previous file, overlay
// every real name (non-placeholder) we just scraped. IDs the scraper
// didn't see are preserved — this is a merge, not a replace.
function mergeIntoPrevious(previous, scraped) {
  const merged = { ...previous };
  let realNamesWritten = 0;
  let placeholdersSkipped = 0;
  let newIds = 0;
  for (const [id, name] of scraped) {
    if (isPlaceholderName(name)) {
      // Add it if we don't have anything; otherwise leave the existing
      // (likely better) name alone.
      if (!merged[id]) {
        merged[id] = { name };
        newIds++;
      } else {
        placeholdersSkipped++;
      }
      continue;
    }
    if (!merged[id]) newIds++;
    merged[id] = { name };
    realNamesWritten++;
  }
  return { merged, realNamesWritten, placeholdersSkipped, newIds };
}

async function main() {
  console.log(`scrape-dp-items: lang=${LANG}, target=${OUT_FINAL}`);
  const previous = await loadExisting();
  const previousCount = Object.keys(previous).length;
  console.log(`existing dp-item.json has ${previousCount} entries`);

  console.log("fetching page 1 to determine page count...");
  const first = await fetchPage(1);
  const lastPage = detectLastPage(first);
  console.log(`last page detected: ${lastPage}`);
  if (lastPage > 5000) {
    throw new Error(`detected last page=${lastPage}, refusing — likely a parse bug`);
  }
  if (lastPage === 1) {
    console.warn(
      "WARNING: only one page detected. Either the catalog really is one page " +
        "now (unlikely) or pagination markup changed. Inspect the HTML before " +
        "trusting this run.",
    );
  }

  const scraped = new Map();
  for (const [id, name] of extractItems(first)) scraped.set(id, name);
  console.log(`page 1/${lastPage}: ${scraped.size} unique items so far`);

  for (let p = 2; p <= lastPage; p++) {
    await sleep(500);
    try {
      const html = await fetchPage(p);
      const found = extractItems(html);
      for (const [id, name] of found) scraped.set(id, name);
      console.log(
        `page ${p}/${lastPage}: +${found.size} (total ${scraped.size} unique)`,
      );
    } catch (e) {
      console.error(`page ${p} failed:`, e.message);
      console.error("aborting; partial output left at " + OUT_TMP);
      const { merged } = mergeIntoPrevious(previous, scraped);
      await writeIncremental(merged);
      process.exit(2);
    }
    if (p % 10 === 0) {
      const { merged } = mergeIntoPrevious(previous, scraped);
      await writeIncremental(merged);
    }
  }

  const { merged, realNamesWritten, placeholdersSkipped, newIds } =
    mergeIntoPrevious(previous, scraped);
  await writeIncremental(merged);
  if (!existsSync(OUT_TMP)) {
    throw new Error("temp file vanished?");
  }
  await rename(OUT_TMP, OUT_FINAL);

  const finalCount = Object.keys(merged).length;
  console.log(
    `done: wrote ${finalCount} items ` +
      `(was ${previousCount}, +${newIds} new ids, ` +
      `${realNamesWritten} real names written, ` +
      `${placeholdersSkipped} placeholders skipped over existing names)`,
  );
}

main().catch((e) => {
  console.error("scrape-dp-items failed:", e.stack ?? e.message);
  process.exit(1);
});
