# Plano financeiro na app: fase 1

Base: Proposta de Plano Financeiro de Gestão CCLX (v2.1) e decisões do CAF de 18/11/2026 (documento do projeto "Plano Financeiro na app").

## Decisões
- O plano aplica-se também a 2026. O Excel não entra.
- Dimensões (tipo, rubrica, categoria, conta analítica, fornecedor, comunidade, centro de custo, projeto, documento, estado) na classificação dos extratos e nos custos fixos.
- Os extratos classificados entram nos resultados; conciliação com o Jotform (depósitos, reembolsos, IFTHENPAY) para não contar duas vezes; os movimentos financeiros (F1 a F3) ficam fora dos resultados.
- Privado por omissão; confidenciais: 01.01, 07.03, R3.02.
- Barreiro termina em 18/07/2026.

## Desenho (escolhas do construtor)
- O catálogo reutiliza a coleção `categorias`: cada categoria do plano é um documento com `codigo`, `nome` ("02.03 Comunicações"), `tipo` (saida, entrada ou financeiro), `rubrica` ("02 Instalações"), `nivel`, `ambito` e `sinonimos`. Assim o classificador dos resumos continua a funcionar por nome e passa a reconhecer também o nome sem código e os sinónimos (nomes do Jotform).
- Sem correspondência, com o plano carregado, a rubrica é "Por classificar".
- As outras dimensões ficam na coleção `dimensoes` (`tipo`: centro, projeto, fornecedor, conta).
- PR A: catálogo e Configuração. PR B: custos fixos. PR C: classificação dos extratos, conciliação, Repartir e relatórios.
