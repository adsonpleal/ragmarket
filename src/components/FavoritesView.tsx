import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { useFavorites } from "../hooks/useFavorites";
import { useItemNames } from "../hooks/useItemNames";
import { dpUrl, marketUrl, openExternal, Server } from "../lib/links";
import { fetchMarketExtremes } from "../lib/invoke";
import { SortableTable } from "./SortableTable";
import { starColumn } from "./itemColumns";

type Props = {
  server: Server;
};

type FetchStatus = "idle" | "loading" | "error";
type PriceState = {
  min: number | null;
  max: number | null;
  status: FetchStatus;
  error?: string;
};

type FavRow = {
  itemID: number;
  name: string;
  min: number | null;
  max: number | null;
  status: FetchStatus;
  error?: string;
};

const ch = createColumnHelper<FavRow>();

function priceCell(row: FavRow, value: number | null): ReactNode {
  if (row.status === "loading") return <span className="muted">⟳</span>;
  if (row.status === "error")
    return (
      <span className="muted" title={row.error}>
        ⚠
      </span>
    );
  if (value === null) return "—";
  return value.toLocaleString("pt-BR");
}

function externalLinkCell(href: string, label: string, title: string): ReactNode {
  return (
    <a
      href={href}
      className="ext-link small"
      onClick={(e) => {
        e.preventDefault();
        openExternal(href);
      }}
      title={title}
    >
      {label}
    </a>
  );
}

// Run `tasks` with at most `concurrency` in flight. Returns when all
// settle.
async function runPool<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number,
): Promise<void> {
  let cursor = 0;
  const workers: Promise<void>[] = [];
  for (let w = 0; w < Math.min(concurrency, tasks.length); w++) {
    workers.push(
      (async () => {
        while (true) {
          const i = cursor++;
          if (i >= tasks.length) return;
          try {
            await tasks[i]();
          } catch {
            // task is responsible for storing its own error state
          }
        }
      })(),
    );
  }
  await Promise.all(workers);
}

