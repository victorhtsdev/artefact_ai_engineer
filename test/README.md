# Testes de performance

Testes opcionais: não fazem parte do `npm test` nem da imagem Docker. Os dois precisam do app no ar (`docker compose up -d`).

| Teste | Comando | O que responde |
|---|---|---|
| [1. Stress do servidor](#1-stress-do-servidor) | `npm run test:stress` | O servidor aguenta volume? |
| [2. Rolagem no navegador](#2-rolagem-no-navegador) | `npm run test:perf` | A lista continua fluida enquanto cresce? |

## 1. Stress do servidor

`test/performance/server-stress.mjs` — chama a API tRPC direto por HTTP, sem navegador.

Este teste de stress foi criado para verificar se o servidor sustenta um volume alto de tarefas e de requisições. Ele fica disponível como ferramenta para **identificar gargalos no servidor de acordo com a necessidade das requisições**: basta ajustar a quantidade de tarefas (ou o tamanho dos lotes e das páginas no início do script) para simular a carga esperada e observar a latência e a memória.

### Como rodar

```bash
npm run test:stress           # 100 mil tarefas (padrão)
npm run test:stress -- 10000  # outra quantidade
```

### O que faz

1. **Geração:** cria as tarefas em lotes de 50 (`task.generateBatch`), imprimindo a cada 200 lotes a latência média, p95 e máxima.
2. **Leitura:** pagina até 400 páginas de 50 a partir das tarefas **mais antigas** (`dataCriacao asc`), como um usuário percorrendo a lista inteira.

As latências são medidas pelo cliente (incluem o HTTP). Para ver a memória do servidor ao mesmo tempo, acompanhe o resumo `[metrics]` no log: `docker logs -f artefact_ai_engineer-app-1`.

### Resultado (2026-11-01, 100 mil tarefas)

| Fase | Requisições | Média | p95 | Máx |
|---|---|---|---|---|
| Geração (lotes de 50) | 2.000 | 5,4 ms | 7,7 ms | 117 ms (primeira, aquecimento) |
| Leitura (das mais antigas) | 400 | 5,2 ms | 7,0 ms | 38 ms |

- Latência estável do início ao fim, sem erros. No servidor, cada chamada levou ~1 ms (o resto é HTTP).
- Memória do servidor: ~95 MB com 100 mil tarefas — folga ampla para armazenar tudo em memória.
- **Conclusão:** o servidor não é gargalo para o volume testado. Foi isso que direcionou a investigação para o navegador (teste 2).

## 2. Rolagem no navegador

Este teste foi criado para resolver um problema que o desenvolvedor notou ao testar a aplicação manualmente. Ele mede, num navegador real, as abordagens de renderização da lista no modo geração (`/?mode=generate`), em que rolar até o fim cria novas tarefas no servidor, e serviu de base para a decisão registrada no fim desta seção: **adotar a virtualização**.

### Problema observado

Testando a aplicação no navegador, o desenvolvedor notou que, segurando **Page Down**, a geração de tarefas ficava cada vez mais lenta à medida que a lista crescia. As métricas do servidor (resumo periódico no log do container) mostravam o `task.generateBatch` estável em ~1 ms, mas recebendo **cada vez menos chamadas**: o servidor respondia rápido, era o navegador que demorava cada vez mais para processar cada lote e pedir o próximo. Para comparar soluções com dados, e não por impressão, foi criado este teste.

### Como rodar

```bash
npx playwright install chromium      # só na primeira vez
npm run test:perf                    # lista virtualizada (~1 min)
```

Cada janela de 10 s aparece no terminal enquanto o teste roda; no fim sai uma tabela comparativa, as tabelas em markdown usadas abaixo e os dados brutos em `bench-results/` (não versionado). Duração e janela são configuráveis: `BENCH_DURATION_MS`, `BENCH_WINDOW_MS`.

### Metodologia

Benchmark automatizado em `test/performance/scroll-benchmark.mjs`.

- Chromium headless (Playwright), janela de 1280×800.
- Abre `/?mode=generate` e pressiona **Page Down a cada 30 ms durante 60 s**.
- Antes de cada abordagem o container é reiniciado → todas começam com as mesmas 25 tarefas de exemplo.
- Amostra a cada 10 s:

| Métrica | O que indica |
|---|---|
| Lotes na janela | Ritmo de geração (cada lote = 20 tarefas) — a métrica principal |
| Tarefas | Tamanho da lista no momento da amostra |
| `<article>` no DOM | Quantos itens estão de fato renderizados |
| Heap JS (MB) | Memória do JavaScript no navegador (`performance.memory`) |
| Long tasks (ms) | Tempo em que a página ficou travada (tarefas de JS > 50 ms) dentro da janela de 10 s |

Os números absolutos dependem da máquina; o que importa é a comparação entre abordagens na mesma máquina e a **tendência** ao longo do tempo.

### Abordagens

#### A — `plain`: renderizar todas as tarefas

Uma `<li>` por tarefa; nova página do infinite query disparada por uma sentinela no fim da lista (`IntersectionObserver`, 1,5 tela de antecedência).

#### B — `virtual`: virtualização com `@tanstack/react-virtual`

Só as tarefas visíveis + 5 de margem ficam no DOM (`useWindowVirtualizer`, altura medida por item). A geração é disparada quando o último item renderizado está a menos de 20 do fim. O SSR continua entregando a primeira página no HTML (`initialRect`).

### Resultados (2026-11-01)

#### Rodada 2 — meta de 10 mil tarefas (máx. 5 min por abordagem)

`BENCH_TARGET_TASKS=10000 BENCH_DURATION_MS=300000 npm run test:perf`

| abordagem | tempo | tarefas | lotes 1ª janela | lotes última | queda | DOM máx. | pico heap navegador (MB) | travado total |
|---|---|---|---|---|---|---|---|---|
| plain | 300 s (limite) | **7.545** — não chegou | 52 | 6 | 88 % | 7.545 | 430,1 | 215,8 s de 300 s (72 %) |
| virtual | **90 s** | 10.645 | 86 | 39 | 55 % | 18 | 58,2 | 13,1 s de 90 s (15 %) |

##### A — plain (amostras a cada ~30 s; série completa em `bench-results/`)

| s | lotes na janela | tarefas | `<article>` no DOM | heap JS do navegador (MB) | long tasks (ms) |
|---|---|---|---|---|---|
| 10 | 52 | 1065 | 1065 | 38.1 | 0 |
| 30 | 23 | 2245 | 2245 | 162.9 | 7181 |
| 61 | 14 | 3265 | 3265 | 81.5 | 7311 |
| 92 | 13 | 4105 | 4105 | 183.6 | 7753 |
| 122 | 10 | 4765 | 4765 | 149.2 | 7664 |
| 153 | 9 | 5345 | 5345 | 86.9 | 8045 |
| 185 | 9 | 5905 | 5905 | 220.9 | 8353 |
| 217 | 6 | 6365 | 6365 | 128.1 | 8806 |
| 247 | 8 | 6845 | 6845 | 430.1 | 8068 |
| 279 | 7 | 7305 | 7305 | 188.3 | 8418 |
| 300 | 6 | 7545 | 7545 | 424.0 | 8780 |

##### B — virtual

| s | lotes na janela | tarefas | `<article>` no DOM | heap JS do navegador (MB) | long tasks (ms) |
|---|---|---|---|---|---|
| 10 | 86 | 1745 | 17 | 13.8 | 0 |
| 20 | 82 | 3385 | 18 | 41.2 | 0 |
| 30 | 71 | 4805 | 17 | 50.3 | 0 |
| 40 | 57 | 5925 | 18 | 26.7 | 121 |
| 50 | 59 | 7125 | 18 | 39.2 | 54 |
| 60 | 49 | 8105 | 17 | 56.4 | 1689 |
| 70 | 44 | 8985 | 18 | 58.2 | 3135 |
| 80 | 44 | 9865 | 18 | 43.3 | 3580 |
| 90 | 39 | 10645 | 17 | 48.3 | 4504 |

#### Rodada 1 — 60 s por abordagem

##### A — plain

| s | lotes na janela | tarefas | `<article>` no DOM | heap JS (MB) | long tasks (ms) |
|---|---|---|---|---|---|
| 10 | 49 | 985 | 985 | 32.9 | 105 |
| 20 | 32 | 1645 | 1645 | 54.3 | 5289 |
| 31 | 25 | 2145 | 2145 | 120.1 | 6872 |
| 41 | 21 | 2545 | 2545 | 196.4 | 7215 |
| 51 | 17 | 2905 | 2905 | 195.3 | 7542 |

##### B — virtual

| s | lotes na janela | tarefas | `<article>` no DOM | heap JS (MB) | long tasks (ms) |
|---|---|---|---|---|---|
| 10 | 85 | 1725 | 17 | 13.1 | 0 |
| 20 | 80 | 3325 | 18 | 30.4 | 0 |
| 30 | 71 | 4745 | 18 | 44.7 | 0 |
| 40 | 62 | 5985 | 18 | 46.4 | 236 |
| 50 | 50 | 6985 | 18 | 26.4 | 1141 |

##### Comparação com o mesmo volume de tarefas

| ~tarefas | plain: lotes/10 s | plain: travado | virtual: lotes/10 s | virtual: travado |
|---|---|---|---|---|
| ~1.000–1.700 | 49 → 32 | 0,1 s → 5,3 s | 85 | 0 s |
| ~2.900–3.300 | 17 | 7,5 s de 10 s | 80 | 0 s |
| ~7.000 | — | — | 50 | 1,1 s |

### Análise

"Heap" é sempre a memória JavaScript **do navegador** (`performance.memory`). A memória do servidor aparece no resumo `[metrics]` do log do container.

- **plain:** o custo de cada lote cresce com o total (todo o DOM + re-render de todos os itens). A partir de ~2.200 tarefas a página fica **~75–88 % de cada janela travada**; em 5 minutos **não chega a 10 mil** (parou em 7.545, gerando só 6 lotes/10 s) e o heap do navegador oscila entre 80 e 430 MB (o GC não dá conta).
- **virtual:** DOM constante (~18 itens), heap do navegador abaixo de 60 MB, **chega a 10 mil em 90 s** (≥ 3,3× mais rápido — a plain nem chegou). Com o mesmo volume (~7 mil) gera **~8× mais lotes** (59 vs 7).
- **A virtual também degrada**, e a rodada de 10 mil deixa isso claro: 86 → 39 lotes/10 s, e o tempo travado sobe de ~0 para **4,5 s por janela (45 %) perto de 10 mil**. Resta um custo O(n) por lote fora do DOM. Suspeitas a investigar: *structural sharing* do React Query no `setQueryData` (compara o cache inteiro a cada lote) e o recálculo das posições de todos os itens no virtualizer.

### Decisão

**Adotada a abordagem B — virtualização (`@tanstack/react-virtual`).** É a lista da aplicação. A abordagem A foi removida do código depois desta comparação; para reproduzi-la, use o commit anterior a "Remove the non-virtualized list".

Motivos, pelos dados:

- **Resolve o problema observado:** chegou a 10 mil tarefas em 90 s; a lista sem virtualização não chegou em 5 minutos (parou em 7.545).
- **Custo de renderização constante:** ~18 itens no DOM com qualquer volume, contra milhares na abordagem A.
- **Ritmo e fluidez:** com o mesmo volume (~7 mil tarefas), ~8× mais lotes gerados e praticamente nenhum travamento, enquanto a abordagem A passava ~75–88 % de cada janela travada.
- **Memória do navegador:** pico de 58 MB, contra 430 MB.
- **SSR preservado:** a primeira página continua vindo no HTML do servidor.

#### Limitação conhecida

Acima de ~7 mil tarefas carregadas, o processamento de cada lote no navegador volta a pesar (até 45 % de uma janela travada perto de 10 mil). O DOM continua pequeno; o custo vem de todas as tarefas carregadas permanecerem em memória no cliente. Em uso real da lista esse volume não é alcançado — só no modo geração, que é uma demonstração.

#### Conclusão

Um ponto de melhoria foi identificado no uso real da aplicação, analisado com dados e resolvido: a experiência de rolagem passou de travada a fluida nos volumes que a aplicação de fato atinge. Para o escopo deste projeto, o resultado é suficiente.
