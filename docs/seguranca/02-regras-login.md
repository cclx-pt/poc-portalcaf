# 02 · Regras de login

Versão 1.0 · 26/11/2026 · Portal CAF (CCLX)

## 1. Quem entra

Entrada **só por link de acesso enviado por email** (sem senha), pelo Firebase Authentication, em português de Portugal.

| Passo | Regra | Onde |
|---|---|---|
| Pedir o link | Só emails registados e ativos recebem o link. O ecrã consulta o índice `acessos/{SHA-256(sal + email)}`, que diz apenas se o acesso está ativo | `src/pages/Login.tsx`, `src/lib/acessos.ts` |
| Abrir o link | O link é de uso único e deve ser aberto no mesmo dispositivo; noutro dispositivo pede para confirmar o email | Firebase Authentication |
| Email verificado | As regras exigem `email_verified == true` | `firestore.rules` (`signedIn`) |
| Perfil ativo | Sem perfil ativo em `users/{email}` não há acesso a nada além da página pública | `firestore.rules` (`isActive`) |
| Master | Lista fixa de emails nas regras (não depende de perfil gravado) | `firestore.rules` (`isMaster`) |

Quem cria utilizadores: só o Master (Administração › Utilizadores), com nome obrigatório.

## 2. Quanto tempo fica a sessão

| Regra | Estado |
|---|---|
| A sessão mantém-se no dispositivo até a pessoa carregar em Sair (persistência por omissão do Firebase) | Em vigor |
| Saída automática depois de um período (ex.: 8 horas) | **Não existe.** Por decidir com o CAF: um telemóvel partilhado ou perdido fica com a sessão aberta |
| Desativar um utilizador corta o acesso aos dados de imediato | Cumprido: as regras verificam o perfil em cada pedido |

## 3. O que cada perfil vê e faz

Âmbito por comunidade: cada perfil (menos Master e CAF) vê só as comunidades atribuídas. Meses fechados só o Master altera.

| Área | Master | CAF | Tesoureiro | Leitura | Registos |
|---|---|---|---|---|---|
| Página pública (consolidado) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Resumos e análises (nível Privado) | ✓ | ✓ | ✓ (suas comunidades) | conforme o nível | ✗ |
| Dados confidenciais (nomes, NIF, IBAN, vencimentos) | ✓ | ✓ | conforme o nível | conforme o nível | ✗ |
| Registar e corrigir presenças | ✓ | ✓ | ✗ | ✗ | ✓ (suas comunidades) |
| Importar e alterar dados, custos fixos, orçamento, fecho | ✓ | ✓ | ✗ | ✗ | ✗ |
| Bancos e reconciliação | ✓ | ✓ | ✗ | ✗ | ✗ |
| Pessoas (base confidencial) | ✓ | ✓ | ✗ | ✗ | ✗ |
| Utilizadores, segredos, configuração geral, meses fechados | ✓ | ✗ | ✗ | ✗ | ✗ |
| Auditoria (ler) | ✓ | ✓ | ✗ | ✗ | ✗ |

Fonte da verdade: `firestore.rules` e `src/auth/AuthProvider.tsx` (ações por perfil). Testes: `tests/rules/firestore.rules.test.ts`.

## 4. Pontos a decidir

| Ponto | Proposta |
|---|---|
| Tempo máximo de sessão | Terminar a sessão após 8 horas (ou 30 dias no perfil Registos, no telemóvel); pedir decisão ao CAF |
| Índice `acessos` | Permite confirmar se um email conhecido tem acesso (o sal está no código público). Aceite como compromisso para não enviar links a desconhecidos; reavaliar |
