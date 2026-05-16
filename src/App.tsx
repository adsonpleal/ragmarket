import { useEffect, useMemo, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useCapture } from "./hooks/useCapture";
import FilterSidebar, { EMPTY_FILTERS, Filters } from "./components/FilterSidebar";
import ResultsTable from "./components/ResultsTable";

const STATUS_LABELS: Record<string, string> = {
  idle: "ocioso",
  recording: "gravando",
  stopped: "parado",
};

export default function App() {
  const cap = useCapture();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  // Reset filters whenever we go back to the idle screen.
  useEffect(() => {
    if (cap.status === "idle") {
      setFilters(EMPTY_FILTERS);
    }
  }, [cap.status]);

  const filtered = useMemo(() => {
    return cap.records.filter((r) => {
      if (r.refine < filters.refineMin || r.refine > filters.refineMax)
        return false;
      if (filters.selectedItems.size > 0 && !filters.selectedItems.has(r.itemID))
        return false;
      if (filters.selectedCards.size > 0) {
        for (const selected of filters.selectedCards) {
          if (!r.cards.includes(selected)) return false;
        }
      }
      if (filters.selectedOptions.size > 0) {
        for (const [idx, range] of filters.selectedOptions) {
          const opt = r.options.find((o) => o.index === idx);
          if (!opt) return false;
          if (opt.value < range.min || opt.value > range.max) return false;
        }
      }
      return true;
    });
  }, [cap.records, filters]);

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>Ragmarket</h1>
          <p className="subtitle">Visualizador do Catálogo de Vendas</p>
        </div>
        <div className="status-pill">{STATUS_LABELS[cap.status] ?? cap.status}</div>
      </header>

      <main className="app-main">
        {cap.error && <div className="error-banner">⚠ {cap.error}</div>}

        {cap.status === "idle" ? (
          <IdleScreen
            interfaces={cap.interfaces}
            selectedIp={cap.selectedIp}
            onSelect={cap.setSelectedIp}
            onStart={cap.start}
            onRefresh={cap.refreshInterfaces}
          />
        ) : (
          <FilterScreen
            status={cap.status}
            stats={cap.stats}
            pageCount={cap.pageCount}
            allRecords={cap.records}
            filtered={filtered}
            filters={filters}
            onFiltersChange={setFilters}
            onStop={cap.stop}
            onClear={() => {
              cap.clearRecords();
              setFilters(EMPTY_FILTERS);
            }}
            onReset={cap.reset}
          />
        )}
      </main>

      <Footer />
    </div>
  );
}

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="ext-link"
      onClick={(e) => {
        e.preventDefault();
        openUrl(href).catch((err) => console.error("[ExtLink] openUrl failed:", err));
      }}
    >
      {children}
    </a>
  );
}

function Footer() {
  return (
    <footer className="app-footer">
      <p>
        Veja também:{" "}
        <ExtLink href="https://ragcalc.web.app/">RagCalc</ExtLink>
        {" — calculadora de status · "}
        <ExtLink href="https://ragnarecap.web.app/">RagnaRecap</ExtLink>
        {" — análise de replays de Ragnarok Online."}
      </p>
      <p>
        Projeto open source. Sugestões e bugs no{" "}
        <ExtLink href="https://github.com/adsonpleal/ragmarket">GitHub</ExtLink>.
      </p>
    </footer>
  );
}

function IdleScreen(props: {
  interfaces: ReturnType<typeof useCapture>["interfaces"];
  selectedIp: string | null;
  onSelect: (ip: string) => void;
  onStart: () => void;
  onRefresh: () => void;
}) {
  return (
    <div className="screen idle">
      <h2>Pronto para gravar</h2>
      <p className="muted">Selecione a interface de rede para capturar.</p>
      <div className="nic-picker">
        <select
          value={props.selectedIp ?? ""}
          onChange={(e) => props.onSelect(e.target.value)}
        >
          <option value="" disabled>
            Selecione uma interface de rede…
          </option>
          {props.interfaces.map((i) => (
            <option key={i.index} value={i.ipv4}>
              {i.name} — {i.ipv4}
              {i.is_loopback ? " (loopback)" : ""}
            </option>
          ))}
        </select>
        <button onClick={props.onRefresh} title="Atualizar">
          ⟳
        </button>
      </div>
      <button
        className="primary"
        onClick={props.onStart}
        disabled={!props.selectedIp}
      >
        Iniciar Gravação
      </button>
      <p className="muted small">
        O Ragmarket precisa rodar como Administrador para acessar a rede. Se
        não foi iniciado com privilégios elevados, a gravação falhará com
        erro de permissão.
      </p>
    </div>
  );
}

function FilterScreen(props: {
  status: "recording" | "stopped";
  stats: { packets_seen: number; matched: number };
  pageCount: number;
  allRecords: ReturnType<typeof useCapture>["records"];
  filtered: ReturnType<typeof useCapture>["records"];
  filters: Filters;
  onFiltersChange: (f: Filters) => void;
  onStop: () => void;
  onClear: () => void;
  onReset: () => void;
}) {
  const isRecording = props.status === "recording";
  const hasRecords = props.allRecords.length > 0;

  return (
    <div className="filter-screen">
      <FilterSidebar
        records={props.filtered}
        allRecords={props.allRecords}
        filters={props.filters}
        onChange={props.onFiltersChange}
      />
      <div className="results-pane">
        <div className="results-header">
          <div className="results-header-left">
            <span>
              {props.filtered.length} de {props.allRecords.length} resultados
            </span>
            {isRecording && (
              <span className="recording-indicator">
                <span className="dot" /> gravando · {props.pageCount} págs · {props.stats.matched.toLocaleString("pt-BR")} pacotes
              </span>
            )}
          </div>
          <div className="results-header-actions">
            {isRecording && (
              <button onClick={props.onStop}>Parar Gravação</button>
            )}
            <button onClick={props.onClear} disabled={!hasRecords}>
              Limpar
            </button>
            <button onClick={props.onReset}>Nova Sessão</button>
          </div>
        </div>
        {hasRecords ? (
          props.filtered.length === 0 ? (
            <p className="muted">Nenhum resultado corresponde aos filtros atuais.</p>
          ) : (
            <div className="results-scroll">
              <ResultsTable records={props.filtered} />
            </div>
          )
        ) : (
          <div className="empty-state">
            <div className="empty-state-content">
              <h3>Aguardando resultados</h3>
              <p>
                Abra o <strong>Catálogo de Vendas</strong> dentro do jogo,
                faça suas buscas e navegue por todas as páginas dos resultados.
              </p>
              <p className="muted">
                Os itens vão aparecer aqui automaticamente conforme os pacotes
                chegam.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
