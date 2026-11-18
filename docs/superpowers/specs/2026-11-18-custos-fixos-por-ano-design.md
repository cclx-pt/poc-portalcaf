# Custos fixos por ano: campo Ano, copiar ano e apagar ano

Pedido do CAF (18/11/2026): cada linha de custo fixo tem o campo Ano, para o filtro geral funcionar; criar a opção de gerar um ano a partir de outro escolhido; apagar as linhas de um ano.

## Decisões
- **Campo `ano`** em cada linha; início e fim são meses dentro desse ano (por omissão jan e dez). Acaba o "em vigor" sem fim. Linhas antigas sem `ano` usam o ano do início (todas as 187 linhas atuais cabem num só ano).
- **Tabela:** coluna Ano; mostra só as linhas do ano do filtro geral (e da comunidade escolhida).
- **Resultados:** cada linha conta só nos meses do seu ano, entre início e fim.
- **Copiar ano…** (janela): ano de origem (o do filtro), ano de destino (por omissão o seguinte, pode ser qualquer outro), atualização % (opcional, 0), comunidades (a do filtro ou todas), pré-visualização; se o destino já tiver linhas dessas comunidades, opção de as substituir.
  - Por comunidade e rubrica copia-se a linha mais recente do ano de origem, como linha de janeiro a dezembro do destino. (Decisão do construtor: uma mudança a meio do ano não se repete no ano seguinte.)
  - Não se copiam linhas que terminaram antes de dezembro do ano de origem, nem comunidades sem nenhum mês ativo no destino (ex.: Barreiro); ficam como avisos.
  - Valor = valor × (1 + atualização/100), com 2 casas decimais. Mantém incidência, âmbito, nível e notas.
- **Apagar linhas de {ano}** (só Master): confirmação com o número de linhas; fica na auditoria.
- **Importar do Excel:** cada coluna de ano gera linhas desse ano, de janeiro a dezembro (o último ano deixa de ficar em vigor).
- Não se gera 2027 automaticamente (decisão do utilizador).
