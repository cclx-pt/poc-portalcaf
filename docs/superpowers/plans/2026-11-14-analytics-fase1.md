# Analytics fase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rubricas e âmbito (local/geral) nas categorias, repartição dos gerais nos resumos pela média de jovens e adultos dos últimos 12 meses, e duas páginas novas: Demonstração de resultados e Comparação entre comunidades.

**Architecture:** A repartição é feita em `calcularResumos` (fonte única). As páginas novas só leem `resumos`. A classificação das categorias vive num módulo puro `src/lib/rubricas.ts`, usado pelo cálculo, pela Configuração e pelas páginas.

**Tech Stack:** React 18 + TypeScript + Vite, Firebase (Firestore), Recharts, ExcelJS, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-14-analytics-fase1-design.md`

## Global Constraints

- Valores em euros com duas casas (`eur`), formato pt-PT; pessoas sem símbolo de moeda (`num`).
- Identidade CAF: Montserrat, escala de cinzentos (#000, #333, #777, #E6E6E6, #FFF).
- Terminologia: "vencimentos", nunca "ordenados"; nunca nomes de pessoas.
- Categorias de nível confidencial entram nas rubricas dos resumos como "Outros custos de funcionamento".
- Bolsa geral mantém a regra do mesmo mês; só os gerais usam 12 meses.
- Contribuições com o campo Pago em branco nunca contam (já garantido em `mapearLinhas`).
- Total CCLX igual antes e depois da repartição.

## Review Focus

1. Categoria geral registada numa comunidade inativa (Barreiro em 2026-11): sai do Barreiro e reparte-se só pelas ativas.
2. Janeiro: a média de 12 meses usa a assistência do ano anterior; sem ela, usa só janeiro.
3. Nenhuma comunidade com assistência num mês: os gerais vão para o resumo `gerais` e o total mantém-se.
4. Custo fixo cuja rubrica coincide com uma categoria geral confidencial (Vencimentos): repartido, e nas rubricas aparece só como "Outros custos de funcionamento".
5. Categoria do Jotform sem correspondência ("Pagamentos Livraria"): fica local, rubrica "Outros rendimentos".

---

### Task 1: Rubricas e classificação das categorias

**Files:**
- Create: `src/lib/rubricas.ts`
- Modify: `src/lib/types.ts` (Categoria: `rubrica?: string; ambito?: 'local' | 'geral'`)
- Modify: `src/lib/seed.ts` (função `c(...)` preenche `rubrica` com `rubricaInicial`, `ambito: 'local'`)
- Test: `tests/unit/rubricas.test.ts`

**Interfaces:**
- Produces:
  - `RUBRICAS_ENTRADA: readonly string[]`, `RUBRICAS_SAIDA: readonly string[]` (ordem do spec 5.1)
  - `OUTROS_FUNCIONAMENTO = 'Outros custos de funcionamento'`
  - `rubricaInicial(nome: string, tipo: 'entrada' | 'saida'): string` (tabela do spec 5.1; sem correspondência → 'Outros rendimentos' / 'Outros gastos')
  - `classificador(categorias: Categoria[]): (nome: string, tipo: 'entrada' | 'saida') => { rubrica: string; ambito: 'local' | 'geral'; confidencial: boolean }` — correspondência por `norm(nome)` + tipo; usa `c.rubrica ?? rubricaInicial`; `ambito` por defeito `local`; aceita singular/plural simples ("Dízimo" ↔ "Dízimos", "Oferta" ↔ "Ofertas").

- [ ] **Step 1: Testes** — `rubricaInicial('Renda','saida') === 'Instalações'`; `('Coletas em dinheiro','entrada') === 'Ofertas'`; `('Pagamentos Livraria','entrada') === 'Outros rendimentos'`; classificador com categoria `{nome:'Renda', tipo:'saida', ambito:'geral'}` devolve `ambito:'geral'`; `'Dízimo'` encontra a categoria `'Dízimos'`; categoria `nivel:'confidencial'` devolve `confidencial:true`; desconhecida → local.
- [ ] **Step 2:** `npx vitest run tests/unit/rubricas.test.ts` → FAIL (módulo inexistente).
- [ ] **Step 3:** Implementar `src/lib/rubricas.ts` e os campos em `types.ts`/`seed.ts`.
- [ ] **Step 4:** Testes passam; `npx tsc -b` sem erros.
- [ ] **Step 5:** Commit `feat: rubricas e âmbito das categorias`.

### Task 2: Repartição dos gerais nos resumos

**Files:**
- Modify: `src/lib/types.ts` (ResumoMes ganha `rubricas`, `geralEntradas`, `geralSaidas`, `pesoGeral`, `adultosMedia12m` — spec 5.2)
- Modify: `src/lib/resumos.ts` (`DadosCalculo` ganha `categorias?: Categoria[]` e `assistenciaAnterior?: Lote[]`; `calcularResumos` reparte)
- Test: `tests/unit/gerais.test.ts`

**Interfaces:**
- Consumes: `classificador`, `OUTROS_FUNCIONAMENTO` (Task 1).
- Produces:
  - `pesos12m(assistencia: Lote[], assistenciaAnterior: Lote[], ano: number, mes: number): Map<string, number>` — média de `valor` por registo nos 12 meses até (ano, mes).
  - Resumo especial `comunidadeId: 'gerais'` quando não há pesos.
  - `ResumoMes.rubricas.entrada|saida[rubrica] = { local, geral }`.

Algoritmo (por mês): classificar cada registo (contribuir, depósitos→'Coletas em dinheiro', despesas, banco contabilizado) e cada custo fixo (rubrica = nome da categoria de saída). Local → soma em `rubricas[...].local` da comunidade. Geral (e comunidade ≠ 'bolsa-geral') → retira do total local da comunidade de origem e junta ao bolo `{tipo, rubrica} → valor`. Repartir o bolo pelas comunidades ativas não especiais com peso > 0 (última recebe a diferença). Rubrica de categoria confidencial = `OUTROS_FUNCIONAMENTO`. Totais: `entradas = entradas locais + quotaBolsa + geralEntradas`; `saidas = saídas locais + geralSaidas`. Campos existentes (`contribuir`, `despesas`, `custosFixos`, `*PorCategoria`, `custosRubricas`) continuam a refletir o registado localmente (incluindo gerais), para não mudar páginas antigas; só `entradas/saidas/saldo` mudam.

- [ ] **Step 1: Testes** (dados: Almada e Porto com assistência; Sede sem; Barreiro com `fim: '2026-10-31'`):
  - `geral repartida por 12 meses`: despesa geral de 300 € na Sede em 2026-03, pesos Almada 100 / Porto 50 → Almada `geralSaidas` 200, Porto 100, Sede `saidas` 0.
  - `janeiro usa o ano anterior`: assistência só em 2025-12 (Almada 90) e 2026-01 (Porto 30) → pesos 90 e 30.
  - `inativa não recebe`: em 2026-11 o Barreiro não recebe parte e a sua despesa geral sai dele.
  - `sem pesos vai para gerais`: sem assistência → resumo `gerais` com `saidas` = bolo.
  - `total conservado`: soma de `saldo` de todos os resumos igual com `ambito` local e geral (ao cêntimo).
  - `confidencial agregado`: custo fixo 'Vencimentos' geral → `rubricas.saida['Outros custos de funcionamento'].geral` > 0 e não existe a chave 'Vencimentos e encargos'.
  - `desconhecida local`: contribuição 'Pagamentos Livraria' → `rubricas.entrada['Outros rendimentos'].local`.
  - teste existente do caso Caldas 2026 (10481,77 / 17579,54 / -7847,65) continua a passar sem categorias gerais.
- [ ] **Step 2:** Correr → FAIL.
- [ ] **Step 3:** Implementar em `resumos.ts`.
- [ ] **Step 4:** `npm test` todo verde.
- [ ] **Step 5:** Commit `feat: repartição dos gerais pela média de 12 meses`.

### Task 3: Ligar o cálculo aos dados e à Configuração

**Files:**
- Modify: `src/lib/recalcular.ts`, `scripts/sync-jotform.ts` (carregar `categorias` e `assistenciaAnterior` = lotes de assistência do ano − 1)
- Modify: `src/pages/Configuracao.tsx` (colunas Rubrica e Âmbito; campos no formulário com `RUBRICAS_*`; ao guardar com rubrica/âmbito alterados → `recalcularAno` do ano atual e anterior, mensagem no fim; "Inicializar" preenche `rubrica`/`ambito` das categorias existentes que não os têm)
- Test: `tests/unit/paginas.test.tsx` (render da Configuração não é necessário; cobrir via tipos e testes da Task 2)

**Interfaces:**
- Consumes: `RUBRICAS_ENTRADA`, `RUBRICAS_SAIDA`, `rubricaInicial` (Task 1); `DadosCalculo.categorias/assistenciaAnterior` (Task 2).

- [ ] **Step 1:** Alterar `recalcular.ts` e `sync-jotform.ts`; `npx tsc -b` e verificação de tipos do script.
- [ ] **Step 2:** Configuração: colunas, formulário, recálculo ao guardar, Inicializar.
- [ ] **Step 3:** `npm test` e `npm run build` verdes.
- [ ] **Step 4:** Commit `feat: rubricas na Configuração e recálculo`.

### Task 4: Página Demonstração de resultados

**Files:**
- Create: `src/lib/analise.ts` (agregações puras para as páginas)
- Create: `src/pages/DemonstracaoResultados.tsx`
- Modify: `src/App.tsx` (rota `analise/resultados`, nível privado), `src/components/Layout.tsx` (grupo "Análise")
- Test: `tests/unit/analise.test.ts`, `tests/unit/paginas.test.tsx`

**Interfaces:**
- Consumes: `Resumo`, `RUBRICAS_*`.
- Produces (em `analise.ts`):
  - `linhasDR(resumos: Resumo[], de: number, ate: number, separar: boolean): { tipo: 'entrada'|'saida'; rubrica: string; parte?: 'local'|'geral'; valores: Record<string, number> }[]` — chave = comunidadeId; inclui chave `'cclx'` com a soma.
  - `totaisPeriodo(r: Resumo, de: number, ate: number): { entradas: number; saidas: number; resultado: number; geralEntradas: number; geralSaidas: number; dizimos: number; adultosMedia: number | null }` — `adultosMedia` = média de `adultosMedia` dos meses com valor.

- [ ] **Step 1: Testes** `linhasDR` (2 comunidades, rubricas local/geral, coluna `cclx` = soma, `separar` cria duas linhas por rubrica); `totaisPeriodo` (meses de/até respeitados).
- [ ] **Step 2:** FAIL → implementar `analise.ts` → PASS.
- [ ] **Step 3:** Página (spec 5.5): colunas comunidades|meses, meses de/até, separar local/gerais, expandir rubrica em categorias (`entradasPorCategoria`/`despesasPorCategoria` + classificador), linhas Total, Resultado, Margem, Autossuficiência, exportar Excel.
- [ ] **Step 4:** Teste de render com dados de exemplo (contém "RESULTADO", soma CCLX correta, sem "Vencimentos e encargos").
- [ ] **Step 5:** Commit `feat: demonstração de resultados`.

### Task 5: Página Comparação entre comunidades

**Files:**
- Create: `src/pages/Comparacao.tsx`
- Modify: `src/App.tsx` (rota `analise/comparacao`), `src/components/Layout.tsx`
- Test: `tests/unit/paginas.test.tsx`

**Interfaces:**
- Consumes: `totaisPeriodo` (Task 4).

- [ ] **Step 1:** Página (spec 5.6): tabela ordenável (entradas, saídas, resultado, autossuficiência, défice coberto, média jovens e adultos, entradas por pessoa, custo por pessoa, % dízimos), linha "Gerais por repartir" se existir, linha CCLX; toggle "Incluir parte dos gerais" (sem ele: entradas − geralEntradas, saídas − geralSaidas); barras entradas/saídas; quadrantes (Recharts ScatterChart, diagonal y = x); mapa de calor resultado mês × comunidade em cinzentos.
- [ ] **Step 2:** Teste de render: CCLX = soma, "por pessoa" sem divisão por zero (comunidade sem assistência mostra "—").
- [ ] **Step 3:** `npm test`, `npm run build`; captura visual com Chrome headless.
- [ ] **Step 4:** Commit `feat: comparação entre comunidades`.

### Task 6: Documentação e pull request

- [ ] README: secção "Análise" (rubricas, âmbito, repartição, páginas).
- [ ] `npm test`, `npm run build`, push, pull request, CI verde, perguntar pelo Squash and merge.
