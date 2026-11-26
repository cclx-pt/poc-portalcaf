# Portal CAF · Escolhas técnicas

> Registo das decisões técnicas do Portal CAF: o que se escolheu, que alternativas havia, porquê e que consequências tem.
> Estado em 20/11/2026. Complementa o documento [ARQUITETURA.md](ARQUITETURA.md).

## Resumo

| # | Área | Escolha |
|---|---|---|
| 1 | Arquitetura | Aplicação só no browser (SPA), sem servidor próprio |
| 2 | Plataforma | Firebase (Authentication + Cloud Firestore), plano gratuito Spark |
| 3 | Segurança | Regras do Firestore como única barreira de acesso |
| 4 | Modelo de dados | Lotes mensais em vez de um documento por registo |
| 5 | Privacidade | Duas cópias dos dados de origem: com e sem dados pessoais |
| 6 | Login | Link por email, sem senhas e sem Google |
| 7 | Alojamento | GitHub Pages com domínio próprio e `HashRouter` |
| 8 | Integração Jotform | Só leitura, tarefa agendada no GitHub Actions, incremental |
| 9 | Cálculo | No browser, com resultados pré-calculados em `resumos` |
| 10 | Extratos | Lidos no browser, mapa de colunas por conta, ficheiro não guardado |
| 11 | Classificação bancária | Classificador por passos em ordem fixa, com regras e memória |
| 12 | Controlo de períodos | Fecho mensal imposto nas regras |
| 13 | Linguagem e UI | TypeScript, React 18, Vite |
| 14 | Bibliotecas | Recharts, ExcelJS, PapaParse, lucide-react, Barlow |
| 15 | Qualidade | Lógica em funções puras, Vitest e testes das regras no emulador |
| 16 | Entrega | PR por funcionalidade, CI obrigatório, squash and merge com aprovação |
| 17 | Fusão de comunidades | Campo `sucessora` com data de fim |
| 18 | Rascunhos | `localStorage` do dispositivo |
| 19 | Aviso ao sair sem gravar | Componente próprio em vez do bloqueio do router |
| 20 | Gráficos | Paleta própria validada para daltonismo; resto a preto e branco |

---

## 1. Aplicação só no browser (SPA), sem servidor próprio

- **Decisão:** toda a lógica corre no browser; não há API nem servidor aplicacional.
- **Alternativas:** backend próprio (Node, .NET) com base de dados SQL; Cloud Functions.
- **Porquê:** custo zero, nada para manter ou atualizar no servidor, equipa de uma pessoa. O volume de dados (7 comunidades, poucas contas, alguns milhares de registos por ano) cabe no browser.
- **Consequências:** a segurança tem de estar nas regras do Firestore (escolha 3); cálculos pesados correm no computador de quem os pede; a configuração do Firebase no código é pública (não é segredo).

## 2. Firebase no plano gratuito Spark

- **Decisão:** Firebase Authentication e Cloud Firestore, região `europe-west1`, plano Spark.
- **Alternativas:** Supabase (Postgres), Google Sheets como base de dados, Excel partilhado.
- **Porquê:** autenticação sem senhas pronta a usar, regras de segurança declarativas e testáveis, SDK web maduro, região na UE, sem custo para este volume.
- **Consequências:** sem Cloud Functions, sem envio de emails próprios, sem cópias de segurança automáticas; quotas diárias (50 000 leituras, 20 000 escritas). Base de documentos, sem SQL nem chaves estrangeiras.

## 3. Regras do Firestore como barreira de acesso

- **Decisão:** perfis, níveis de privacidade, âmbito por comunidade e meses fechados são verificados em `firestore.rules`. O ecrã só esconde o que não se pode usar.
- **Alternativas:** controlo só na interface; API intermédia.
- **Porquê:** numa SPA qualquer utilizador pode chamar o Firestore diretamente; só as regras garantem a privacidade.
- **Consequências:** permissões descritas em dois sítios (`AuthProvider` e regras), que têm de estar alinhados; testes das regras no emulador em cada PR.

## 4. Lotes mensais

- **Decisão:** registos de origem e movimentos bancários guardados num documento por origem/conta, mês e comunidade, com a lista `registos`.
- **Alternativas:** um documento por registo ou movimento.
- **Porquê:** ler um ano custa dezenas de leituras em vez de milhares; cabe nas quotas do plano gratuito; gravar um mês é uma escrita.
- **Consequências:** cada gravação reescreve o mês inteiro (`setDoc`); limite de 1 MiB por documento; sem bloqueio de concorrência (fica a última gravação).

## 5. Duas cópias dos dados de origem

