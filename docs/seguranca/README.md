# Segurança do Portal CAF

Cinco documentos curtos, no modelo "assinar antes de escrever código": o que está garantido, onde está no código e o que falta.
Estado em 26/11/2026 (main depois do PR #103). Tudo o que não está confirmado aparece como **Pendente de confirmação**.

| N.º | Documento | Pergunta a que responde |
|---|---|---|
| 01 | [Regras de segurança](01-regras-seguranca.md) | Como se trata o que as pessoas escrevem, os segredos e as atualizações? |
| 02 | [Regras de login](02-regras-login.md) | Quem entra, durante quanto tempo e o que cada perfil vê? |
| 03 | [Regras de dados](03-regras-dados.md) | Que dados pessoais existem, onde ficam, como se protegem e quando se apagam? |
| 04 | [Mapa de ameaças](04-mapa-ameacas.md) | Por onde alguém pode tentar entrar e quão arriscado é cada ponto? |
| 05 | [Checklist de lançamento](05-checklist-lancamento.md) | O que está feito, o que falta e o que bloqueia? |

Princípio base: **a segurança está nas regras do Firestore (`firestore.rules`), não no ecrã.** Esconder um botão não protege nada; o servidor do Firebase recusa o que as regras não permitem, venha o pedido do portal ou de qualquer outro programa.

Rever estes documentos sempre que uma mudança mexer em login, perfis, regras do Firestore, dados pessoais ou integrações.
