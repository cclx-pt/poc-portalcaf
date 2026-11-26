# Memória do projeto · Portal CAF

> Para retomar o trabalho noutra ferramenta (VS Code com GitHub Copilot, Claude Code, outro agente) sem perder contexto.
> Estado em 26/11/2026, depois do PR #103. Regras de trabalho: [`.github/copilot-instructions.md`](../.github/copilot-instructions.md).
> Atualizar este ficheiro no mesmo PR sempre que uma mudança for relevante (secções 3 e 4).

## 1. Estado atual

- **Em produção:** https://portalcaf.cclx.pt/ com 103 PRs (102 integrados; o #25 foi fechado sem integrar).
- **Grupos do menu:** Painel · Dados Externos (Contribuir, Depósitos, Reembolsos, Entradas em conjunto) · Tesouraria (Bancos, Reconciliação, Custos Fixos, Orçamento, Fecho, Exportação) · Análise (Demonstração de resultados, Comparação, Relatório custos x entradas) · Registos (Presenças por evento, Registar presenças, Registos em falta, Batismos e Conversões em desenvolvimento) · Administração (Configuração, Utilizadores, Auditoria, Peso das comunidades, Pessoas, Bugs e melhorias).
- **Telemóvel:** `#/presencas` (app Presenças. v2, Midnight & Lime) em paralelo com `#/registar` (v1). Falta decidir quando a v2 passa a ser o link principal (uma linha: redirecionar `#/registar` e o perfil Registos).
- **Dados:** Jotform sincronizado 4 vezes por dia (só leitura). Extratos CGD e Santander carregados no browser. Pagamentos IFTHENPAY importados à mão (Excel). Classificação da tesouraria de janeiro a outubro de 2026 importável na Reconciliação (PR #102).

## 2. Pendentes conhecidos

| Tema | Estado |
|---|---|
| Aplicar a classificação da tesouraria (jan a out 2026) | Botão pronto (TES-02 › Importar classificação da tesouraria); falta o utilizador aplicar e validar por mês |
| Regras dos extratos sem centro de custo | Acrescentar o centro de custo às regras (Configuração › Regras dos extratos), senão as propostas não se validam |
| Utilizadores sem nome | Preencher o nome em Administração › Utilizadores |
| Presenças v2 como link principal | Por decidir |
| Opção de cabeçalho no extrato da Conta investimentos | Por configurar pelo utilizador |
| Pesos inteiros que somem 100% | Ideia em aberto, não decidida |
| Vídeo de formação do registo de presenças | Ideia em aberto (narração ou legendas) |
| Segurança | Ver [`docs/seguranca/05-checklist-lancamento.md`](seguranca/05-checklist-lancamento.md): itens por fazer (teste de intrusão, dependências vulneráveis, retenção de dados, sessão sem limite de tempo) |

## 3. Decisões do CAF e do produto (por data)

| Data | Decisão |
|---|---|
| 14/11/2026 | Custo zero: Firebase Spark, GitHub Pages, GitHub Actions. Segurança nas regras do Firestore. Jotform só de leitura |
| 14/11/2026 | Do Contribuir só contam submissões com PAGO = "PAGO" |
| 15/11/2026 | Tipo de evento que conta como celebração de domingo é configurável |
| 17/11/2026 | Bolsa geral (sem comunidade) entra na rubrica "Outros rendimentos" |
| 18/11/2026 | Plano financeiro v2.1: rubricas, 65 categorias, 15 centros de custo. Tudo Privado exceto 01.01, 07.03 e R3.02 (Confidencial). 02.08 Impostos prediais e 03.07 Taxas acrescentadas |
| 18/11/2026 | Meses fechados com valores reais; meses abertos com previsão dos custos fixos |
| 19/11/2026 | Bolsa geral distribuída por mês pela média de assistência de adultos dos últimos 12 meses |
| 19/11/2026 | Transferências recebidas (TFI, MB Way, Trf.Imed) vão para a Geral: R1.01 se disserem "dízimo", senão R1.02 |
| 19/11/2026 | Barreiro termina a 18/07/2026 e passa para a Moita |
| 19/11/2026 | Login só por link de email (sem Google), emails em pt-PT |
| 23/11/2026 | Contribuir, depósitos e reembolsos do Jotform são definitivos (contam em todos os meses) |
| 25/11/2026 | Peso das comunidades por mês, por média ou mediana (ADM-05). Recalcular só Master e CAF, sempre auditado |
| 25/11/2026 | Regras dos extratos antes dos custos fixos (que passam a fallback) |
| 25/11/2026 | Base de Pessoas confidencial (só Master e CAF): uma linha por telemóvel e email, sem gravar sem nome nem telemóvel |
| 26/11/2026 | Pagamentos IFTHENPAY importados com comunidade, categoria e centro de custo; taxa em 03.07 Taxas |
| 26/11/2026 | Centro de custo obrigatório em todas as classificações que contam nos resultados |
| 26/11/2026 | Nome obrigatório no registo de utilizadores |
| 26/11/2026 | Ao importar extratos, o portal sugere regras a partir das repetições do histórico; as regras ficam em Configuração e são usadas na proposta de classificação |
| 26/11/2026 | App Presenças. (v2) com identidade própria Midnight & Lime, aprovada na especificação UI/UX 1.2; o resto do portal mantém a identidade CAF |

## 4. Histórico de PRs

Data = dia da integração em `main`. Os detalhes completos estão em cada PR no GitHub.

### Fundação (14/11/2026)
- **#1** PoC do Portal CAF: perfis (Master, CAF, Tesoureiro, Leitura), níveis de privacidade, página pública, identidade CAF.
- **#2** CRUD de comunidades, contas bancárias e categorias; apagar bloqueado quando há dados; IBAN.
- **#3** Importação automática do Jotform pelo GitHub Actions (4 vezes por dia), tesoureiros só de consulta.
- **#4** Domínio próprio portalcaf.cclx.pt.
- **#5** Sincronização incremental e "Sincronizar agora".
- **#6** Contribuir: só submissões PAGO.
- **#7** Entradas em conjunto (Contribuir + depósitos) e mapa mensal da assistência.
- **#8** Página pública: sem login só o consolidado; com login, cada comunidade.
- **#9** Botão "Reler tudo" do Jotform.
- **#10** Análise fase 1: rubricas, âmbito local ou geral, repartição dos gerais, demonstração de resultados, comparação entre comunidades.
- **#11** Relatório custos x entradas, domingos sem registo e exceções de assistência.

### Interface e presenças (15 a 17/11/2026)
- **#12** Formatos contabilísticos, tabelas e acessibilidade.
- **#13** Tipo de celebração configurável.
- **#14** "Reler tudo" pede a data de referência.
- **#15** Grupo Registos, Configuração por separadores, âmbito por comunidade nos utilizadores.
- **#16** Paleta dos gráficos validada para daltonismo; Batismos e Conversões em desenvolvimento.
- **#17** Registar presenças no portal, com tipos de evento configuráveis.
- **#18** Bolsa geral na rubrica Outros rendimentos.
- **#19** Perfil Registos e link direto `#/registar` para telemóvel.
- **#20** Corrigir registos de presenças (última alteração e auditoria).
- **#21** Campos de data com calendário (dd/mm/aaaa).
- **#22** Configuração de eventos ao estilo Church Metrics.
- **#23** Contador por toque e rascunho no dispositivo.
- **#24** Custos fixos: incidência, âmbito geral, importação do Excel.
- **#25** (fechado sem integrar) Registo de presenças adaptativo; substituído por PRs seguintes.

### Estilo, bancos e plano financeiro (18/11/2026)
- **#26** Estilo na linha de agenda.cclx.pt (Barlow, paleta CAF).
- **#27** Menu lateral recolhível, grupos que abrem e fecham.
- **#28** Bancos: CGD + Santander por mês, filtros, limpar extratos.
- **#29** Saldos, verificação dos extratos e previsão.
- **#30** Custos fixos por ano: copiar e apagar ano.
- **#31** Custos fixos: gráfico por rubrica e totais.
- **#32** Comunidade Geral nos custos fixos (repartida por todas).
- **#33 a #35** Plano financeiro: catálogo e dimensões; custos fixos com o plano; classificação dos extratos (estados por classificar, proposto, validado, rever).
- **#36** 02.08 Impostos prediais e 03.07 Taxas; taxa IFTHENPAY em 03.07.
- **#37** Bancos e Reconciliação bancária em ecrãs separados.

### Reconciliação e regras (19/11/2026)
- **#38** Meses fechados reais, meses abertos com previsão.
- **#39** Mapeamento do extrato e logótipo por conta.
- **#40** Código do reembolso (Unique ID) cruza com o banco.
- **#41** Limpar extrato só em meses abertos.
- **#42** TFI, Trf. MB WAY e Trf.Imed recebidas para a Geral.
- **#43** Itemização de um movimento em várias linhas.
- **#44** Dízimos quando o descritivo o indica.
- **#45** Guardar regra a partir do detalhe do movimento.
- **#46** Vencimentos comparados com o valor mensal total de cada custo fixo.
- **#47** Bolsa geral pela média de adultos dos últimos 12 meses.
- **#48** Vencimentos com o mesmo valor: regra com comunidade desempata.
- **#49** Filtro por descrição na reconciliação.
- **#50** Despesas com data da fatura no futuro contam na data de submissão.
- **#51** Extratos sem cabeçalho, saldos em falta e avisos antes de gravar.
- **#52** Presenças (filtros, domingos em falta, médias por evento) e filtros do Jotform.
- **#53** Contagem obrigatória e registos em falta; ver registos do Jotform na reconciliação.
- **#54** KPI de registos em falta.
- **#55** Duplicados de presenças; Jotform só traz submissões novas.
- **#56** Registos em falta como página própria.
- **#57** Erros a amarelo e cursor no primeiro campo com erro.
- **#58** Ordem dos KPI das presenças.
- **#59** Registos sem a comunidade Geral no filtro.
- **#60** Presenças por comunidade: % do total, médias sem decimais.
- **#61** Login só por link em pt-PT; email de acesso ao criar utilizador; contagens em branco a 0.
- **#62** Fusão de comunidades (Barreiro → Moita).
- **#63** Amostra do extrato; ordem das colunas nas categorias e regras.
- **#64** Filtro por contagem; mês com menor média; registados de possíveis.
- **#65** Painel: custos fixos anuais e mensais com a parte do geral.

### Operação e automação (20 a 23/11/2026)
- **#66** Periodicidade dos custos fixos; divisões com valor fixo ou %; aviso ao sair sem gravar.
- **#67** Código de referência em cada ecrã (ex.: TES-02).
- **#68** Registo de bugs e melhorias com gestão na administração.
- **#69** Botões alinhados em toda a app.
- **#70** Análise automática dos pedidos, aprovação do Master e PR automático.
- **#71** Ponte dos pedidos com resultado cifrado no log (repositório público).
- **#72** Login não envia o link a quem não está registado (índice `acessos` por SHA-256).
- **#73 a #75** REG-02 e REG-01: históricos colapsáveis, registos em falta no ecrã, registados de esperados.
- **#76** Ordem do menu.
- **#77 a #79** Painel: com previsões ou só meses fechados; ligar e desligar componentes; valores reais até hoje.
- **#80** Análises com valores reais até hoje; gráficos divergentes de entradas e saídas.
- **#81** Contribuir, depósitos e reembolsos definitivos; consolidação Jotform e extratos.

### Administração, reembolsos e pessoas (25/11/2026)
- **#82** ADM-05: peso das comunidades por mês, média ou mediana.
- **#83** Importação manual do Jotform num ecrã de integrações (depois movida pelo #86).
- **#84** Recalcular só Master e CAF, sempre auditado.
- **#85** Pesos gravados em % ou pessoas, sem decimais.
- **#86** Importação manual do Jotform em Configuração › Jotform e sincronização (ADM-01.3).
- **#87** Motor de reconciliação dos reembolsos MB Way sem Unique ID.
- **#88** Separador "Reembolsos MB Way" na reconciliação e janela de datas configurável.
- **#89** Botão Validar nas propostas completas.
- **#90** Regras dos extratos primeiro, custos fixos em fallback; movimentos "rever" automáticos voltam a ser propostos.
- **#91** Base de Pessoas confidencial (ADM-06).
- **#92** Pessoas: uma linha por telemóvel e email; apagar tudo ou a lista filtrada.
- **#93** Máscara MB Way (966XXX014) identifica pessoa e comunidade no extrato.
- **#94** Custos fixos: vista anual ou mensal, gráfico e tabela lado a lado.
- **#95** Menu "Contribuir".
- **#96** Pesos: Gravado, Média ou Mediana na tabela anual.
- **#97** Indicar se o extrato tem linha de cabeçalho.

### IFTHENPAY, classificação e Presenças v2 (26/11/2026)
- **#98** Importar pagamentos dos formulários IFTHENPAY (uma só vez por pedido), com comunidade, categoria e centro de custo.
- **#99** Grupo do menu "Dados Externos".
- **#100** Centro de custo obrigatório (reconciliação, custos fixos, IFTHENPAY); IFTHENPAY com projeto, fornecedor e conta analítica.
- **#101** Nome obrigatório no registo de utilizadores.
- **#102** Importar a classificação da tesouraria (Excel) como proposta; cria categorias, centros de custo, projetos, fornecedores e contas analíticas em falta.
- **#103** App Presenças. (v2) em `#/presencas`; regras do registo partilhadas com o v1 (`useRegistoPresenca`).
- **#104** Instruções para agentes (Copilot, Claude), esta memória e os documentos de segurança.
- **#105** Regras dos extratos sugeridas pelo histórico consolidado (movimentos validados que se repetem em 3 meses ou mais com a mesma classificação), ao importar um extrato e em Configuração › Regras dos extratos; regras com projeto e conta analítica.

## 5. Onde está o resto

| O quê | Onde |
|---|---|
| Arquitetura e diagramas | `docs/ARQUITETURA.md` |
| Porquê de cada escolha técnica | `docs/ESCOLHAS-TECNICAS.md` |
| Automação dos pedidos | `docs/AUTOMACAO-PEDIDOS.md` |
| Especificações e planos aprovados | `docs/superpowers/specs`, `docs/superpowers/plans` |
| Segurança (5 documentos) | `docs/seguranca/` |
| Códigos dos ecrãs | `src/lib/ecras.ts` |
| Plano financeiro (categorias, centros de custo) | `src/lib/plano.ts` |
