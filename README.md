# AvaliaBot

Bot de WhatsApp que pede avaliação no Google depois do atendimento e filtra a experiência antes de mandar o link.

## Problema

Negócios locais dependem de nota no Google, mas cliente satisfeito quase nunca avalia sozinho, e pedir manualmente para cada um não escala. Mandar o link para todo mundo também é arriscado: quem teve problema vai direto para a avaliação pública.

## Como funciona

1. O negócio cadastra o contato no painel (ou via API) depois do atendimento.
2. O bot manda uma mensagem pedindo uma nota de 1 a 5.
3. **Nota 4 ou 5:** recebe o link direto para avaliar no Google. Se responder "pronto" ou "avaliei", recebe um agradecimento.
4. **Nota 1 a 3:** o bot pede o que deu errado e guarda o feedback para o dono resolver, em vez de mandar para a avaliação pública.
5. Tarefas agendadas (`node-cron`) mandam lembrete ao dono e fazem o follow-up de quem não respondeu.

O painel mostra contatos, envios, notas e estatísticas do mês.

## Destaques técnicos

- **WhatsApp via Baileys** (protocolo do WhatsApp Web, sem API paga), com sessão persistente e página `/qrcode` para conectar o número.
- **Pareamento de resposta com envio.** O WhatsApp passou a identificar alguns contatos por LID em vez do telefone, então a resposta nem sempre bate com o número enviado. O bot tenta o telefone primeiro e cai para o envio recente sem resposta como fallback.
- **Modo demo** (`DEMO_MODE=true`) simula os envios sem conectar o WhatsApp, para apresentar o fluxo em reunião.

## Stack

Node.js · Express · Baileys · node-cron · HTML/CSS/JS no painel

## Rodar

```bash
npm install
cp .env.example .env   # DEMO_MODE=true para testar sem WhatsApp
npm start              # http://localhost:3000/?b=1
```

Com `DEMO_MODE=false`, abra `http://localhost:3000/qrcode` e escaneie com o WhatsApp do negócio.

Feito por [Diego de Moraes](https://www.linkedin.com/in/euudm) na [Allaska](https://github.com/euudm).
