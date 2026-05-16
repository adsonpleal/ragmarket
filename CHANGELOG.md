# Changelog

Todas as mudanças notáveis deste projeto serão documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/)
e o versionamento segue o [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [Unreleased]

## [0.1.0] - 2026-05-16

### Adicionado
- Captura de pacotes via WinDivert em modo sniff (somente leitura)
- Decodificação completa do `0x0836 search_store_info` do latamRO:
  - Nome da loja (latin-1), preço, refino, item, quantidade
  - 4 slots de cartas / encantos
  - Até 4 opções aleatórias (idx + valor + parâmetro)
- Banco estático de ~32 mil itens/cartas extraído do Divine Pride
- Lookup local de opções aleatórias a partir do `random_option_db` do rAthena
- Tela inicial com seletor de interface de rede
- Tela de catálogo ao vivo:
  - Resultados populam em tempo real conforme os pacotes chegam
  - Empty state com instruções para o jogador abrir o catálogo no jogo
  - Botões "Parar Gravação", "Limpar" e "Nova Sessão"
  - Indicador de gravação ativo com contagem de páginas e pacotes
- Barra lateral de filtros:
  - Faixa de refino (mín / máx)
  - Itens (OR — multi-seleção dos itens vistos na sessão)
  - Cartas / Encantos (AND — todas as selecionadas precisam estar no item)
  - Opções Aleatórias (AND, com faixa de valor por opção)
  - Listas se estreitam dinamicamente conforme as seleções
- Tabela de resultados ordenável (TanStack Table)
- Clique no nome do item / carta abre a página do Divine Pride no navegador
- Interface em pt-BR
- Footer com links para projetos relacionados (RagCalc, RagnaRecap) e GitHub
- Acessibilidade: `aria-pressed` nos chips de filtro e `scope="col"` + `aria-sort` nos cabeçalhos da tabela
- Workflow do GitHub Actions: build manual via `workflow_dispatch`, verifica
  coerência de versão (`package.json` ↔ `Cargo.toml` ↔ tag), gera
  `SHA256SUMS.txt`, ação `softprops/action-gh-release` pinada por SHA, cache
  do cargo com hash do toolchain incluído
- Bundle: instalador NSIS único (`ragmarket-vX.Y.Z-setup.exe`) que já inclui
  `WinDivert.dll` e `WinDivert64.sys`

### Robustez
- Race entre `WinDivertShutdown` (chamado pelo thread principal ao "Parar
  Gravação") e `WinDivertClose` (chamado pelo thread de captura na saída do
  loop) eliminada: o handle é serializado por um `Mutex<Option<usize>>`;
  `stop_capture` apenas sinaliza o shutdown para destravar o `recv`, e o
  `close` continua acontecendo na thread de captura, evitando double-close /
  use-after-free
- Listeners do Tauri não vazam mais em ciclos rápidos de stop→start: setup
  checa um flag `aborted` entre cada `await listen()` e desinscreve
  registros que aconteceram após a limpeza do efeito
- Guarda explícita contra `header_len > total_len` em pacotes IP malformados
- `Stop & Filter` faz flush das pendências antes de transicionar

### Performance
- Eventos `packet-bytes` são acumulados num buffer e despejados via
  `setRecords` a cada 100 ms, reduzindo re-renderizações do React durante
  capturas intensas
- `crate-type` da lib reduzido para `["rlib"]` — desktop não precisa de
  `staticlib`/`cdylib`; build de CI ~3× mais rápido

### Segurança
- `opener:allow-open-url` com escopo restrito a Divine Pride, RagCalc,
  RagnaRecap e GitHub (antes era irrestrito)

[Unreleased]: https://github.com/adsonpleal/ragmarket/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/adsonpleal/ragmarket/releases/tag/v0.1.0
