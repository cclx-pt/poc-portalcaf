# 04 · Mapa de ameaças

Versão 1.0 · 26/11/2026 · Portal CAF (CCLX)

## 1. Por onde alguém pode tentar entrar

Risco = impacto se correr mal × facilidade de explorar. Teste de intrusão: nenhum ponto foi testado por terceiros.

| Ponto de entrada | O que pode correr mal | Defesa atual | Risco | Teste de intrusão |
|---|---|---|---|---|
| API do Firestore (qualquer pessoa com login pode chamar o Firestore diretamente, sem o portal) | Ler dados de outra comunidade ou nível; escrever dados com formato errado | Regras por perfil, nível, comunidade e mês fechado, com 38 testes | Alto | Não testado |
| Login por link | Link reencaminhado ou lido por outra pessoa; telemóvel perdido com sessão aberta | Link de uso único; só emails registados; sessão até Sair | Médio | Não testado |
| Índice `acessos` (leitura sem login) | Confirmar se um email concreto tem acesso | Só diz ativo ou não; não se lista | Baixo | Não testado |
| Ecrãs de administração (utilizadores, configuração, segredos) | Conta Master comprometida dá acesso total | Lista fixa de Masters nas regras; email verificado | Alto | Não testado |
| Carregamento de ficheiros (extratos, IFTHENPAY, classificação) | Ficheiro malicioso explora o leitor de Excel; dados errados gravados em massa | Lido no browser de quem carrega (só Master e CAF); pré-visualização antes de gravar; auditoria | Médio | Não testado |
| Formulários (presenças, pedidos, pessoas) | Texto com código (XSS); valores absurdos | React escapa o texto; validação no ecrã; tamanho limitado nos pedidos | Médio | Não testado |
| GitHub Actions e repositório público | Fuga de segredos nos logs; workflow alterado por terceiros | Segredos do GitHub; dados dos pedidos cifrados; só quem tem permissão faz merge | Alto | Não testado |
| Automação dos pedidos (texto dos utilizadores lido por um agente de IA) | Instruções escondidas num pedido levam o agente a fazer outra coisa | Plano aprovado pelo Master antes de qualquer PR; PR revisto antes do merge | Médio | Não testado |
| Página pública | Expor dados por pessoa ou por comunidade | Documento público só com o consolidado do site | Baixo | Não testado |
| Dependências (npm) | Vulnerabilidade conhecida explorada | Nenhuma rotina; 8 vulnerabilidades conhecidas em 26/11/2026 | Médio | Não testado |

## 2. Planeado antes do lançamento

| Ação | Estado |
|---|---|
| Mapear os pontos de entrada | Feito (este documento) |
| Testes automáticos das regras do Firestore | Feito (`npm run test:rules`) |
| Teste de intrusão (externo ou revisão de segurança dedicada) | Por agendar |
| Revisão das dependências vulneráveis | Por fazer |

## 3. Teste de intrusão

| | |
|---|---|
| Problemas em aberto | Ver [05 · Checklist de lançamento](05-checklist-lancamento.md) |
| Resultado | Por agendar |
