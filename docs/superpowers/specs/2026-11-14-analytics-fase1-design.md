# Analytics, fase 1: rubricas, demonstração de resultados e comparação entre comunidades

Data: 14/11/2026 · Estado: proposta para aprovação · Repositório: cclx-pt/poc-portalcaf

## 1. Intenção

A CCLX é uma igreja multisite. O CAF e a direção precisam de ver as finanças em dois níveis:
o **site (CCLX)** e cada **comunidade**. Querem comparar comunidades entre si e ver entradas
contra saídas numa **demonstração de resultados**.

Uma comunidade não vive só do que regista localmente. Há custos e proveitos **gerais**, da
igreja toda, que têm de ser repartidos para o resultado de cada comunidade ser justo.

## 2. Decisões do CAF (registadas nesta conversa)

- **Âmbito de cada categoria: local ou geral.** "Geral" é tudo o que está numa categoria
  classificada como geral, de entrada ou de saída, qualquer que seja a comunidade indicada no registo.
- **Local:** fica na comunidade onde foi registado.
- **Geral:** reparte-se pelas comunidades conforme a **média de assistência de jovens e adultos
  dos últimos 12 meses** (até ao mês em causa, inclusive).
- **Indicadores "por pessoa":** usam a mesma média de jovens e adultos.
- **Forma de construir escolhida (abordagem 1):** a repartição é calculada nos resumos mensais,
  que já existem, para que todos os painéis, a página pública e a exportação usem os mesmos números.

## 3. Objetivos, não-objetivos e anti-objetivos

**Objetivos**
1. Cada categoria passa a ter **rubrica** e **âmbito** (local/geral), editáveis na Configuração.
2. Os resumos mensais passam a incluir, por comunidade, a parte local e a parte recebida dos gerais, por rubrica.
3. Nova página **Demonstração de resultados**.
4. Nova página **Comparação entre comunidades**.

**Não-objetivos (fases seguintes)**
- Posição financeira (saldos bancários), visão CCLX com previsto vs real, painel por comunidade.
- Analytics de assistência, contribuintes, alertas.
- Detalhe até ao registo individual na demonstração de resultados (fica até à categoria).

**Anti-objetivos (seria falhar mesmo que funcionasse)**
- Números diferentes entre páginas para o mesmo período e comunidade.
- Valores confidenciais (vencimentos, Segurança Social) visíveis a quem tem nível Privado.
- Repartir gerais por comunidades inativas no mês (ex.: Barreiro depois de 31/10/2026) ou sem assistência.
- Contar duas vezes: o total CCLX tem de ser igual antes e depois da repartição.

## 4. Abordagens consideradas

| | Abordagem | Trade-off |
|---|---|---|
| **1 (escolhida)** | Repartição calculada no recálculo dos resumos | Uma só fonte de verdade; respeita os níveis de privacidade. Mudar o âmbito de uma categoria obriga a recalcular (o portal fá-lo ao guardar). |
| 2 | Repartição calculada no ecrã | Mais simples de mudar, mas os números ficam diferentes dos outros painéis, e quem tem nível Privado não vê os gerais confidenciais. |
| 3 | Coleção própria de analytics | Mesmo resultado que a 1, com mais escritas e mais código a manter. |

## 5. Desenho

### 5.1 Rubricas (proposta, ajustável)

Lista fixa no código, com o nome editável só por alteração de código nesta fase.

| Tipo | Rubricas |
|---|---|
| Rendimentos | Dízimos · Ofertas · Outras contribuições · Pagamentos (eventos, inscrições) · Outros rendimentos |
| Gastos | Vencimentos e encargos · Instalações (renda, água, luz, internet) · Consumíveis e funcionamento · Donativos e ofertas (missões, ação social) · Atividades e eventos · Outros gastos |

Mapeamento inicial das categorias existentes (aplicado só a categorias sem rubrica; o que foi editado não muda):

| Categoria | Rubrica |
|---|---|
| Dízimos | Dízimos |
| Ofertas, Coletas em dinheiro | Ofertas |
| Missões, Ação social, Obras (entrada) | Outras contribuições |
| Eventos (entrada) | Pagamentos (eventos, inscrições) |
| Outras entradas | Outros rendimentos |
| Vencimentos, Segurança Social | Vencimentos e encargos |
| Renda, Luz, Água, Internet | Instalações |
| Comissões bancárias | Consumíveis e funcionamento |
| Missões, Ação social (saída) | Donativos e ofertas |
| Cultos, Jovens, Crianças, Eventos (saída) | Atividades e eventos |
| Outras despesas | Outros gastos |

