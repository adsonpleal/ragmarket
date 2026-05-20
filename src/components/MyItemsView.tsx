import { useMemo, useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import {
  ALL_INV_TYPES,
  InventoryItem,
  InvType,
  invTypeLabel,
} from "../services/inventoryParser";
import { useCardNames, useItemNames } from "../hooks/useItemNames";
import { useFavorites } from "../hooks/useFavorites";
import { Server } from "../lib/links";
import { ItemLinks } from "./ItemLinks";
import { SortableTable } from "./SortableTable";
import { cardsColumn, optionsColumn, starColumn } from "./itemColumns";
import type { InventorySnapshots } from "../hooks/useCapture";
import { downloadCsv, toCsv } from "../lib/csv";

const ch = createColumnHelper<InventoryItem>();

type Props = {
  inventory: InventorySnapshots;
  server: Server;
};

export function MyItemsView({ inventory, server }: Props) {
  const [sources, setSources] = useState<Set<InvType>>(
    () => new Set(ALL_INV_TYPES),
  );

  const allItems = useMemo(() => {
    const out: InventoryItem[] = [];
    for (const t of ALL_INV_TYPES) {
      for (const it of inventory[t]) out.push(it);
    }
    return out;
  }, [inventory]);

  const sourceCounts = useMemo(() => {
    const m = new Map<InvType, number>();
    for (const t of ALL_INV_TYPES) m.set(t, inventory[t].length);
    return m;
  }, [inventory]);

  const filtered = useMemo(
    () => allItems.filter((it) => sources.has(it.source)),
    [allItems, sources],
  );

  const itemIds = useMemo(() => filtered.map((r) => r.itemID), [filtered]);
  const itemNames = useItemNames(itemIds);
  const cardIds = useMemo(
    () => filtered.flatMap((r) => r.cards.filter((c) => c > 0)),
    [filtered],
  );
  const cardNames = useCardNames(cardIds);
  const { isFavorite, toggle } = useFavorites();

  const toggleSource = (t: InvType) => {
    const next = new Set(sources);
    if (next.has(t)) next.delete(t);
    else next.add(t);
    setSources(next);
  };

  const columns = useMemo(
    () => [
      starColumn<InventoryItem>({ isFavorite, toggle }),
      ch.accessor("itemID", {
        header: "Item",
        cell: (info) => {
          const id = info.getValue();
          const name = itemNames.get(`item:${id}`) ?? `Item ${id}`;
          return (
            <div className="item-cell">
              <span>
                {name} <small className="muted">#{id}</small>
              </span>
              <ItemLinks itemID={id} itemName={name} server={server} />
            </div>
          );
        },
      }),
      ch.accessor("amount", {
        header: "Qtd",
        cell: (info) => info.getValue().toLocaleString("pt-BR"),
        sortingFn: "basic",
      }),
      ch.accessor("refine", {
        header: "Ref",
        cell: (info) => {
          if (!info.row.original.isEquipKind) return <span className="muted">—</span>;
          return `+${info.getValue()}`;
        },
        sortingFn: "basic",
      }),
      cardsColumn<InventoryItem>(
        "cards",
        "Cartas",
        (r) => r.cards,
        cardNames,
        (_id, name) => name,
      ),
      optionsColumn<InventoryItem>("options", (r) => r.options, "Opções"),
      ch.accessor("source", {
        header: "Fonte",
        cell: (info) => invTypeLabel(info.getValue()),
      }),
    ],
    [itemNames, cardNames, isFavorite, toggle, server],
  );

  const totalCount = allItems.length;

  const handleExportCsv = () => {
    const rows = filtered.map((it) => {
      const name = itemNames.get(`item:${it.itemID}`) ?? `Item ${it.itemID}`;
      const cardsText = it.cards
        .filter((c) => c > 0)
        .map((c) => cardNames.get(`card:${c}`) ?? `Carta ${c}`)
        .join("; ");
      const opcoesText = it.options.map((o) => o.text).join("; ");
      return {
        id: it.itemID,
        nome: name,
        qtd: it.amount,
        refino: it.isEquipKind ? it.refine : "",
        cartas: cardsText,
        opcoes: opcoesText,
        fonte: invTypeLabel(it.source),
      };
    });
    const csv = toCsv(rows, [
      "id",
      "nome",
      "qtd",
      "refino",
      "cartas",
      "opcoes",
      "fonte",
    ]);
    const d = new Date();
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    void downloadCsv(`meus-itens-${stamp}.csv`, csv);
  };

  return (
    <div className="filter-screen">
      <aside className="filter-sidebar">
        <section>
          <h3>Fonte</h3>
          <div className="chip-list">
            {ALL_INV_TYPES.map((t) => {
              const count = sourceCounts.get(t) ?? 0;
              const selected = sources.has(t);
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={selected}
                  className={"chip" + (selected ? " selected" : "")}
                  onClick={() => toggleSource(t)}
                  title={`${count} item${count === 1 ? "" : "s"}`}
                >
                  {invTypeLabel(t)} <span className="muted">×{count}</span>
                </button>
              );
            })}
          </div>
        </section>
      </aside>

      <div className="results-pane">
        <div className="results-header">
          <div className="results-header-left">
            <span>
              {filtered.length} de {totalCount} itens
            </span>
          </div>
          <div className="results-header-actions">
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={filtered.length === 0}
              title="Exportar a lista visível como CSV"
            >
              Exportar CSV
            </button>
          </div>
        </div>
        {totalCount === 0 ? (
          <div className="results-scroll">
            <div className="empty-state">
              <div className="empty-state-content">
                <h3>Nenhum item capturado ainda</h3>
                <p>
                  Com a captura <strong>rodando</strong>, basta:
                </p>
                <ul className="empty-list">
                  <li>
                    <strong>Inventário</strong> e <strong>Carrinho</strong> —
                    aparecem sozinhos assim que você seleciona o personagem.
                  </li>
                  <li>
                    <strong>Armazém Kafra</strong> e <strong>Armazém do Clã</strong>{" "}
                    — abra cada um uma vez, falando com o NPC dentro do jogo.
                  </li>
                </ul>
                <p className="muted">
                  Os itens vão aparecer aqui automaticamente conforme o
                  servidor envia as listas.
                </p>
              </div>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <p className="muted">Nenhum item corresponde à fonte selecionada.</p>
        ) : (
          <div className="results-scroll">
            <SortableTable
              columns={columns}
              data={filtered}
              initialSort={[{ id: "source", desc: false }]}
            />
          </div>
        )}
      </div>
    </div>
  );
}