- **Decisão:** `lotes_conf` guarda os registos com nome, NIF, email, telefone e IBAN; `lotes` guarda os mesmos registos sem esses campos, com um pseudónimo (`pessoaRef`).
- **Alternativas:** um só documento com campos protegidos (o Firestore não permite regras por campo na leitura); cifrar os campos.
- **Porquê:** as regras do Firestore protegem documentos inteiros; separar em duas coleções permite dar o nível privado sem expor dados pessoais.
- **Consequências:** gravações em par (`writeBatch`); o pseudónimo serve para agrupar, não é uma proteção forte.

## 6. Login por link de email

- **Decisão:** Firebase Email Link (sem senha), emails em pt-PT; o login Google foi retirado; ao criar um utilizador é enviado o link de acesso.
- **Alternativas:** email e senha; Google; código numérico por email.
- **Porquê:** não há senhas para guardar ou recuperar; qualquer email serve; o link é de uso único. O código numérico exigiria função no servidor e serviço de email (plano Blaze).
- **Consequências:** o acesso depende da entrega do email; só entra quem tem perfil ativo ou é Master.

## 7. GitHub Pages com `HashRouter`

- **Decisão:** ficheiros estáticos no GitHub Pages, domínio `portalcaf.cclx.pt`, rotas com `#/`.
- **Alternativas:** Firebase Hosting; Vercel; `BrowserRouter` com reescrita de URLs.
- **Porquê:** publicação automática a partir do repositório, sem custo, sem configuração de servidor; o `HashRouter` funciona sem reescrita de URLs.
- **Consequências:** URLs com `#`; o `HashRouter` não suporta `useBlocker` (ver escolha 19).

## 8. Integração com o Jotform

- **Decisão:** o portal só lê o Jotform. Uma tarefa no GitHub Actions corre 4 vezes por dia, lê só as submissões novas e escreve com uma conta de serviço. O Master pode forçar a mesma sincronização no portal. "Reler tudo" relê desde uma data de referência.
- **Alternativas:** webhooks do Jotform (precisam de endpoint no servidor); Cloud Functions agendadas (plano Blaze); importação manual de ficheiros.
- **Porquê:** sem custo e sem servidor; o Jotform continua a ser a fonte dos formulários e nunca é alterado pelo portal.
- **Consequências:** atraso até 6 horas (ou sincronização forçada); um só motor (`sync.ts`) partilhado pela tarefa e pelo portal; segredo da conta de serviço no GitHub; nas presenças, os registos apagados no portal ficam marcados para não voltarem.

## 9. Cálculo no browser e resumos pré-calculados

- **Decisão:** `calcularResumos` (função pura) produz um documento por ano e comunidade em `resumos`; as páginas de análise leem só os resumos.
- **Alternativas:** calcular a cada visita; calcular no servidor.
- **Porquê:** as páginas abrem depressa e com poucas leituras; quem só consulta não precisa de ler dados de origem; a mesma função corre no browser e na tarefa agendada.
- **Consequências:** alterações (custos fixos, periodicidade, regras) só aparecem depois de "Recalcular resumos" ou da sincronização seguinte.

## 10. Extratos lidos no browser

- **Decisão:** o ficheiro CSV ou Excel é lido no browser; o mapa de colunas fica guardado na conta; só os movimentos vão para `banco_lotes`; o ficheiro original não é guardado.
- **Alternativas:** guardar o ficheiro no Firebase Storage; ligação direta aos bancos (open banking).
- **Porquê:** cada banco exporta um formato diferente e o mapa por conta evita repetir a configuração; sem Storage não há mais um serviço nem dados duplicados; open banking exige contratos e custos.
- **Consequências:** o extrato original tem de ser guardado fora do portal se for preciso; avisos de quebra de saldo e escolha dos meses na importação; meses fechados não podem ser reimportados.

## 11. Classificador bancário por passos

- **Decisão:** cada movimento passa por passos em ordem fixa: estornos e IFTHENPAY, ofertas para a Geral, código de reembolso, depósitos, Segurança Social e vencimentos, memória, regras de texto (com divisões por valor fixo ou %), restantes transferências. O resultado é uma proposta que o CAF valida.
- **Alternativas:** classificação manual; aprendizagem automática.
- **Porquê:** previsível e explicável (cada proposta diz de onde veio); as regras são configuráveis no portal; "cada euro conta uma vez" garantido pelas conciliações.
- **Consequências:** a ordem dos passos importa e está em código; novas exceções exigem uma regra ou uma alteração ao classificador.

## 12. Fecho mensal nas regras

- **Decisão:** um documento `fechos/AAAA-MM` com estado `fechado` impede escritas nesse mês em `lotes`, `lotes_conf` e `banco_lotes`, exceto ao Master. Meses fechados usam valores reais; meses abertos mostram a previsão dos custos fixos.
- **Alternativas:** fecho só na interface; cópia congelada dos dados.
- **Porquê:** os valores apresentados à direção não mudam depois de fechados, mesmo que alguém tente gravar diretamente.
- **Consequências:** correções num mês fechado só pelo Master; a página pública mostra só meses fechados.