Âmbito inicial: **local** em todas. O CAF marca as gerais na Configuração.

**Categorias que não existem na lista** (ex.: categorias de reembolsos vindas do Jotform, sem
correspondência pelo nome): rubrica "Outros rendimentos" ou "Outros gastos", âmbito local.
A correspondência é feita pelo nome normalizado (sem acentos nem maiúsculas) e pelo tipo.

**Custos fixos:** a rubrica do custo fixo (ex.: "Renda") é tratada como o nome da categoria de
saída com o mesmo nome. Se essa categoria for geral, o custo fixo é geral.

### 5.2 Modelo de dados

`Categoria` ganha dois campos opcionais:
- `rubrica?: string` (uma das rubricas da tabela)
- `ambito?: 'local' | 'geral'` (por defeito `local`)

`ResumoMes` ganha:
- `rubricas: { entrada: Record<string, { local: number; geral: number }>; saida: Record<string, { local: number; geral: number }> }`
  - `local` = valores registados nesta comunidade em categorias locais;
  - `geral` = parte recebida da repartição dos gerais.
- `geralEntradas`, `geralSaidas`: totais recebidos dos gerais.
- `pesoGeral: number | null`: a % desta comunidade na repartição desse mês (0 a 1).
- `adultosMedia12m: number | null`: média de jovens e adultos por registo nos últimos 12 meses.

Os totais existentes mudam de significado, de forma coerente:
- `entradas` = entradas locais + quota da bolsa geral + `geralEntradas`.
- `saidas` = saídas locais + `geralSaidas`.
- Os valores gerais saem da comunidade onde foram registados (não contam duas vezes).

Os campos atuais (`contribuir`, `coletas`, `despesas`, `custosFixos`, `entradasPorCategoria`,
`despesasPorCategoria`, `custosRubricas`) mantêm-se e continuam a mostrar o que foi registado
localmente, para as páginas existentes não mudarem de comportamento.

### 5.3 Repartição dos gerais

Para cada mês do ano:
1. **Bolo geral do mês:** todas as entradas e saídas em categorias gerais, de qualquer comunidade
   (incluindo a Sede), e os custos fixos gerais. A bolsa geral (entradas sem comunidade) mantém a
   regra própria: repartida pela média do **mesmo mês**, como já decidido. Os registos sem
   comunidade seguem sempre a regra da bolsa, mesmo que a categoria seja geral (não entram no bolo
   geral, para não serem repartidos duas vezes).
2. **Pesos:** para cada comunidade ativa nesse mês e não especial, a média de jovens e adultos por
   registo nos 12 meses que terminam nesse mês (soma das presenças a dividir pelo número de
   registos). Uma comunidade sem registos nesse período tem peso 0. Nos primeiros meses com dados,
   usam-se os meses que existirem.
3. **Repartição:** cada rubrica do bolo é repartida pelos pesos. Arredondamento a cêntimos; a
   última comunidade recebe a diferença, para a soma bater certo.
4. **Sem pesos** (nenhuma comunidade com assistência): o bolo fica num resumo especial
   **"Gerais por repartir"** (`gerais`), como a bolsa geral, e aparece assinalado nos painéis.

Para os 12 meses atravessarem o ano, o cálculo recebe também a assistência do ano anterior.

### 5.4 Privacidade

- Os resumos são de nível Privado. As categorias de nível **Confidencial** (Vencimentos,
  Segurança Social) entram nas rubricas dos resumos como **"Outros custos de funcionamento"**,
  agregadas, como já acontece hoje nos custos fixos.
- Consequência: a rubrica "Vencimentos e encargos" não aparece nos painéis desta fase; o valor
  conta nos totais dentro de "Outros custos de funcionamento". (Decisão minha, ver secção 7.)
- Página pública: os totais passam a incluir a repartição; o total CCLX não muda.

### 5.5 Página "Demonstração de resultados"

Menu: novo grupo **Análise**, item "Demonstração de resultados" (nível Privado).

