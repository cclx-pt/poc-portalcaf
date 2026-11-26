# 03 · Regras de dados

Versão 1.0 · 26/11/2026 · Portal CAF (CCLX)

## 1. Que dados pessoais existem

Só o necessário para a gestão financeira e o registo de presenças.

| Dado | Onde | Nível | Para quê |
|---|---|---|---|
| Nome, NIF, email, telemóvel, IBAN de quem contribui ou pede reembolso | `lotes_conf` (cópia do Jotform) | Confidencial | Conferir contribuições e pagar reembolsos |
| Pseudónimo de quem contribui (ex.: "Contribuinte #A1") | `lotes` | Privado | Análises sem identificar pessoas |
| Nome, telemóvel, NIF, email, comunidade | `pessoas` | Confidencial (só Master e CAF) | Base de referência; identificar a comunidade pelo MB Way do extrato |
| Descritivos bancários (podem ter nomes e telemóveis mascarados, ex.: 966XXX014) | `banco_lotes` | Só Master e CAF | Reconciliação bancária |
| Vencimentos (01.01), donativos a entidades (07.03), donativos recebidos (R3.02) | Categorias confidenciais | Confidencial | Resultados |
| Email e nome de cada utilizador | `users` | Master, CAF e o próprio | Login e permissões |
| Email de quem fez cada ação | `auditoria` | Master e CAF | Rasto das alterações |
| Contagens de presenças (números, sem nomes) | `lotes` (origem assistência) | Privado | Médias e repartições |
| Rascunhos de presenças | `localStorage` do telemóvel, por utilizador | Só no dispositivo | Não perder contagens |

**Nunca guardados:** números de cartão, senhas, dados de saúde. Os pedidos de bugs e melhorias exportados para a automação vão sem o email de quem reportou e cifrados.

## 2. Como são tratados

```
Jotform (só leitura) ──HTTPS──> GitHub Actions ──HTTPS──> Firestore (europe-west1, cifrado em repouso)
Browser (extratos, Excel) ──HTTPS──> Firestore
Firestore ──regras por perfil, nível e comunidade──> Browser
```

- Separação por nível: o mesmo lote existe em `lotes` (sem dados pessoais) e em `lotes_conf` (com dados pessoais); cada perfil só lê o nível que tem.
- Página pública: só o consolidado do site CCLX, sem dados por pessoa.
- Ficheiros carregados ficam no browser; só os movimentos lidos são gravados.

## 3. Quando são apagados

| Regra | Estado |
|---|---|
| Apagar uma pessoa da base `pessoas` | Disponível (Master e CAF), com auditoria |
| Apagar registos de presenças e extratos de meses abertos | Disponível, com auditoria |
| Prazo de conservação definido (ex.: dados de contribuintes X anos depois do fim do ano fiscal) | **Pendente de confirmação** com o CAF e a contabilidade |
| Apagar os dados de uma pessoa a pedido (direito ao apagamento) em todas as coleções (`lotes_conf`, `pessoas`, `banco_lotes`) | Sem procedimento único; **por definir** |
| Dados de quem sai da igreja ou de uma comunidade que termina | Sem regra; **por definir** |

## 4. Lei aplicável

Os dados são de pessoas em Portugal e ficam na União Europeia (Firestore `europe-west1`). Aplica-se o **RGPD** e a lei portuguesa de execução (Lei n.º 58/2019), sob supervisão da CNPD.

| Ponto | Estado |
|---|---|
| Base legal para tratar os dados de contribuintes e membros | **Pendente de confirmação** (interesse legítimo, obrigação fiscal ou consentimento no formulário) |
| Informação aos titulares (aviso de privacidade nos formulários Jotform e IFTHENPAY) | **Pendente de confirmação** |
| Registo das atividades de tratamento | **Pendente de confirmação** |
| Subcontratantes: Google (Firebase), GitHub (alojamento do site, Actions), Jotform, IFTHENPAY | Identificados; contratos e localização do Jotform **pendentes de confirmação** |
