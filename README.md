# ragmarket

Aplicativo standalone para Windows que captura os pacotes do seu próprio
cliente enquanto você usa o **Catálogo de Vendas** do latamRO, decodifica os
resultados das buscas e mostra tudo em uma tabela ordenável e filtrável.

Somente leitura: cada byte exibido vem do servidor para o seu próprio cliente.
Nenhum pacote é construído ou enviado. Nenhuma proteção anti-cheat é
atravessada.

## ⬇ Download

[**ragmarket-v0.1.0-setup.exe**](https://github.com/adsonpleal/ragmarket/releases/latest/download/ragmarket-v0.1.0-setup.exe)
— instalador único para Windows 10/11 (~10 MB). Já inclui o WinDivert
embutido; basta executar e seguir o instalador. Depois de instalado, rode o
Ragmarket pelo atalho do menu Iniciar **como Administrador**.

Veja também a [página de releases](https://github.com/adsonpleal/ragmarket/releases)
para versões anteriores e o `SHA256SUMS.txt` correspondente.

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

- Não captura pacotes de login (filtra só portas do servidor de mapa que
  carregam buscas do catálogo).
- Não envia nenhum dado para servidores externos, exceto consultas anônimas
  ao Divine Pride **quando você clica em um nome de item** para abrir a
  página dele no navegador.

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
- **Rust** (backend) — captura de pacotes via WinDivert (modo *sniff*)
- **React + TypeScript + Vite** (frontend)
- **TanStack Table** para a grade de resultados

## Pré-requisitos (para construir)

- Windows 10/11
- Rust toolchain (`stable-x86_64-pc-windows-msvc`)
- Windows 11 SDK (ex.: `10.0.26100.0`) via Visual Studio Installer
- Node.js 20+
- Visual Studio C++ Build Tools (com `vcvars64.bat`)
- WinDivert 2.x — os binários (`WinDivert.dll`, `WinDivert64.sys`,
  `WinDivert.lib`) ficam em `src-tauri/resources/x64/`

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

O Vite sobe em `http://localhost:1420`; em seguida o shell do Tauri carrega
a UI.

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
3. Clique em **Iniciar Gravação**.
4. No jogo, abra o Catálogo de Vendas, faça suas buscas e navegue por todas
   as páginas dos resultados.
5. Os resultados aparecem na tabela em tempo real conforme os pacotes chegam.
6. Use a barra lateral para filtrar:
   - Faixa de refino (mín-máx)
   - Itens (chips multi-seleção — útil quando você buscou itens diferentes)
   - Cartas / encantos (multi-seleção; AND — a linha precisa ter todas as
     cartas selecionadas)
   - Opções aleatórias (checkbox por opção + faixa de valor; AND)
7. Clique nos cabeçalhos das colunas para ordenar; clique no nome do item ou
   da carta para abrir a página do Divine Pride no navegador.

## Estrutura do projeto

```
ragmarket/
├── src/                       Frontend React/TS
│   ├── App.tsx
│   ├── components/
│   │   ├── FilterSidebar.tsx
│   │   └── ResultsTable.tsx
│   ├── hooks/
│   │   ├── useCapture.ts      Inscrição em eventos do Tauri + parse por stream
│   │   └── useItemNames.ts    Resolução de nomes a partir do dp-item.json
│   ├── services/
│   │   ├── parser.ts          Decodificador do registro 0x0836
│   │   ├── parser.test.ts     Testes Vitest
│   │   ├── randomOptions.ts   Lookup ID → nome de opção aleatória
│   │   └── divinePride.ts     Cliente do JSON estático com cache em sessão
│   └── shared/
│       └── random_options.json  Mirror do random_option_db do rAthena
├── public/db/
│   └── dp-item.json           Mirror estático de itens do Divine Pride (~1,4 MB)
├── src-tauri/                 Backend Rust
│   ├── src/
│   │   ├── main.rs            Entry point do Tauri
│   │   ├── lib.rs             Registro de comandos
│   │   ├── capture.rs         Loop de captura WinDivert + enumeração de NICs
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

Oito testes unitários cobrem o decodificador do `0x0836` contra fixtures
sintéticas que reproduzem o layout de bytes que veio das capturas reais.

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
