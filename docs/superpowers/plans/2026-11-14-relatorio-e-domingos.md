# Relatório e domingos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Médias de assistência só aos domingos; exceções de assistência; mapa de domingos sem registo; relatório custos x entradas com assistência, imprimível.

**Architecture:** Lógica pura em `src/lib/domingos.ts` (datas, exceções, domingos em falta) e `src/lib/relatorio.ts` (agregações do relatório). Páginas só leem resumos, lotes de assistência e a nova coleção `assistencia_excecoes`.

**Tech Stack:** React 18 + TypeScript, Firestore, Recharts, Vitest, regras testadas no emulador (CI).

**Spec:** `docs/superpowers/specs/2026-11-14-relatorio-e-domingos-design.md`

## Global Constraints

- Celebrações sempre ao domingo; só registos de domingo entram nas médias.
- Exceções: escrita só Master e CAF; leitura por utilizador ativo; data tem de ser domingo.
- Pessoas sem símbolo de moeda; euros com duas casas; identidade CAF (Montserrat, cinzentos).
- Vencimentos sempre agregados em "Outros custos de funcionamento".

## Review Focus

1. Datas em fuso horário: o dia da semana calcula-se em UTC a partir de AAAA-MM-DD (nunca `new Date('AAAA-MM-DD')` local).
2. Domingo de hoje ainda sem registo conta como em falta? Não: só domingos estritamente anteriores a hoje.
3. Comunidade que começa/termina a meio do ano: só os domingos dentro da vigência.
4. Exceção CCLX e exceção da própria comunidade no mesmo domingo: conta uma vez, não é esperado.
5. Ano anterior sem resumos no relatório: colunas a "—", sem NaN/Infinity.

---

### Task 1: Datas e domingos em falta

**Files:** Create `src/lib/domingos.ts`; Test `tests/unit/domingos.test.ts`; Modify `src/lib/types.ts` (`ExcecaoAssistencia { id; data; ambito: 'cclx' | string; motivo; criadoPor; criadoEm }`).

**Produces:**
- `eDomingo(data: string): boolean`
- `domingosDoAno(ano: number, antesDe: string): string[]` (domingos do ano com data < antesDe)
- `domingosEmFalta(p: { ano: number; hoje: string; comunidades: Comunidade[]; assistencia: Lote[]; excecoes: ExcecaoAssistencia[] }): { comunidadeId: string; esperados: number; comRegisto: number; emFalta: string[] }[]`

- [ ] Testes: 2026 tem 52 domingos até 2026-12-31 exclusive de 2027-01-01 (primeiro 2026-01-04); `eDomingo('2026-11-15')` true; exceção CCLX retira para todas; exceção da comunidade só para ela; Barreiro sem domingos depois de 2026-10-31; registo nesse dia conta; domingo de hoje não conta.
- [ ] FAIL → implementar → PASS → commit.

### Task 2: Médias só aos domingos

**Files:** Modify `src/lib/resumos.ts` (`adultosMedia` do mês e `pesos12m` só com registos cujo `data` é domingo); Modify `src/pages/Assistencia.tsx` (médias, máximo e "mês com maior média" só com domingos; lista mostra todos, com indicação "domingo"/dia); Test `tests/unit/gerais.test.ts`.

- [ ] Teste: registo de sábado (2026-03-07) com 1000 não muda pesos nem `adultosMedia`; registo de domingo conta.
- [ ] Atualizar fixtures dos testes existentes para datas de domingo quando necessário.
- [ ] FAIL → implementar → PASS → commit.

### Task 3: Exceções e mapa de domingos na Assistência

**Files:** Modify `firestore.rules` (`match /assistencia_excecoes/{id}`: read isActive, write master/caf); Modify `tests/rules/firestore.rules.test.ts`; Modify `src/lib/db.ts` (`listarExcecoes`, `gravarExcecao`, `apagarExcecao`); Modify `src/pages/Assistencia.tsx` (secções "Domingos sem registo" e "Domingos sem assistência esperada").

- [ ] Teste de regras: leitor lê; tesoureiro não escreve; CAF escreve.
- [ ] UI: formulário data/âmbito/motivo com validação de domingo; tabela por comunidade (esperados, com registo, em falta, cobertura) e lista de datas em falta.
- [ ] Teste de renderização da Assistência com exceção e domingo em falta.
- [ ] commit.

### Task 4: Relatório custos x entradas

**Files:** Create `src/lib/relatorio.ts`, `src/pages/Relatorio.tsx`; Modify `src/App.tsx` (rota `analise/relatorio`), `src/components/Layout.tsx`, `src/styles.css` (`@media print`); Test `tests/unit/relatorio.test.ts`, `tests/unit/paginas.test.tsx`.

**Produces:** `resumoAnual(resumos: Resumo[], ate: number): { entradas; contribuir; coletas; outrasEntradas; custosFixos; despesas; gerais; saidas; resultado; cobertura: number | null; mediaMensalEntradas; meses: number }` e `mesesDoRelatorio(resumos: Resumo[], ate: number)` com saldo acumulado.

- [ ] Testes: totais = soma dos meses; saldo acumulado; cobertura null sem saídas.
- [ ] Página com as 8 secções do spec; botão Imprimir (`window.print()`); CSS de impressão esconde menu, filtros e botões.
- [ ] Teste de renderização: frase-resumo, sem NaN/Infinity, sem "Vencimentos e encargos".
- [ ] commit.

### Task 5: Pull request, regras e publicação

- [ ] README, `npm test`, `npm run build`, PR, CI verde, Squash and merge (aprovado), publicar regras no Firebase, verificar a página publicada.
