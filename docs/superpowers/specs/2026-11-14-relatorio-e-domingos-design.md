# Relatório custos x entradas com assistência, e domingos sem registo

Data: 14/11/2026 · Estado: proposta para aprovação · Base: ramo da fase 1 de analytics (#10)

## Intenção

1. Ter, no grupo **Análise**, um relatório igual ao que foi feito para Caldas da Rainha (custos x entradas),
   para qualquer comunidade ou para a CCLX, com a assistência incluída, pronto a imprimir ou guardar em PDF.
2. Na **Assistência**, saber em que domingos faltou o registo de presenças, sem contar os domingos em que não
   era esperada assistência (exceções da CCLX inteira ou de uma comunidade).

## Decisões do CAF

- Os cultos (celebrações) são **sempre ao domingo**. É a métrica usada para contar adultos e crianças.

## Proposta que muda números (para confirmar)

- **Médias de assistência só com registos de domingo.** Hoje a média conta todos os registos do
  Registo de Presenças (inclui outros eventos). Passa a contar só os de domingo, na bolsa geral (mesmo mês),
  na repartição dos gerais (12 meses), nos valores por pessoa e no mapa da Assistência.
  Os registos de outros dias continuam visíveis na lista de registos, mas não entram nas médias.

## Desenho

### A. Exceções de assistência

- Nova coleção `assistencia_excecoes`: `{ id, data (AAAA-MM-DD, um domingo), ambito: 'cclx' | comunidadeId, motivo, criadoPor, criadoEm }`.
- Regras: leitura por utilizadores ativos; escrita só Master e CAF.
- Na página Assistência, um quadro "Domingos sem assistência esperada" com criar/editar/apagar
  (data, âmbito "Toda a CCLX" ou uma comunidade, motivo). Datas que não são domingo são recusadas.

### B. Domingos sem registo (página Assistência)

- Para o ano escolhido, até hoje: cada domingo × cada comunidade ativa nessa data e não especial.
- Esperado = domingo sem exceção para a CCLX nem para a comunidade.
- Em falta = esperado e sem nenhum registo de assistência com essa data na comunidade.
- Mostra: tabela por comunidade (esperados, com registo, em falta, cobertura %), e a lista dos domingos em falta
  (data, comunidade). Filtro de comunidade do topo aplica-se.

### C. Relatório custos x entradas (Análise)

Para a comunidade do topo (ou a CCLX consolidada), ano escolhido comparado com o anterior, com a estrutura do
relatório de Caldas da Rainha:

1. Cabeçalho "RELATÓRIO FINANCEIRO · <COMUNIDADE>" e frase-resumo automática (período, cobertura, resultado, assistência).
2. Indicadores: entradas, saídas, resultado, cobertura (entradas ÷ saídas), média de jovens e adultos (variação vs ano anterior).
3. Gráficos: entradas e saídas por ano; entradas médias por mês; composição dos custos fixos.
4. Resumo anual (ano anterior e atual): entradas por origem, custos fixos, despesas, parte dos gerais, resultado,
   cobertura, média mensal, média de jovens e adultos, entradas por pessoa, custo por pessoa, domingos com registo.
5. Tabela mensal: entradas, custos fixos, despesas, parte dos gerais, saldo, saldo acumulado, média de jovens e
   adultos e média total de pessoas (domingos).
6. Custos fixos mensais por rubrica (confidenciais agregados).
7. Pressupostos e notas automáticos: meses contados, contribuições só com Pago preenchido, repartição dos gerais,
   médias só aos domingos, notas "pendente" dos custos fixos.
8. Botão "Imprimir / PDF": versão de impressão com a identidade CAF, sem menu nem filtros, quebras de página limpas.

Dados: resumos (finanças) e lotes de assistência (privado) do ano e do anterior; custos fixos visíveis ao nível do utilizador.

## Não-objetivos

- Gerar o PDF no servidor (usa a impressão do browser).
- Alertas automáticos de domingos em falta (fase de alertas).

## Testes

- Domingos: lista de domingos do ano até hoje; exceção CCLX e exceção por comunidade retiram o domingo;
  comunidade inativa (Barreiro depois de 31/10/2026) não conta; registo nesse dia conta.
- Médias só ao domingo: registo de sábado não entra na média nem nos pesos.
- Relatório: totais anuais = soma dos meses; saldo acumulado; renderização sem "NaN"/"Infinity"; vencimentos agregados.
- Regras: exceções lidas por utilizador ativo, escritas só por Master e CAF.
