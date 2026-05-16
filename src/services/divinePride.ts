// Item / card name lookup, served from a static JSON bundled with the app
// instead of a live API call. The data file is mirrored from RagnaRecap's
// pre-scraped latamRO Divine Pride dump (~32k items, ~1.4 MB).
//
// In RO cards are themselves items, so the same table covers both equipment
// and the cards/enchants slotted into them.

const DB_URL = "/db/dp-item.json";

type DpItem = { name: string };
type Db = Map<number, DpItem>;

let dbPromise: Promise<Db> | null = null;

function loadDb(): Promise<Db> {
  if (!dbPromise) {
    dbPromise = fetch(DB_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status} loading ${DB_URL}`);
        return r.json();
      })
      .then((raw: Record<string, DpItem>) => {
        const map: Db = new Map();
        for (const k of Object.keys(raw)) {
          map.set(Number(k), raw[k]);
        }
        return map;
      })
      .catch((e) => {
        // Reset so the next call tries again instead of returning the cached
        // rejected promise forever.
        dbPromise = null;
        throw e;
      });
  }
  return dbPromise;
}

export type DivineItem = {
  id: number;
  name: string;
};

export async function getItem(id: number): Promise<DivineItem | null> {
  if (id <= 0) return null;
  try {
    const db = await loadDb();
    const entry = db.get(id);
    if (!entry) return null;
    return { id, name: entry.name };
  } catch (e) {
    console.error("[divinePride] loadDb failed:", e);
    return null;
  }
}

// Cards are items in RO, so they live in the same DB.
export const getCard = getItem;