```
Demonstração de resultados 2026            [Colunas: Comunidades | Meses] [De jan] [Até dez]
                                            [ ] Separar local e parte dos gerais

Rubrica                      Almada  Moita  Porto  …  Caldas   CCLX
RENDIMENTOS
  Dízimos                    …
  Ofertas                    …
  …
  Total de rendimentos
GASTOS
  Instalações                …
  Outros custos de funcionamento …
  …
  Total de gastos
RESULTADO                    …                                  …
Margem (resultado / rendimentos)
Autossuficiência (rendimentos / gastos)
```

- **Colunas = comunidades:** uma coluna por comunidade ativa no período, mais o total CCLX
  (inclui "Gerais por repartir" se existir).
- **Colunas = meses:** para a comunidade escolhida no topo, ou para a CCLX se estiver "todas".
- **Separar local e parte dos gerais:** cada rubrica desdobra-se em duas linhas.
- **Clicar numa rubrica:** mostra as categorias que a compõem (a partir dos resumos).
- Exportação para Excel do que está no ecrã.

### 5.6 Página "Comparação entre comunidades"

Menu: grupo **Análise**, item "Comparação entre comunidades" (nível Privado).

Filtros: meses de/até (o ano vem do topo), "Incluir parte dos gerais" (por defeito sim).

1. **Tabela ordenável** (uma linha por comunidade, linha CCLX no fim):
   entradas · saídas · resultado · autossuficiência (%) · défice coberto pelo orçamento geral (€) ·
   média de jovens e adultos · entradas por pessoa · custo por pessoa · % das entradas em dízimos.
   - "Por pessoa" = valor do período a dividir pela média de jovens e adultos do período.
2. **Gráfico de barras:** entradas e saídas por comunidade.
3. **Gráfico de quadrantes:** entradas por pessoa (x) contra custo por pessoa (y); a diagonal
   separa quem se sustenta de quem precisa de apoio.
4. **Mapa de calor:** resultado por mês (colunas) e comunidade (linhas), em tons de cinzento da
   identidade CAF (negativos assinalados).

### 5.7 Configuração

- Tabela de categorias ganha as colunas **Rubrica** e **Âmbito**, editáveis no formulário.
- "Inicializar" passa a preencher a rubrica das categorias que não a têm (sem mudar as editadas).
- Ao guardar uma categoria com rubrica ou âmbito alterados, o portal recalcula os resumos do ano
  atual e do anterior e diz quando terminou.

## 6. Testes

- Repartição: peso pela média de 12 meses a atravessar o ano; comunidade sem assistência recebe 0;
  comunidade inativa não recebe; soma conservada ao cêntimo; sem pesos vai para "Gerais por repartir".
- Categorias: mapeamento inicial; categoria desconhecida vai para "Outros…", local; custo fixo segue o âmbito da categoria com o mesmo nome.
- Privacidade: categoria confidencial aparece só como "Outros custos de funcionamento".
- Total CCLX igual com e sem repartição.
- Renderização das duas páginas com dados de exemplo, sem erros.

## 7. Decisões minhas (para o CAF confirmar ao ler)

1. Vencimentos e Segurança Social aparecem agregados em "Outros custos de funcionamento" (privacidade).
2. A bolsa geral mantém a média do mesmo mês; só os gerais usam 12 meses.
3. Categorias sem correspondência ficam em "Outros…", âmbito local.
4. A média de 12 meses é por registo (soma das presenças a dividir pelo número de registos), igual à regra atual da bolsa.
5. Sem nenhuma comunidade com assistência, os gerais ficam em "Gerais por repartir".
6. Lista de rubricas fixa nesta fase (alterar exige código).
7. O Painel e o Orçamento (previsto vs real) passam a ler os totais já com a parte dos gerais,
   porque usam os mesmos resumos. É o objetivo de ter uma só fonte de verdade, mas o "real" de cada
   comunidade vai mudar assim que houver categorias gerais.
8. Na Comparação entre comunidades, "Gerais por repartir" (se existir) aparece numa linha
   própria, acima da linha CCLX, para o total bater certo.

## 8. Para o construtor decidir

Estrutura interna das funções, nomes de componentes, estilos dentro da identidade CAF
(Montserrat, escala de cinzentos), biblioteca de gráficos (a que o projeto já usa, Recharts).
