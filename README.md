# ragmarket

Aplicativo standalone para Windows que captura os pacotes do seu próprio
cliente enquanto você joga latamRO e decodifica:

- **Catálogo**: resultados das buscas do Catálogo de Vendas em uma tabela
  ordenável e filtrável.
- **Meus Itens**: o que está no seu inventário, carrinho, armazém Kafra e
  armazém do clã — populado automaticamente conforme o servidor envia.
  Botão **Exportar CSV** salva a lista visível num arquivo via diálogo
  nativo de salvar.
- **Favoritos**: itens marcados com ⭐ (ou adicionados por ID direto pelo
  cabeçalho), persistidos entre sessões e com links rápidos para o
  Divine Pride e para a busca do Mercado. Botão **Atualizar preços**
  busca o **Mín** e **Máx** atuais do Catálogo de Vendas para cada
  favorito.

Somente leitura: cada byte exibido vem do servidor para o seu próprio cliente.
Nenhum pacote é construído ou enviado. Nenhuma proteção anti-cheat é
atravessada.

## ⬇ Download

[**ragmarket-v0.4.0-setup.exe**](https://github.com/adsonpleal/ragmarket/releases/latest/download/ragmarket-v0.4.0-setup.exe)
— instalador único para Windows 10/11 (~10 MB). Já inclui o WinDivert
embutido; basta executar e seguir o instalador. O Ragmarket é configurado
para sempre rodar como Administrador (vai aparecer um UAC ao iniciar — isso
é necessário pra capturar pacotes de rede).

Veja também a [página de releases](https://github.com/adsonpleal/ragmarket/releases)
para versões anteriores e o `SHA256SUMS.txt` correspondente.

### ⚠ Aviso do SmartScreen "Windows protegeu seu PC"

Como o binário **não tem assinatura digital paga**, na primeira execução o
Windows SmartScreen vai mostrar o aviso "**Windows protected your PC** —
Microsoft Defender SmartScreen prevented an unrecognized app from starting".

**Como instalar mesmo assim:**

1. Clique em **"More info"** (Mais informações) no diálogo
2. Aparece um botão **"Run anyway"** (Executar mesmo assim) no canto inferior — clique nele
3. O instalador roda normalmente

Esse aviso só aparece porque o `.exe` ainda não acumulou reputação no
Microsoft Application Reputation Service (precisaria de muitos downloads
sem detecções, ou um certificado de assinatura EV, que custa caro). O
binário é compilado direto do código-fonte aberto deste repositório via
GitHub Actions — se quiser verificar a integridade, compare o hash do
arquivo baixado com o `SHA256SUMS.txt` da mesma release.

---

## FAQ

### 1. Esse programa pode ser considerado um hack?

Não. O Ragmarket não toca em nada do cliente do jogo, não injeta DLL nenhuma,
não modifica memória, não envia pacotes pro servidor. Ele apenas observa, do
lado de fora, o tráfego de rede que **o próprio servidor já te mandou** — os
mesmos pacotes que o seu cliente recebe e processa. A leitura acontece no
nível do driver de rede (via WinDivert), antes do cliente sequer interpretar.

O servidor manda os resultados da busca em texto claro pelo protocolo TCP do
jogo; nós só lemos os bytes que já estão entrando na sua placa de rede e
traduzimos para algo legível.

### 2. Posso levar ban se usar?

Não há vetor conhecido de detecção. O programa:

- **Não injeta** nada no processo do `Ragexe.exe`, então o nProtect/GameGuard
  não vê nada dele.
- **Não envia pacotes** pro servidor, então não há comportamento anômalo na
  conexão para o servidor identificar.
- **Não modifica** memória, arquivos do cliente, nem o tráfego de saída.
- **Não bloqueia nem reescreve** pacotes — opera em modo *sniff* do WinDivert,
  que apenas observa e deixa o pacote seguir intacto para o cliente.

Do ponto de vista do servidor e do anti-cheat, é indistinguível de você só
estar olhando o catálogo no cliente normal.

### 3. Por que ele precisa rodar como Administrador?

Para acessar a rede em nível de driver (a única maneira de capturar os pacotes
TCP que chegam para o seu cliente já estabelecido). Sem privilégio elevado, o
Windows bloqueia a captura. O Wireshark precisa do mesmo privilégio pelo mesmo
motivo.

### 4. Funciona em Wi-Fi ou só em cabo?

Funciona nos dois. O WinDivert lê os pacotes antes da pilha TCP do Windows,
então o adaptador físico não importa.

### 5. O programa deixa minha conexão mais lenta?

Não. Em modo *sniff*, o WinDivert observa o tráfego e o devolve intacto para
o cliente. Não há atraso perceptível.

### 6. Por que o primeiro Start Recording demora uns segundos?

O Windows está instalando o driver de kernel do WinDivert como serviço (uma
única vez por máquina). Nos próximos starts, abre instantaneamente.

### 7. Os meus dados de conta vão para algum lugar?

Não. Tudo é processado localmente. O Ragmarket:

- Não captura pacotes de login (filtra só portas do servidor de mapa).
  As listas decodificadas são as buscas do catálogo e os dumps de
  contêiner (inventário, carrinho, armazém) que o servidor manda pro
  seu próprio cliente.
- Favoritos e a preferência de servidor ficam só no `localStorage` da
  janela do app, no seu computador.
- Não envia nenhum dado para servidores externos, exceto quando você
  **clica em um link de item**: o Divine Pride é consultado com o ID
  do item e a busca do Mercado é aberta com o nome do item — ambos no
  seu navegador padrão, sem credenciais.

### 8. Funciona em outros servidores de RO?

Foi feito para o **latamRO** (gnjoylatam). Outros servidores podem ter um
formato de pacote diferente; o decodificador de `0x0836` é específico para o
layout que o latamRO usa.

### 9. De onde vêm os nomes dos itens e cartas?

De um banco estático (~32 mil entradas) extraído do
[Divine Pride](https://www.divine-pride.net/) e empacotado com o app. Não há
chamada à API em tempo real para resolver nomes — tudo está pré-carregado.

### 10. Por que algumas cartas/itens aparecem como "Carta 12345" sem nome?

Esse banco estático foi tirado da base do Divine Pride há algumas semanas; se
um item novo foi adicionado depois disso, ele cai no fallback "Carta XXXX"
ou "Item XXXX". Não impacta a busca/filtragem, só o nome legível.

### 11. Por que clicar em um item abre o Divine Pride em vez de algo local?

O Divine Pride tem a descrição completa, screenshots, drops, conjuntos, etc.
Não vale a pena replicar isso localmente. O clique manda o ID do item para
`divine-pride.net/database/item/<id>?server=latamRO`.

Nas abas **Meus Itens** e **Favoritos**, cada linha também tem um link
**Mercado** que abre a busca do Catálogo de Vendas no gnjoylatam já
filtrada por nome do item, ordenada do menor preço pro maior. O servidor
usado nesse link (Freya ou Nidhogg) sai do picker no canto superior
direito.

### 12. Posso fazer várias buscas diferentes em uma sessão?

Sim. O filtro **Itens** na barra lateral lista todos os itens distintos que
apareceram na captura, então depois de buscar várias coisas você consegue
focar em uma específica.

### 13. O botão Limpar apaga tudo?

Apaga os resultados acumulados e os filtros atuais, mas **mantém a gravação
rodando**. É útil entre buscas: depois de uma busca grande, limpa, faz outra,
e a tabela começa do zero. Para fechar tudo e voltar à tela inicial use
**Nova Sessão**.

### 14. Funciona se eu já tenho o Wireshark/Npcap instalado?

Sim. O Ragmarket usa o **WinDivert**, não o Npcap. Os dois podem coexistir
sem problemas; rodar o Wireshark em paralelo também funciona.

### 15. Por que o programa não vê meus pacotes mesmo como Administrador?

Causas possíveis, em ordem de probabilidade:

1. O driver do WinDivert não conseguiu carregar — algum antivírus pode estar
   bloqueando. Adicione uma exceção para `WinDivert64.sys`.
2. Você selecionou uma interface de rede errada. Use o IP do adaptador que
   tem a rota padrão (o seu acesso real à internet).
3. Algum outro software já segurou o handle do WinDivert e não liberou.
   Reinicie o Windows e tente de novo.

---

## Stack

- **Tauri 2** — produz um `.exe` standalone de ~10-15 MB
- **Rust** (backend) — captura de pacotes via [WinDivert](https://github.com/basil00/WinDivert) (modo *sniff*)
- **React + TypeScript + Vite** (frontend)
- **TanStack Table** para a grade de resultados

## Pré-requisitos (para construir)

- Windows 10/11
- Rust toolchain (`stable-x86_64-pc-windows-msvc`)
- Windows 11 SDK (ex.: `10.0.26100.0`) via Visual Studio Installer
- Node.js 20+
- Visual Studio C++ Build Tools (com `vcvars64.bat`)
- [WinDivert](https://github.com/basil00/WinDivert) 2.x — os binários
  (`WinDivert.dll`, `WinDivert64.sys`, `WinDivert.lib`) ficam em
  `src-tauri/resources/x64/`

## Setup

```powershell
# Carregue o ambiente do Visual Studio (link.exe no PATH)
& "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat"

# Coloque o cargo no PATH
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"

# Dependências JS (primeira vez)
cd C:\Users\adson\dev\ragmarket
npm install
```

## Rodando em desenvolvimento

Você PRECISA abrir o terminal como **Administrador** para o raw socket
funcionar.

```powershell
# PowerShell elevado com o vcvars64 carregado:
cd C:\Users\adson\dev\ragmarket
npm run tauri dev
```

O Vite sobe em `http://localhost:1422`; em seguida o shell do Tauri carrega
a UI. Você pode rodar várias instâncias em paralelo (uma por janela do
jogo) — o `npm run tauri` é um wrapper que evita o conflito do
`WinDivert64.sys` carregado pelo kernel; o `build.rs` cuida da cópia
local com fallback quando o arquivo está travado. O `tauri build`
(instalador) continua usando a config normal sem nenhum tratamento
especial.

## Empacotando o .exe redistribuível

```powershell
npm run tauri build
```

Saída:

- `src-tauri/target/release/ragmarket.exe` — binário standalone
- `src-tauri/target/release/bundle/msi/*.msi` — instalador MSI
- `src-tauri/target/release/bundle/nsis/*.exe` — instalador NSIS

O usuário precisa clicar com o botão direito e **Executar como
administrador** ao abrir o `ragmarket.exe` final.

## Fluxo de uso

1. Abra como Administrador.
2. Escolha a interface de rede ativa no dropdown.
3. (Opcional) selecione o cliente `Ragexe.exe` para focar — deixe em
   branco pra capturar todos.
4. Clique em **Iniciar Gravação**.

Três abas ficam disponíveis durante a sessão:

- **Catálogo** — abra o Catálogo de Vendas dentro do jogo e os resultados
  aparecem aqui em tempo real. Barra lateral filtra por refino, item,
  cartas/encantos e opções aleatórias.
- **Meus Itens** — inventário e carrinho aparecem sozinhos ao selecionar
  o personagem; armazém Kafra e armazém do clã aparecem na primeira vez
  que você abre cada NPC. Filtro de fonte (chips Inventário /
  Carrinho / Kafra / Clã). Botão **Exportar CSV** salva a lista
  visível (ID, nome, qtd, refino, cartas, opções, fonte) via diálogo
  nativo de salvar.
- **Favoritos** — itens marcados com ⭐ em qualquer das duas tabelas
  anteriores, ou adicionados manualmente pelo campo **ID do item**
  no cabeçalho. Persiste entre sessões. Tabela com colunas Item,
  **Mín** e **Máx**, mais links DP e Mercado por linha. O botão
  **Atualizar preços** dispara uma busca paralela no Catálogo de
  Vendas e popula as colunas de preço.

Em todas as tabelas, clique no nome de um item ou carta pra abrir o
Divine Pride. Em **Meus Itens** e **Favoritos** há também um link
**Mercado** ao lado de cada item que abre a busca do gnjoylatam pelo
nome (servidor selecionável no cabeçalho — Freya por padrão).

Controles globais (**Parar Gravação**, **Limpar**, **Nova Sessão**)
ficam no topo da tela e funcionam independente da aba aberta.

## Estrutura do projeto

```
ragmarket/
├── src/                       Frontend React/TS
│   ├── App.tsx                Container + abas + ações globais
│   ├── components/
│   │   ├── FilterSidebar.tsx       Filtros do Catálogo
│   │   ├── ResultsTable.tsx        Tabela do Catálogo
│   │   ├── MyItemsView.tsx         Aba Meus Itens
│   │   ├── FavoritesView.tsx       Aba Favoritos
│   │   ├── MainTabs.tsx            Barra de abas
│   │   ├── SessionActions.tsx      (inline em App.tsx) Stop/Limpar/Nova Sessão
│   │   ├── SortableTable.tsx       Tabela genérica (TanStack) compartilhada
│   │   ├── itemColumns.tsx         Factories: starColumn, cardsColumn, optionsColumn
│   │   ├── ItemLinks.tsx           Par de links DP + Mercado por item
│   │   ├── StarButton.tsx          Toggle de favorito
│   │   ├── ServerPicker.tsx        Picker Freya/Nidhogg
│   │   ├── ClientPicker.tsx        Picker de PID do Ragexe na tela inicial
│   │   └── UpdateBanner.tsx        Banner de nova versão
│   ├── hooks/
│   │   ├── useCapture.ts           Subs Tauri + walker por stream + flush em lote
│   │   ├── useItemNames.ts         Resolução de nomes a partir do dp-item.json
│   │   ├── useFavorites.ts         Set<itemID> persistido
│   │   ├── useServerPref.ts        Server escolhido persistido
│   │   ├── usePersistentValue.ts   Genérico localStorage + sync entre janelas
│   │   ├── useDiscoveredClients.ts Polling do TCP table pelo Ragexe
│   │   └── useLatestRelease.ts     Checagem de update via API do GitHub
│   ├── services/
│   │   ├── parser.ts                  Decoder do 0x0836 (search_store_info)
│   │   ├── parser.test.ts
│   │   ├── inventoryParser.ts         Decoder dos pacotes V6 de contêiner
│   │   ├── inventoryParser.test.ts
│   │   ├── randomOptions.ts           Lookup de opção aleatória
│   │   └── divinePride.ts             Cliente do JSON estático
│   ├── lib/
│   │   ├── bytes.ts                   u16le / u32le / hexToBytes / concat
│   │   ├── links.ts                   dpUrl + marketUrl + openExternal
│   │   ├── invoke.ts                  Wrappers das Tauri commands
│   │   ├── types.ts
│   │   └── updates.ts
│   └── shared/
│       └── random_options.json   Mirror do random_option_db do rAthena
├── public/db/
│   └── dp-item.json              Mirror estático de itens do Divine Pride (~1,4 MB)
├── src-tauri/                 Backend Rust
│   ├── src/
│   │   ├── main.rs            Entry point do Tauri
│   │   ├── lib.rs             Registro de comandos
│   │   ├── capture.rs         Loop de captura WinDivert + enumeração de NICs
│   │   ├── connections.rs     PID picker (varre tabela TCP do Windows)
│   │   ├── process.rs         Utilitários Win32 (process info, TCP table)
│   │   └── packet.rs          Parsing de cabeçalhos IPv4 + TCP
│   ├── resources/x64/         WinDivert.dll, WinDivert64.sys, WinDivert.lib
│   ├── capabilities/default.json
│   ├── Cargo.toml
│   └── tauri.conf.json
├── tools/                     Scripts auxiliares (análise de pcapng)
└── README.md
```

## Testes

```powershell
npm test
```

Treze testes unitários cobrem os decodificadores do `0x0836` (catálogo) e
dos pacotes V6 de contêiner (`0x0B08`/`0x0B09`/`0x0B0A`/`0x0B0B`/`0x0B39`)
contra fixtures sintéticas que reproduzem o layout de bytes que veio das
capturas reais.

## Notas do protocolo

Cada registro dentro de um `0x0836 search_store_info` tem 141 bytes:

| Offset | Tamanho | Campo |
|---|---|---|
| 0 | 1 | flag (0x09 no primeiro registro da página, 0x00 no resto) |
| 1-4 | 4 | shopID (uint32 LE) |
| 5-8 | 4 | accountID (uint32 LE) |
| 9-88 | 80 | shopName (latin-1, padded com espaço + null) |
| 89-92 | 4 | itemID (uint32 LE) |
| 93 | 1 | subtipo do item |
| 94-97 | 4 | preço (uint32 LE) |
| 98 | 1 | quantidade |
| 99 | 1 | padding |
| 100 | 1 | refino |
| 101-116 | 16 | 4 cartas × uint32 LE |
| 117-140 | 24 | até 4 opções aleatórias × 5 bytes (`u16 idx, u16 val, i8 param`) |

O cabeçalho da página antes dos registros: `u16 opcode (0x0836)`, `u16
length`, `u8 more_results`, `u8 page`, e um byte final de MAC que o
decodificador ignora.

Outros opcodes observados no tráfego latamRO (não decodificados atualmente):

- `0x0835` cliente → servidor — pedido de busca
- `0x0838` cliente → servidor — pedido de próxima página
- `0x083C` / `0x083D` — round-trip de clique em loja (carregaria coordenadas;
  fora do escopo do v1)

### Pacotes de contêiner (V6 unificado)

Inventário, carrinho, armazém Kafra e armazém do clã usam o mesmo
quinteto de opcodes, distinguidos pelo byte `invType` (0=inventário,
1=carrinho, 2=Kafra, 3=clã):

| Opcode | Nome | Header | Registro |
|---|---|---|---|
| `0x0B08` | `ZC_INVENTORY_START` | `u16 op, u16 len, u8 invType, name(Z*)` | — |
| `0x0B09` | `ZC_INVENTORY_ITEMLIST_NORMAL_V6` | `u16 op, u16 len, u8 invType` | 34 bytes |
| `0x0B0A` | `ZC_INVENTORY_ITEMLIST_EQUIP_V6` (sem grade) | idem | **67 bytes** |
| `0x0B39` | `ZC_INVENTORY_ITEMLIST_EQUIP_V6` (com grade) | idem | 68 bytes |
| `0x0B0B` | `ZC_INVENTORY_END` | `u16 op, u8 invType, u8 result` (fixo 4 bytes) | — |

Nota: a variante do latamRO **não tem o byte de Flag final** no
registro de equip (rAthena master define 68; aqui são 67). Detalhe
verificado contra captura real e refletido no decoder.