## 13. TypeScript, React 18 e Vite

- **Decisão:** TypeScript estrito, React 18 com componentes funcionais e hooks, Vite para o build.
- **Alternativas:** Next.js; Angular; JavaScript sem tipos.
- **Porquê:** os tipos partilhados (`types.ts`) evitam erros entre cálculo, gravação e ecrã; Vite dá builds rápidos e estáticos; Next.js não traz vantagem sem servidor.
- **Consequências:** bundle grande (cerca de 1,5 MB); divisão por rotas fica como melhoria.

## 14. Bibliotecas

| Biblioteca | Uso | Porquê |
|---|---|---|
| Recharts | Gráficos | Componentes React declarativos, suficiente para barras e linhas |
| ExcelJS | Ler extratos e custos em Excel; exportar para o contabilista | Lê e escreve .xlsx no browser, com formatação |
| PapaParse | Ler CSV | Robusto com separadores, aspas e ficheiros sem cabeçalho |
| lucide-react | Ícones | Leve e consistente |
| Barlow / Barlow Condensed | Tipografia | Fontes locais (`@fontsource`), sem pedidos a serviços externos |

Escolha geral: poucas dependências, todas a correr no browser, sem serviços de terceiros além do Firebase e do Jotform.

## 15. Qualidade: funções puras e testes

- **Decisão:** a lógica de negócio fica em `src/lib` em funções puras; as páginas só ligam dados e ecrã. Testes com Vitest (lógica e render das páginas) e testes das regras no emulador do Firestore.
- **Porquê:** os cálculos financeiros são a parte de maior risco e podem ser testados sem browser nem base de dados.
- **Consequências:** cada correção de regra de negócio vem com um teste; CI corre build, testes unitários e testes das regras em cada PR.

## 16. Fluxo de entrega

- **Decisão:** um ramo por funcionalidade, PR com descrição, CI verde, **squash and merge só com aprovação explícita**, sem force-push; publicação automática em main.
- **Porquê:** histórico limpo (um commit por funcionalidade), possibilidade de reverter, controlo do que vai para produção.
- **Consequências:** as regras do Firestore publicam-se à parte (`firebase deploy --only firestore:rules`), não no CI.

## 17. Fusão de comunidades por `sucessora`

- **Decisão:** uma comunidade com `fim` e `sucessora` passa os seus registos, custos fixos e peso de assistência para a sucessora depois dessa data (caso Barreiro → Moita).
- **Alternativas:** apagar ou fundir os dados à mão.
- **Porquê:** mantém o histórico intacto e as repartições coerentes.
- **Consequências:** a regra está em código; modelar e configurar regras de distribuição no portal fica para a fase 2.

## 18. Rascunhos no dispositivo

- **Decisão:** as contagens de presenças em curso ficam em `localStorage`, por utilizador, a cada clique, e apagam-se ao gravar.
- **Porquê:** a contagem não se perde se a página fechar, sem gastar escritas no Firestore.
- **Consequências:** o rascunho só existe no dispositivo onde foi feito.

## 19. Aviso ao sair sem gravar

- **Decisão:** componente próprio (`SaidaSemGravar`) que intercepta os cliques em ligações internas quando um ecrã tem alterações pendentes e oferece "Gravar e sair", "Sair sem gravar" ou "Ficar"; mais o aviso do browser ao fechar.
- **Alternativas:** `useBlocker` do React Router (só existe com data routers); mudar para `createHashRouter`.
- **Porquê:** evita reescrever o router; cada ecrã adere com uma linha (`useAvisoSaida`).
- **Consequências:** cobre a navegação por ligações e o fecho da página; os botões Anterior/Seguinte do browser não são intercetados.

## 20. Paleta dos gráficos

- **Decisão:** cores só nos gráficos, com paleta validada para daltonismo e visão normal (`cores.ts`); tabelas e interface seguem a identidade CAF a preto, branco e cinzentos; gráficos sem animação.
- **Porquê:** legibilidade para todos e impressão fiel do relatório, sem quebrar a identidade visual.

---

## Decisões em aberto (fase 2)

- Modelar e configurar no portal as regras de distribuição (fusões, pesos, repartições).
- Cópias de segurança periódicas do Firestore.
- Mover o recálculo pesado para a tarefa agendada ou para Cloud Functions (plano Blaze).
- Divisão do bundle por rotas.
- Harmonizar os formulários Jotform com o plano financeiro.
- Revisão de privacidade (incluindo a força do pseudónimo).
