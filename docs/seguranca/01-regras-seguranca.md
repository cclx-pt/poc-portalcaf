# 01 · Regras de segurança

Versão 1.0 · 26/11/2026 · Portal CAF (CCLX)

## 1. O que as pessoas escrevem

Todos os campos são texto ou números tratados como dados, nunca como código.

| Regra | Como está garantido | Estado |
|---|---|---|
| Texto nunca é executado no browser | O React escapa tudo o que mostra. Não há `dangerouslySetInnerHTML`, `innerHTML` nem `eval` no código (`src/`) | Cumprido |
| Valores validados antes de gravar | Formulários validam no ecrã (ex.: `validarPresenca`, `erroPerfil`, `validarPessoa`); números inteiros e não negativos nas presenças; datas sem futuro | Cumprido no ecrã |
| Validação também no servidor | Pedidos de bugs e melhorias: campos permitidos, tipo e tamanho (título ≤ 120, descrição ≤ 4.000) nas regras. Restantes coleções: as regras controlam **quem** escreve e **onde**, mas não o formato de cada campo | Parcial: falta validar o formato dos lotes e dos movimentos nas regras |
| Ficheiros carregados (extratos, Excel IFTHENPAY, classificação) | Lidos só no browser de quem os carrega (exceljs e papaparse); nada é enviado para fora; só os movimentos lidos são gravados | Cumprido |

## 2. Segredos fora do código

O repositório é **público**. Nenhum segredo pode estar no código, nos commits, nos PRs nem nos logs.

| Segredo | Onde vive | Quem acede |
|---|---|---|
| Configuração web do Firebase (apiKey, projectId) | No código (`src/firebase.ts`). Não é segredo: identifica o projeto; a proteção são as regras | Público por desenho |
| Chave da API do Jotform | Firestore `segredos/jotform` | Só Master (regras) |
| Conta de serviço do Firebase | Segredo do GitHub `FIREBASE_SERVICE_ACCOUNT` | Só os workflows do GitHub Actions |
| Chave de cifra dos pedidos | Segredo do GitHub `PEDIDOS_CHAVE` (AES-256-GCM, `scripts/cifra.ts`) | Workflows e tarefa agendada |

Regra para agentes de IA e programadores: nunca pedir, ler, extrair nem guardar credenciais; o utilizador cola-as nos sítios próprios.

## 3. Outras regras

| Regra | Estado |
|---|---|
| Tudo cifrado em trânsito (HTTPS no GitHub Pages e no Firebase) | Cumprido |
| Dados cifrados em repouso (Firestore, por omissão da Google) | Cumprido |
| Dados dos pedidos cifrados nos logs públicos do GitHub Actions | Cumprido (AES-256-GCM) |
| Auditoria de ações sensíveis (gravar, corrigir, apagar, recalcular, importar) só em modo acrescentar | Cumprido (`auditoria`: cria quem está ativo e só com o próprio email; lê só Master e CAF; ninguém altera nem apaga) |
| Regras do Firestore com testes automáticos | Cumprido (`tests/rules`, 38 casos, emulador) |
| Limite de tentativas de login | Do Firebase Authentication (limites próprios do serviço); sem limite configurado pelo portal | Pendente de confirmação |
| Atualizações de dependências todos os meses | Sem rotina nem Dependabot. `npm audit` em 26/11/2026: 8 vulnerabilidades (4 altas em `firebase-admin`, usado só nos scripts do Actions; moderadas em `react-router` e no `uuid` do `exceljs`) | Por fazer |
| Política de segurança de conteúdo (CSP) | O GitHub Pages não permite cabeçalhos; falta uma meta CSP no `index.html` | Por fazer |
| Firebase App Check (só o portal fala com o Firestore) | Não ativado | Por avaliar |
