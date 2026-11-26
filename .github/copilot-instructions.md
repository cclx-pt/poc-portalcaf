# Portal CAF (CCLX) · instruções para agentes de IA

Lê este ficheiro antes de qualquer tarefa. Vale para o GitHub Copilot (VS Code, GitHub.com, coding agent), o Claude Code e qualquer outro agente.
Contexto completo e histórico: [`docs/MEMORIA.md`](../docs/MEMORIA.md). Arquitetura: [`docs/ARQUITETURA.md`](../docs/ARQUITETURA.md). Razões técnicas: [`docs/ESCOLHAS-TECNICAS.md`](../docs/ESCOLHAS-TECNICAS.md). Segurança: [`docs/seguranca/`](../docs/seguranca/README.md).

## 1. O que é

Portal financeiro e administrativo do **CAF** (Conselho Administrativo e Financeiro) da **CCLX**, uma igreja com várias comunidades locais. Junta os dados do Jotform (Contribuir, depósitos de coletas, reembolsos, presenças), os extratos bancários (CGD e Santander) e os pagamentos IFTHENPAY, classifica tudo com o plano financeiro e produz resultados por comunidade, orçamento, fecho mensal e uma página pública.

- Aplicação: https://portalcaf.cclx.pt/ (GitHub Pages, domínio próprio). App de presenças no telemóvel: `#/presencas` (v2) e `#/registar` (v1).
- Repositório **público**: `cclx-pt/poc-portalcaf`. Nunca escrever segredos, dados pessoais ou nomes de pessoas em código, commits, PRs, logs ou documentos.
- Firebase: projeto `cclx-caf-portal` (Authentication por link de email + Cloud Firestore, plano gratuito Spark, `europe-west1`). Sem servidor próprio nem Cloud Functions.

## 2. Regras de trabalho (obrigatórias)

1. **Perguntar sempre antes de cada Squash and merge.** Abrir o PR, esperar pelo CI verde e perguntar "Posso fazer o Squash and merge do #N?". Só fazer merge com um "sim" explícito para esse PR (uma autorização vale só para os PRs nomeados).
2. **Nunca force-push.** Nunca reescrever o histórico de `main`.
3. **Nunca apagar nada no Jotform.** O portal só lê o Jotform; correções ficam no portal.
4. **Nunca tratar credenciais.** Não pedir, ler, extrair ou guardar senhas, tokens ou chaves (incluindo o token do Firebase no IndexedDB). Segredos são colados pelo utilizador nos sítios próprios.
5. **Não usar o travessão meia-risca (carácter Unicode U+2013)** em lado nenhum: código, textos da interface, commits, PRs, documentos. Usar ":", "·", "," ou reescrever a frase.
6. **Português de Portugal (pt-PT)** em tudo o que o utilizador vê e nos documentos. Datas `dd/mm/aaaa`. Valores em euros com 2 casas decimais (`1.234,56 €`).
7. **Vocabulário:** "vencimento" (nunca "ordenado"); "Vencimento Pastoral"; **sem nomes de pessoas** em textos, exemplos, testes ou documentos.
8. Mensagens de commit e descrições de PR em pt-PT. PRs com resumo do que mudou, testes e, no fim, a linha de atribuição do agente.
9. Antes de concluir: `npm test` e `npm run build` (inclui `tsc -b`) sem erros; `npm run test:rules` quando mexer em `firestore.rules`. Testes novos para lógica nova (TDD preferido: teste que falha primeiro).
10. Não alterar regras de negócio, modelo de dados, permissões ou auditoria sem o utilizador pedir. Na dúvida, perguntar.

## 3. Stack e comandos

| | |
|---|---|
| Linguagem | TypeScript 5.9 (strict) |
| UI | React 18, React Router 6 (`HashRouter`), lucide-react, Recharts |
| Build | Vite 6 |
| Testes | Vitest (`tests/unit`), regras do Firestore com o emulador (`tests/rules`, precisa de `firebase emulators`) |
| Dados | Firebase Web SDK 11 (cliente); `firebase-admin` só nos scripts do GitHub Actions |
| Ficheiros | exceljs (Excel), papaparse (CSV) |

```bash
npm ci            # instalar
npm run dev       # portal em http://localhost:5173
npm test          # testes unitários (tests/unit)
npm run test:rules # regras do Firestore no emulador (precisa da Firebase CLI e Java)
npm run build     # tipos (tsc -b) e build de produção
npm run sync      # sincronização do Jotform (precisa de FIREBASE_SERVICE_ACCOUNT; normalmente só no Actions)
```

CI (`.github/workflows/ci.yml`): testes e build em cada PR. Publicação (`pages.yml`): build e deploy no GitHub Pages em cada push para `main`. Sincronização do Jotform (`sync-jotform.yml`): 4 vezes por dia. Automação de pedidos (`pedidos-automacao.yml`).

## 4. Mapa do código

