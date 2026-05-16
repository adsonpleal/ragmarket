import { useMemo } from "react";
import { ShopRecord } from "../services/parser";
import { optionLabel } from "../services/randomOptions";
import { useCardNames, useItemNames } from "../hooks/useItemNames";

export type Filters = {
  refineMin: number;
  refineMax: number;
  /** Set of item IDs the user wants to include. Empty = no item filter (OR). */
  selectedItems: Set<number>;
  /** Set of card IDs (AND — all selected must be present on the row). */
  selectedCards: Set<number>;
  /** Per-option index, min/max value range (AND across all selected options). */
  selectedOptions: Map<number, { min: number; max: number }>;
};

export const EMPTY_FILTERS: Filters = {
  refineMin: 0,
  refineMax: 20,
  selectedItems: new Set(),
  selectedCards: new Set(),
  selectedOptions: new Map(),
};

type Props = {
  /** Records that pass the current filters. Used to narrow the card chip list. */
  records: ShopRecord[];
  /** All captured records, ignoring filters. Used so the random-option value
   * range stays stable as the user tightens their selection. */
  allRecords: ShopRecord[];
  filters: Filters;
  onChange: (f: Filters) => void;
};

export default function FilterSidebar({ records, allRecords, filters, onChange }: Props) {
  // Item chips list every unique itemID we've seen across the entire capture,
  // so a user searching multiple items can filter between them. Item filter is
  // OR (the row's item must be in the selected set).
  const itemsSeen = useMemo(() => {
    const m = new Map<number, number>();
    for (const r of allRecords) {
      m.set(r.itemID, (m.get(r.itemID) ?? 0) + 1);
    }
    for (const id of filters.selectedItems) {
      if (!m.has(id)) m.set(id, 0);
    }
    return m;
  }, [allRecords, filters.selectedItems]);
  const itemNames = useItemNames(Array.from(itemsSeen.keys()));

  // Card chips narrow with the current selection (built from filtered records).
  const cardsSeen = useMemo(() => {
    const cs = new Map<number, number>();
    for (const r of records) {
      for (const c of r.cards) {
        if (c > 0) cs.set(c, (cs.get(c) ?? 0) + 1);
      }
    }
    // Keep selected cards visible even if they no longer appear in filtered.
    for (const id of filters.selectedCards) {
      if (!cs.has(id)) cs.set(id, 0);
    }
    return cs;
  }, [records, filters.selectedCards]);

  // Option list narrows with the current selection (built from filtered records),
  // but the min/max value bounds always come from the full record set so the
  // range inputs stay usable even after the user tightens the range.
  const optionsAbsolute = useMemo(() => {
    const m = new Map<number, { min: number; max: number }>();
    for (const r of allRecords) {
      for (const o of r.options) {
        const cur = m.get(o.index) ?? { min: o.value, max: o.value };
        cur.min = Math.min(cur.min, o.value);
        cur.max = Math.max(cur.max, o.value);
        m.set(o.index, cur);
      }
    }
    return m;
  }, [allRecords]);

  const optionsSeen = useMemo(() => {
    const os = new Map<number, { min: number; max: number; count: number }>();
    for (const r of records) {
      for (const o of r.options) {
        const cur = os.get(o.index);
        if (cur) {
          cur.count += 1;
        } else {
          // Use absolute min/max for display bounds.
          const abs = optionsAbsolute.get(o.index) ?? { min: o.value, max: o.value };
          os.set(o.index, { min: abs.min, max: abs.max, count: 1 });
        }
      }
    }
    // Always show selected options so the user can deselect and adjust them.
    for (const [idx] of filters.selectedOptions) {
      if (!os.has(idx)) {
        const abs = optionsAbsolute.get(idx) ?? { min: 0, max: 0 };
        os.set(idx, { min: abs.min, max: abs.max, count: 0 });
      }
    }
    return os;
  }, [records, optionsAbsolute, filters.selectedOptions]);

  const cardIds = Array.from(cardsSeen.keys());
  const cardNames = useCardNames(cardIds);

  const updateRefine = (which: "min" | "max", v: number) => {
    onChange({
      ...filters,
      refineMin: which === "min" ? v : filters.refineMin,
      refineMax: which === "max" ? v : filters.refineMax,
    });
  };

  const toggleItem = (id: number) => {
    const next = new Set(filters.selectedItems);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange({ ...filters, selectedItems: next });
  };

  const toggleCard = (id: number) => {
    const next = new Set(filters.selectedCards);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange({ ...filters, selectedCards: next });
  };

  const toggleOption = (idx: number) => {
    const next = new Map(filters.selectedOptions);
    if (next.has(idx)) {
      next.delete(idx);
    } else {
      const seen = optionsSeen.get(idx)!;
      next.set(idx, { min: seen.min, max: seen.max });
    }
    onChange({ ...filters, selectedOptions: next });
  };

  const setOptionRange = (idx: number, which: "min" | "max", v: number) => {
    const cur = filters.selectedOptions.get(idx);
    if (!cur) return;
    const next = new Map(filters.selectedOptions);
    next.set(idx, {
      min: which === "min" ? v : cur.min,
      max: which === "max" ? v : cur.max,
    });
    onChange({ ...filters, selectedOptions: next });
  };

  const reset = () => onChange(EMPTY_FILTERS);

  return (
    <aside className="filter-sidebar">
      <section>
        <h3>Refino</h3>
        <div className="refine-row">
          <label>
            Mín&nbsp;
            <input
              type="number"
              min={0}
              max={20}
              value={filters.refineMin}
              onChange={(e) => updateRefine("min", Number(e.target.value))}
            />
          </label>
          <label>
            Máx&nbsp;
            <input
              type="number"
              min={0}
              max={20}
              value={filters.refineMax}
              onChange={(e) => updateRefine("max", Number(e.target.value))}
            />
          </label>
        </div>
      </section>

      <section>
        <h3>Itens ({itemsSeen.size})</h3>
        {itemsSeen.size === 0 && <p className="muted">Nenhum nos resultados</p>}
        <div className="chip-list">
          {Array.from(itemsSeen.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([id, count]) => {
              const name = itemNames.get(`item:${id}`) ?? `Item ${id}`;
              const selected = filters.selectedItems.has(id);
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={selected}
                  className={"chip" + (selected ? " selected" : "")}
                  onClick={() => toggleItem(id)}
                  title={`ID ${id} · ${count} resultado${count > 1 ? "s" : ""}`}
                >
                  {name} <span className="muted">×{count}</span>
                </button>
              );
            })}
        </div>
      </section>

      <section>
        <h3>Cartas / Encantos ({cardsSeen.size})</h3>
        {cardsSeen.size === 0 && <p className="muted">Nenhum nos resultados</p>}
        <div className="chip-list">
          {Array.from(cardsSeen.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([id, count]) => {
              const name = cardNames.get(`card:${id}`) ?? `Carta ${id}`;
              const selected = filters.selectedCards.has(id);
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={selected}
                  className={"chip" + (selected ? " selected" : "")}
                  onClick={() => toggleCard(id)}
                  title={`ID ${id} · ${count} resultado${count > 1 ? "s" : ""}`}
                >
                  {name} <span className="muted">×{count}</span>
                </button>
              );
            })}
        </div>
      </section>

      <section>
        <h3>Opções Aleatórias ({optionsSeen.size})</h3>
        {optionsSeen.size === 0 && <p className="muted">Nenhuma nos resultados</p>}
        <div className="option-list">
          {Array.from(optionsSeen.entries())
            .sort((a, b) => b[1].count - a[1].count)
            .map(([idx, info]) => {
              const selected = filters.selectedOptions.has(idx);
              const range = filters.selectedOptions.get(idx);
              return (
                <div key={idx} className="option-row">
                  <label className="option-toggle">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleOption(idx)}
                    />
                    <span>{optionLabel(idx)}</span>
                    <span className="muted">
                      ×{info.count} · {info.min}-{info.max}
                    </span>
                  </label>
                  {selected && range && (
                    <div className="range-inputs">
                      <input
                        type="number"
                        min={info.min}
                        max={info.max}
                        value={range.min}
                        onChange={(e) =>
                          setOptionRange(idx, "min", Number(e.target.value))
                        }
                      />
                      <span>—</span>
                      <input
                        type="number"
                        min={info.min}
                        max={info.max}
                        value={range.max}
                        onChange={(e) =>
                          setOptionRange(idx, "max", Number(e.target.value))
                        }
                      />
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </section>

      <button type="button" className="reset" onClick={reset}>
        Limpar filtros
      </button>
    </aside>
  );
}
