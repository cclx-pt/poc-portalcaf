# 05 · Checklist de lançamento

Versão 1.0 · 26/11/2026 · Portal CAF (CCLX)

O portal já está em uso. Esta lista diz o que está garantido e o que falta para o considerar fechado do ponto de vista de segurança.

## 1. Estado dos quatro documentos

| Documento | Estado |
|---|---|
| [01 · Regras de segurança](01-regras-seguranca.md) | Construído, com pontos por fazer |
| [02 · Regras de login](02-regras-login.md) | Construído; tempo de sessão por decidir |
| [03 · Regras de dados](03-regras-dados.md) | Construído; retenção e RGPD por confirmar |
| [04 · Mapa de ameaças](04-mapa-ameacas.md) | Mapeado; teste de intrusão por agendar |

## 2. Checklist

### Feito
- [x] Login só por link, email verificado, só emails registados.
- [x] Perfis, níveis e âmbito por comunidade impostos nas regras do Firestore.
- [x] Testes automáticos das regras (`npm run test:rules`).
- [x] Meses fechados só alteráveis pelo Master.
- [x] Auditoria só em modo acrescentar.
- [x] Segredos fora do código (Firestore só Master, segredos do GitHub); dados dos pedidos cifrados.
- [x] HTTPS em todo o lado; dados cifrados em repouso; dados na UE (`europe-west1`).
- [x] Nenhum texto executado como código (React, sem `innerHTML`).

### Por fazer (por ordem de prioridade)
- [ ] **Teste de intrusão** ou revisão de segurança dedicada às regras do Firestore e aos ecrãs de administração.
- [ ] **Dependências:** atualizar `firebase-admin`, `react-router` e rever o `exceljs`; ativar o Dependabot e rever as atualizações todos os meses.
- [ ] **Tempo de sessão:** decidir e implementar a saída automática (proposta: 8 horas no portal).
- [ ] **Retenção e RGPD:** prazos de conservação, procedimento de apagamento a pedido, base legal e aviso de privacidade nos formulários.
- [ ] **Validação do formato dos dados nas regras** (lotes, movimentos, custos fixos), não só de quem escreve.
- [ ] **CSP** (meta no `index.html`) e avaliar o **Firebase App Check**.
- [ ] Rever as contas Master (lista fixa nas regras) e ativar a verificação em dois passos nas contas Google desses emails.

## 3. Quem assina

| Papel | Nome | Data |
|---|---|---|
| Responsável do CAF | Pendente de confirmação | |
| Master do portal | Pendente de confirmação | |
