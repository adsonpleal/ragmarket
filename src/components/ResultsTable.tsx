import { useMemo, useState } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ShopRecord } from "../services/parser";
import { useCardNames, useItemNames } from "../hooks/useItemNames";

const ch = createColumnHelper<ShopRecord>();

function dpUrl(id: number): string {
  return `https://www.divine-pride.net/database/item/${id}?server=latamRO`;
}

function DpLink({ id, children }: { id: number; children: React.ReactNode }) {
  return (
    <a
      href={dpUrl(id)}
      className="dp-link"
      onClick={(e) => {
        e.preventDefault();
        openUrl(dpUrl(id)).catch((err) =>
          console.error("[DpLink] openUrl failed:", err),
        );
      }}
    >
      {children}
    </a>
  );
}

export default function ResultsTable({ records }: { records: ShopRecord[] }) {
  const itemIds = useMemo(() => records.map((r) => r.itemID), [records]);
  const cardIds = useMemo(
    () => records.flatMap((r) => r.cards.filter((c) => c > 0)),
    [records],
  );

  const itemNames = useItemNames(itemIds);
  const cardNames = useCardNames(cardIds);

  const columns = useMemo(
    () => [
      ch.accessor("itemID", {
        header: "Item",
        cell: (info) => {
          const id = info.getValue();
          const name = itemNames.get(`item:${id}`) ?? `Item ${id}`;
          return (
            <span>
              <DpLink id={id}>{name}</DpLink>
              <small className="muted"> #{id}</small>
            </span>
          );
        },
      }),
      ch.accessor("refine", {
        header: "Ref",
        cell: (info) => `+${info.getValue()}`,
        sortingFn: "basic",
      }),
      ch.accessor("price", {
        header: "Preço",
        cell: (info) => info.getValue().toLocaleString("pt-BR"),
        sortingFn: "basic",
      }),
      ch.accessor((r) => r.cards.filter((c) => c > 0), {
        id: "cards",
        header: "Cartas / Encantos",
        cell: (info) => {
          const cs = info.getValue();
          if (cs.length === 0) return <span className="muted">—</span>;
          return (
            <span>
              {cs.map((c, i) => {
                const name = cardNames.get(`card:${c}`) ?? `Carta ${c}`;
                return (
                  <span key={c}>
                    {i > 0 && ", "}
                    <DpLink id={c}>{name}</DpLink>
                  </span>
                );
              })}
            </span>
          );
        },
        enableSorting: false,
      }),
      ch.accessor((r) => r.options, {
        id: "options",
        header: "Opções Aleatórias",
        cell: (info) => {
          const opts = info.getValue();
          if (opts.length === 0) return <span className="muted">—</span>;
          return (
            <ul className="opt-list">
              {opts.map((o, i) => (
                <li key={i}>{o.text}</li>
              ))}
            </ul>
          );
        },
        enableSorting: false,
      }),
      ch.accessor("shopName", {
        header: "Loja",
        cell: (info) => {
          const v = info.getValue();
          if (!v) return <span className="muted">(sem título)</span>;
          return v;
        },
      }),
    ],
    [itemNames, cardNames],
  );

  const [sorting, setSorting] = useState<SortingState>([
    { id: "price", desc: false },
  ]);

  const table = useReactTable({
    data: records,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <table className="results">
      <thead>
        {table.getHeaderGroups().map((hg) => (
          <tr key={hg.id}>
            {hg.headers.map((h) => {
              const sorted = h.column.getIsSorted();
              const ariaSort: "ascending" | "descending" | "none" =
                sorted === "asc"
                  ? "ascending"
                  : sorted === "desc"
                    ? "descending"
                    : "none";
              return (
                <th
                  key={h.id}
                  scope="col"
                  aria-sort={ariaSort}
                  onClick={h.column.getToggleSortingHandler()}
                  style={{
                    cursor: h.column.getCanSort() ? "pointer" : "default",
                  }}
                >
                  {flexRender(h.column.columnDef.header, h.getContext())}
                  {{ asc: " ▲", desc: " ▼" }[sorted as string] ?? null}
                </th>
              );
            })}
          </tr>
        ))}
      </thead>
      <tbody>
        {table.getRowModel().rows.map((row) => (
          <tr key={row.id}>
            {row.getVisibleCells().map((cell) => (
              <td key={cell.id}>
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
