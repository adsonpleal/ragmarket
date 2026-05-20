# Changelog

Todas as mudanças notáveis deste projeto serão documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/)
e o versionamento segue o [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [Unreleased]

## [0.4.0] - 2026-05-20

### Adicionado
- **Adicionar favorito por ID**: campo de texto + botão "Adicionar" no
  cabeçalho da aba **Favoritos**. IDs ainda não vistos na captura
  funcionam — caem no fallback "Item NNNN" do `useItemNames` se não
  estiverem no banco estático. Mensagem inline informa quando o ID
  é inválido ou já está nos favoritos.
- **Atualizar preços** em Favoritos: botão que dispara uma busca no
  Catálogo de Vendas do gnjoylatam por cada favorito e mostra **Mín**
  e **Máx** em duas novas colunas. Implementado num novo comando Rust
  `fetch_market_extremes` que faz duas requisições em paralelo
  (`sortType=LOW_PRICE` e `HIGH_PRICE`) via `tokio::join!`, extrai o
  primeiro `itemPrice` correspondente ao `itemId` do payload RSC do
  Next.js da página e filtra por ID (a busca do gnjoylatam é por
  substring do nome). Concorrência limitada a 4 fetches simultâneos
  no frontend.
- **Exportar Meus Itens em CSV**: botão **Exportar CSV** na aba
  **Meus Itens** abre um diálogo nativo de "Salvar como…" (via
  `tauri-plugin-dialog`) e grava as colunas `id`, `nome`, `qtd`,
  `refino`, `cartas`, `opcoes`, `fonte` da lista filtrada. Helper
  novo em `src/lib/csv.ts` (escapa vírgula/aspas/quebra de linha,
  CRLF, BOM UTF-8 para o Excel reconhecer acentos).
- Script `tools/scrape-dp-items.mjs` para refrescar
  `public/db/dp-item.json` contra a lista paginada de itens do
  divine-pride.net. Cookies via env vars `DP_ASPXAUTH` e
  `DP_ASPNET_SESSION`; throttle de 500 ms entre páginas; merge sobre
  o JSON existente preservando nomes reais já presentes quando a
  fonte responde com placeholder `[PH] Item Name`.

### Alterado
- **Aba Favoritos** migrada de lista (`<ul>`) para `<SortableTable>` —
  consistente com Catálogo e Meus Itens. Colunas: ⭐, Item, Mín, Máx,
  DP, Mercado. Os links **DP** e **Mercado** ficam em colunas próprias
  em vez de empilhados sob o nome do item.
- Banco estático `public/db/dp-item.json` refrescado contra o
  divine-pride.net: 31.926 → 32.810 entradas (+884 novos IDs,
  ~29 mil nomes reescritos). Itens recentes que antes apareciam como
  "Item NNNN" / "Carta NNNN" no app agora têm nome legível.

### Performance
- `useFavorites` agora memoiza o `Set` derivado da lista persistida.
  Antes era `new Set(list)` em cada chamada do hook (várias por
  render entre App, FavoritesView e MyItemsView), fazendo qualquer
  `useMemo`/`useCallback` que dependesse de `fav.favorites`
  recomputar sem motivo.
- O comando `fetch_market_extremes` reusa um único `reqwest::Client`
  e um `Regex` compilado, guardados em `OnceLock<...>`. Antes ambos
  eram reconstruídos em cada chamada, descartando o pool de
  conexões TLS do reqwest.

## [0.3.0] - 2026-05-19

### Adicionado
- **Aba "Meus Itens"**: lista o que o jogador possui no inventário,
  carrinho, armazém Kafra e armazém do clã. Os dados vêm dos pacotes
  V6 unificados que o servidor já envia (`0x0B08` START, `0x0B09`
  NORMAL, `0x0B0A` EQUIP, `0x0B0B` END) — o invType de cada pacote
  identifica o contêiner. Inventário e carrinho aparecem
  automaticamente ao selecionar o personagem; Kafra e clã exigem
  abrir o NPC uma vez. Filtro por fonte (chips Inventário /
  Carrinho / Armazém Kafra / Clã).
- **Aba "Favoritos"**: marque qualquer item com ⭐ no catálogo ou em
  Meus Itens e ele aparece aqui. Persiste em `localStorage` (chave
  `ragmarket.favorites`) e sincroniza em tempo real entre todas as
  abas que mostram itens.
- **Picker de servidor** no cabeçalho (Freya / Nidhogg, default
  Freya). O valor escolhido é usado nos novos links de **Mercado**
  ao lado de cada item, que abrem a busca do
  [Catálogo de Vendas do gnjoylatam](https://ro.gnjoylatam.com/pt/intro/shop-search/trading)
  já com `storeType=BUY`, `sortType=LOW_PRICE` e o nome do item
  pré-preenchido.
- Decoder do registro `EQUIPITEM_INFO` (67 bytes na variante sem
  grade, 68 com grade) e do `NORMALITEM_INFO` (34 bytes),
  reverse-engineered contra capturas reais do latamRO.
- Botão ⭐ Favoritar como primeira coluna da tabela do catálogo,
  ao lado do nome de cada item.

### Alterado
- Controles globais da sessão (**Parar Gravação** / **Limpar** /
  **Nova Sessão**) migraram da aba Catálogo para uma barra de ações
  global compartilhada por todas as abas — aparece junto das abas no
  topo e funciona independente de qual aba está aberta.
- O empty-state de "Nova Sessão" no Catálogo mantém o mesmo conteúdo,
  mas agora vive dentro de um contêiner com rolagem (consistente com
  Meus Itens e Favoritos).
- Tabela do catálogo refatorada para usar um componente compartilhado
  `<SortableTable>` + factories de coluna (`starColumn`, `cardsColumn`,
  `optionsColumn`) também usados por Meus Itens. Nenhuma mudança de
  comportamento.

### Performance
- Atualizações de inventário passam pelo mesmo flush em lote a cada
  100 ms que já protegia o catálogo, evitando re-render por pacote
  em rajadas de despejo de contêiner.

### Robustez
- O walker de pacotes ganhou estado por stream (`WalkerState`):
  eventos de items/end só são aceitos depois de um START
  correspondente. Sem isso, sequências aleatórias `0a 0b xx yy ii`
  em outros pacotes eram interpretadas como itens fantasmas.
- Validação de `invType ∈ {0,1,2,3}` em todos os decodificadores;
  combinada com o gate acima, elimina toda categoria de spurious
  match em dados aleatórios.
- Peek do `invType` **antes** do check `length > buffer.length`
  no walker — sem isso, um match espúrio cujo "length" excede o
  buffer travava o walker indefinidamente esperando bytes que nunca
  chegariam em forma reconhecível.
- Limite de tamanho realista por pacote (16 KB) e por START
  (64 bytes), descartando matches espúrios com length implausível
  em vez de "aguardar mais dados".
- Layout do `EQUIP` corrigido contra captura real do latamRO: 67
  bytes na variante 0x0B0A (sem o byte de Flag final), 68 com
  grade. Antes assumíamos 68/69 (especificação rAthena master) e
  toda lista de equip era rejeitada.
- Layout do `ZC_INVENTORY_END` corrigido: 4 bytes (`u16 op,
  u8 invType, u8 result`), sem campo de length. A suposição
  anterior de 6 bytes consumia 2 bytes do pacote seguinte.



### Adicionado
- **Filtro por PID** na tela inicial: a aplicação varre a tabela TCP do
  Windows e lista todos os `Ragexe.exe` conectados às portas do servidor
  (6900, 6951, 4500, 22000–22100). Escolha um cliente e só os pacotes
  daquele PID aparecem nos resultados. Deixe em branco para capturar tudo,
  como antes.
- **Banner de nova versão**: na inicialização, o app consulta a release
  mais recente no GitHub e mostra um banner clicável quando há atualização.
  Dispensa-se por versão (lembrado no `localStorage`); só reaparece quando
  algo ainda mais novo é publicado.

### Corrigido
- O driver de kernel do WinDivert (`WinDivert64.sys`), carregado por
  sessões anteriores, segurava o arquivo e fazia qualquer rebuild
  subsequente falhar com `ERROR_SHARING_VIOLATION`. Agora o `build.rs`
  coloca os binários do WinDivert no `target/<profile>/` ele mesmo, com
  fallback de "manter o que já existe" quando o arquivo está travado, e
  `npm run tauri` é wrappeado para anular `bundle.resources` apenas em
  `dev` (instalador continua intacto).
- Várias instâncias do Ragmarket podem rodar em paralelo agora — útil
  com multi-cliente, e cada uma pode filtrar um PID diferente.

### Alterado
- Servidor de dev do Vite migrado da porta 1420 para a **1422** (e HMR
  de 1421 → 1423), evitando colisão com o
  [raglens](https://github.com/adsonpleal/raglens), que ocupa a 1420.

### Performance
- Loop de captura agora faz snapshot do filtro no início da sessão e
  pula `observe`/`is_followed` (e seus mutexes) completamente quando
  nenhum PID está selecionado — o caminho comum "seguir todos".
- Cache por PID do `process_info` (nome do executável + horário de
  início) evita 3 syscalls Win32 por cliente conhecido a cada poll de
  descoberta (a cada 2 s na tela inicial).

## [0.1.1] - 2026-05-16

### Corrigido
- Crash no startup com "Entry Point Not Found: TaskDialogIndirect" no
  `comctl32.dll`: o manifesto custom (que força execução como Administrador)
  estava sobrescrevendo o manifesto default do Tauri, derrubando a dependência
  `Microsoft.Windows.Common-Controls v6.0`. Sem ela, o Windows carregava o
  `comctl32` legado (v5), que não exporta `TaskDialogIndirect`. Re-adicionada
  a `assemblyIdentity` no manifesto embutido pelo `build.rs`.

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

[Unreleased]: https://github.com/adsonpleal/ragmarket/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/adsonpleal/ragmarket/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/adsonpleal/ragmarket/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/adsonpleal/ragmarket/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/adsonpleal/ragmarket/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/adsonpleal/ragmarket/releases/tag/v0.1.0