export function FavoritesView({ server }: Props) {
  const fav = useFavorites();
  const ids = useMemo(() => Array.from(fav.favorites), [fav.favorites]);
  const names = useItemNames(ids);

  const [prices, setPrices] = useState<Map<number, PriceState>>(new Map());
  const [refreshing, setRefreshing] = useState(false);
  const [addInput, setAddInput] = useState("");
  const [addFeedback, setAddFeedback] = useState<string | null>(null);
  const feedbackTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (feedbackTimer.current !== null) {
        window.clearTimeout(feedbackTimer.current);
      }
    };
  }, []);

  const sorted = useMemo(() => {
    return ids.slice().sort((a, b) => {
      const na = (names.get(`item:${a}`) ?? `Item ${a}`).toLocaleLowerCase("pt-BR");
      const nb = (names.get(`item:${b}`) ?? `Item ${b}`).toLocaleLowerCase("pt-BR");
      return na.localeCompare(nb, "pt-BR");
    });
  }, [ids, names]);

  const rows: FavRow[] = useMemo(() => {
    return sorted.map((id) => {
      const p = prices.get(id);
      return {
        itemID: id,
        name: names.get(`item:${id}`) ?? `Item ${id}`,
        min: p?.min ?? null,
        max: p?.max ?? null,
        status: p?.status ?? "idle",
        error: p?.error,
      };
    });
  }, [sorted, names, prices]);

  const setPrice = useCallback(
    (id: number, next: PriceState) => {
      setPrices((prev) => {
        const out = new Map(prev);
        out.set(id, next);
        return out;
      });
    },
    [],
  );

  const handleRefreshPrices = useCallback(async () => {
    if (refreshing || rows.length === 0) return;
    setRefreshing(true);
    // Seed every visible row as "loading" so the spinner shows up
    // immediately, regardless of which worker picks it up.
    setPrices((prev) => {
      const out = new Map(prev);
      for (const r of rows) {
        out.set(r.itemID, { min: null, max: null, status: "loading" });
      }
      return out;
    });

    const tasks = rows.map((r) => async () => {
      try {
        const res = await fetchMarketExtremes(r.itemID, r.name, server);
        setPrice(r.itemID, {
          min: res.min,
          max: res.max,
          status: "idle",
        });
      } catch (e) {
        setPrice(r.itemID, {
          min: null,
          max: null,
          status: "error",
          error: String(e),
        });
      }
    });

    await runPool(tasks, 4);
    setRefreshing(false);
  }, [refreshing, rows, server, setPrice]);

  const flashFeedback = (msg: string) => {
    setAddFeedback(msg);
    if (feedbackTimer.current !== null) {
      window.clearTimeout(feedbackTimer.current);
    }
    feedbackTimer.current = window.setTimeout(() => {
      setAddFeedback(null);
      feedbackTimer.current = null;
    }, 2500);
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = addInput.trim();
    const id = Number(trimmed);
    if (!trimmed || !Number.isInteger(id) || id <= 0) {
      flashFeedback("ID inválido");
      return;
    }
    if (fav.add(id)) {
      flashFeedback(`Adicionado #${id}`);
      setAddInput("");
    } else {
      flashFeedback(`#${id} já está nos favoritos`);
    }
  };

  const columns = useMemo(
    () => [
      starColumn<FavRow>({ isFavorite: fav.isFavorite, toggle: fav.toggle }),
      ch.accessor("name", {
        header: "Item",
        cell: (info) => {
          const r = info.row.original;
          return (
            <span>
              {r.name} <small className="muted">#{r.itemID}</small>
            </span>
          );
        },
      }),
      ch.accessor("min", {
        header: "Mín",
        sortingFn: "basic",
        sortUndefined: "last",
        cell: (info) => priceCell(info.row.original, info.row.original.min),
      }),
      ch.accessor("max", {
        header: "Máx",
        sortingFn: "basic",
        sortUndefined: "last",
        cell: (info) => priceCell(info.row.original, info.row.original.max),
      }),
      ch.display({
        id: "dp",
        header: "DP",
        cell: (info) =>
          externalLinkCell(dpUrl(info.row.original.itemID), "DP", "Abrir no Divine Pride"),
      }),
      ch.display({
        id: "market",
        header: "Mercado",
        cell: (info) =>
          externalLinkCell(
            marketUrl(info.row.original.name, server),
            "Mercado",
            "Buscar no Mercado (Catálogo de Vendas)",
          ),
      }),
    ],
    [fav.isFavorite, fav.toggle, server],
  );

  const addForm = (
    <form className="fav-add-form" onSubmit={handleAddSubmit}>
      <input
        type="text"
        inputMode="numeric"
        pattern="\d*"
        placeholder="ID do item"
        value={addInput}
        onChange={(e) => setAddInput(e.target.value)}
        aria-label="Adicionar favorito por ID"
      />
      <button type="submit">Adicionar</button>
      {addFeedback && <span className="fav-add-feedback muted">{addFeedback}</span>}
    </form>
  );

  if (ids.length === 0) {
    return (
      <div className="favorites-pane">
        <div className="results-header">
          <div className="results-header-left">
            <span>0 favoritos</span>
          </div>
          <div className="results-header-actions">{addForm}</div>
        </div>
        <div className="empty-state">
          <div className="empty-state-content">
            <h3>Sem favoritos</h3>
            <p>
              Clique na estrela ao lado de um item — seja no <strong>Catálogo</strong>{" "}
              ou em <strong>Meus Itens</strong> — para favoritar. Ou cole um{" "}
              <strong>ID</strong> no campo acima.
            </p>
            <p className="muted">
              Favoritos ficam salvos entre sessões. Use esta aba como uma lista
              rápida de busca para os itens que te interessam.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="favorites-pane">
      <div className="results-header">
        <div className="results-header-left">
          <span>{ids.length} favoritos</span>
        </div>
        <div className="results-header-actions">
          {addForm}
          <button
            type="button"
            onClick={handleRefreshPrices}
            disabled={refreshing}
            title="Buscar preço mínimo e máximo de cada favorito no Mercado"
          >
            {refreshing ? "Atualizando…" : "Atualizar preços"}
          </button>
        </div>
      </div>
      <div className="results-scroll">
        <SortableTable
          columns={columns}
          data={rows}
          initialSort={[{ id: "name", desc: false }]}
        />
      </div>
    </div>
  );
}