| Pasta | O quê |
|---|---|
| `src/lib/` | Lógica pura e testada: `resumos.ts` (resultados, repartições), `classificacaoBanco.ts` (proposta de classificação dos extratos), `reconciliacaoReembolsos.ts`, `classificacaoTesouraria.ts`, `ifthenpay.ts`, `plano.ts` (plano financeiro: categorias, centros de custo), `presencas.ts`, `domingos.ts` (registos em falta), `pesos.ts`, `pessoas*.ts`, `ficheiros.ts` (leitura CSV/Excel), `db.ts` (acesso ao Firestore), `types.ts` |
| `src/pages/` | Ecrãs do portal. Cada ecrã tem um código no rodapé (`src/lib/ecras.ts`, ex.: `TES-02`) |
| `src/components/` | Componentes partilhados (`ui.tsx`, `Layout.tsx` com o menu, janelas de importação) |
| `src/presencas/` | App **Presenças.** (v2, identidade Midnight & Lime, só dentro de `.pz`). `useRegistoPresenca.ts` tem as regras do registo, partilhadas com o v1 (`src/pages/RegistarPresencas.tsx`) |
| `src/auth/` | `AuthProvider`: sessão, perfil, permissões (`pode(acao)`, `temNivel`) |
| `scripts/` | Sincronização do Jotform e ponte da automação de pedidos (correm no GitHub Actions) |
| `firestore.rules` | **A segurança está aqui**, não no ecrã |
| `docs/` | Arquitetura, escolhas técnicas, especificações e planos (`docs/superpowers/`), segurança, memória |

Convenções: nomes de funções e variáveis em português; funções puras em `src/lib` com testes em `tests/unit`; o ecrã só desenha. Identidade visual CAF (preto, cinzento, Barlow) em todo o portal, exceto a app Presenças.

## 5. Perfis, níveis e segurança

- Perfis: **Master** (lista fixa em `firestore.rules`), **CAF**, **Tesoureiro**, **Leitura**, **Registos** (só presenças).
- Níveis de dados: **Público**, **Privado** (sem dados pessoais), **Confidencial** (nomes, NIF, email, IBAN, vencimentos). Lotes em `lotes` (privado) e `lotes_conf` (confidencial).
- Âmbito por comunidade (`comunidades: ['*']` = todas). Meses fechados (`fechos`) só o Master altera.
- Qualquer mudança de permissões tem de ir ao `firestore.rules` **e** ter teste em `tests/rules`.

### Publicar regras do Firestore (manual, pelo utilizador ou com ele presente)

As regras não se publicam pelo CI. Procedimento usado:
1. Consola Firebase → Firestore → Regras do projeto `cclx-caf-portal`.
2. Confirmar que o texto em produção é igual à versão anterior do repositório (comparar SHA-256).
3. Colar o bloco novo, confirmar o SHA-256 do resultado, **Publicar**, recarregar e voltar a confirmar.

## 6. Regras de negócio que não se podem perder

- **Só categorias CAF.** As categorias do Jotform traduzem-se por regras diretas (A → B, por formulário, igual ou contém; só regras escritas, sem traduções automáticas) em `config/traducaoJotform` (`src/lib/traducaoJotform.ts`, Configuração › Jotform e sincronização) antes de qualquer cálculo, lista ou exportação (`listarLotesCaf` para ler). Os lotes guardam o valor original; nunca regravar lotes traduzidos.
- **Cada euro conta uma vez.** Lotes IFTHENPAY no banco são financeiros (F1.03, contam pelo Contribuir); depósitos de coletas F1.02 (contam pelo Registo de Depósitos); reembolsos F3.02 (contam pelo Registo de Despesas).
- Contribuir, depósitos e reembolsos do Jotform são **definitivos** (contam em todos os meses). Extratos e custos fixos: meses fechados com valores reais, meses abertos com a previsão dos custos fixos.
- Taxa IFTHENPAY (valor menos líquido) é gasto em **03.07 Taxas** (sem ela, 03.03).
- **Centro de custo obrigatório** em tudo o que conta nos resultados (reconciliação, custos fixos, IFTHENPAY). Projeto ou evento, fornecedor e conta analítica são opcionais.
- Classificação dos extratos, por esta ordem: estornos e IFTHENPAY → reembolsos e depósitos → **regras** (a mais específica) → custos fixos (fallback) → memória → transferências recebidas (TFI, MB Way, Trf.Imed) para a Geral (R1.01 se disser "dízimo", senão R1.02).
- Gastos de âmbito "geral" e a bolsa geral (ofertas sem comunidade) repartem-se por mês pelo **peso** de cada comunidade (média ou mediana da assistência de jovens e adultos dos últimos 12 meses, ADM-05).
- Barreiro terminou a 18/07/2026 e passa para a **Moita** (fusão). A comunidade especial `bolsa-geral` chama-se **Geral**.
- Presenças: contagens em branco gravam 0; sem datas futuras; correção só no mesmo mês; registos do Jotform apagados não voltam a ser importados.

## 7. Como pedir e entregar trabalho

- O utilizador refere os ecrãs pelo código do rodapé (ex.: "Ecrã TES-02"). Procurar em `src/lib/ecras.ts`.
- Um PR por tema, pequeno, com testes. Ramo `feat/...` ou `fix/...` a partir de `main` atualizado.
- Ao terminar: resumo curto do que mudou, número do PR, estado do CI, e a pergunta do Squash and merge.
- Atualizar `docs/MEMORIA.md` (secção "Histórico de PRs" e "Decisões") no mesmo PR quando a mudança for relevante.
