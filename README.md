# Assistente para WhatsApp

Assistente pessoal que roda no próprio WhatsApp: controla finanças (cartões, parcelas, metas e limites), entende áudios, comprovantes e prints do extrato do banco com IA, guarda anotações e listas, faz figurinhas, marca lembretes e manda resumos automáticos. Feito em **Node.js**, roda até num celular Android com **Termux**.

![Node.js](https://img.shields.io/badge/Node.js-20.19%2B-339933?logo=node.js&logoColor=white)
[![testes](https://github.com/G4vo-dev/assistente-whatsapp/actions/workflows/testes.yml/badge.svg)](https://github.com/G4vo-dev/assistente-whatsapp/actions/workflows/testes.yml)
![Licença](https://img.shields.io/badge/licen%C3%A7a-MIT-blue)

<p align="center">
  <img src="assets/demo.gif" alt="Demonstração no terminal: cadastrar cartão, lançar receita e despesa, corrigir um valor com #editar, compra parcelada, gráfico do mês, lembrete que repete todo dia e sugestão para comando digitado errado" width="760">
</p>

O que mudou em cada versão: [CHANGELOG.md](CHANGELOG.md).

## Experimente sem WhatsApp

```bash
npm install
npm run demo -- --roteiro   # conversa de exemplo pronta
npm run demo                # converse você mesmo (digite #menu)
```

O modo demonstração roda o bot de verdade no terminal, com um WhatsApp simulado. Os dados ficam numa pasta temporária.

## Exemplo real

Trecho da saída de `npm run demo -- --roteiro` (sem os asteriscos de negrito do WhatsApp):

```text
👤 #editar 2 valor 92,40

🤖 ✏️ editado
   2. 🔴 13/11 compras da semana · R$ 92,40 · pix · 🏷️ mercado
      ↳ valor R$ 89,90 → R$ 92,40
   💰 saldo em conta: R$ 3.407,60

👤 #despesa 1200 nubank 6x eletronicos celular novo

🤖 🔴 despesa parcelada nº 3 a 8: celular novo
   💸 6x de R$ 200,00 (total R$ 1.200,00)
   🏷️ eletronicos · 📅 de 13/11 até 13/04/2027
   💳 fatura nubank: R$ 200,00 (+ R$ 1.000,00 nos próximos meses)
   💳 limite livre: R$ 800,00 de R$ 2.000,00

👤 #despesa 80 ifood pizza de sexta

🤖 🔴 despesa nº 10 registrada: pizza de sexta · R$ 80,00
   💰 saldo em conta: R$ 3.282,60
   ⚠️ ifood chegou a 83% do limite este mês: R$ 125,00 de R$ 150,00

👤 #grafico

🤖 📊 novembro/2026
   🟢 entrou: R$ 3.500,00
   🔴 saiu: R$ 417,40 (conta R$ 217,40 + cartão R$ 200,00)
   eletronicos ████░░░░  48% R$ 200,00
   ifood       ██░░░░░░  30% R$ 125,00
   mercado     ██░░░░░░  22% R$ 92,40

👤 #lembrar todo dia 8h tomar remédio

🤖 🔁 lembrete marcado: todo dia às 8h. o próximo é 14/11, 08:00.

👤 #sald

🤖 🤔 não conheço #sald. você quis dizer #saldo?
```

## O que ele faz

**💰 Finanças**
- Receitas e despesas com método de pagamento, categoria e data, num formato curto (`#despesa 20 ifood`) ou completo.
- Cartões de crédito com limite, fatura do mês e pagamento de fatura.
- Compras parceladas: uma parcela por mês; a fatura mostra só o mês atual e o limite livre já desconta a compra inteira, como no banco.
- Gastos fixos com vencimento, metas com barra de progresso e limite de gasto por categoria (avisa em 80% e 100%).
- Gráfico do mês por categoria, extrato com filtros e exportação para planilha (CSV).
- `#editar`: corrige valor, categoria, data, descrição, método ou cartão de um lançamento, ou de vários de uma vez (`#editar 3-7 transporte`).

**🤖 IA**
- `#iagerente`: escreva normal ("gastei 45 no ifood ontem e 120 no mercado no crédito") e a IA lança tudo.
- Áudio na conversa com você mesmo vira texto e, se falar de dinheiro, vira lançamento.
- `#comprovante`: foto, print ou PDF de pagamento vira lançamento.
- `#lerextrato`: o print (ou PDF) do extrato do banco ou da fatura do cartão vira um lançamento por linha. O que já estava anotado é pulado, e prints mandados logo depois também são lidos.
- `#chave`: cada pessoa que usa o bot pode colocar a própria chave de IA (todas têm plano grátis); os comandos dela passam a gastar a cota dela, não a do dono.
- `#estudar [tema]` explica passo a passo; `#quiz [tema]` faz uma pergunta e `#resposta` corrige e conta os acertos.
- Perguntas livres, tradução e dicas financeiras.

**📝 Organização**
- Lembretes que sobrevivem a reinícios, de uma vez (`#lembrar 30m ...`) ou que se repetem (`todo dia 8h`, `toda segunda 8h30`, `todo mês dia 5 9h`).
- Anotações (`#anotar`, `#notas`) e listas de compras ou tarefas (`#lista mercado add leite, pão`).

**⏰ Automático** (na conversa com você mesmo)
- 9h: contas fixas que vencem no dia · domingo 20h: resumo da semana · dia 1: fechamento do mês · 22h: backup, se algo mudou · 4h: cópia do backup guardada no aparelho (últimos 7 dias).
- Avisa quando liga e quando volta depois de uma queda (com quanto tempo ficou fora).

**🤖 Manutenção**
- `#status`: tempo ligado, quedas, IAs, lembretes, memória, espaço livre e bateria (no Termux).
- `#confiar [número]`, `#desconfiar` e `#confiaveis`: o dono libera outras pessoas pelo próprio WhatsApp, sem mexer no `.env`.

**🎨 Outros**
- Figurinhas de foto, vídeo, gif ou link, com texto embaixo; figurinha de volta para foto.
- Clima, CEP, Pokémon e cotações.

## Arquitetura

```mermaid
flowchart LR
    W[WhatsApp] <--> C[conexao.js<br/>Baileys + reconexão]
    C --> R[roteador.js<br/>quem pode usar e qual comando]
    R --> K[comandos/<br/>um arquivo por grupo]
    K --> F[finanças]
    K --> I[fila de IAs]
    K --> M[mídia<br/>ffmpeg]
    A[agenda.js<br/>avisos automáticos] --> F
    F --> D[(dados/*.json)]
    I --> G1[Groq]
    I --> G2[Gemini]
    I --> G3[Mistral]
    I --> G4[OpenRouter]
```

### Decisões técnicas
- **Fila de IAs com reserva:** cada tarefa tem uma ordem de provedores, começando pelo melhor naquilo (Whisper da Groq para áudio, Gemini para imagem e PDF). Se um falha ou bate no limite do plano grátis, o próximo assume na hora; quem bateu no limite fica "descansando" alguns minutos, respeitando o `retry-after`. O Gemini sobrecarregado tenta o modelo reserva dele antes de passar a vez, e um modelo que a Groq desligou é trocado sozinho pelo substituto.
- **Uma chave por pessoa:** cada comando roda "dentro" de quem o mandou (`AsyncLocalStorage` do Node), e cada IA pede a chave na hora do pedido, então a chave certa chega até a chamada sem passar a pessoa de função em função. O limite é contado por chave: a de um amigo bater no limite não para a do dono. A chave é testada antes de ser guardada, nunca aparece inteira nas respostas nem no log, não vai para o backup, e o bot recusa chave mandada em grupo.
- **Resposta rápida onde não precisa pensar:** lançar gastos e ler comprovantes pede à IA zero "raciocínio" (é só copiar números); a conversa pensa pouco, e isso é ajustável no `.env`.
- **Uma mensagem não segura as outras:** cada mensagem é tratada por conta própria, então uma IA demorando não atrasa um `#saldo` mandado logo depois.
- **Extrato sem repetição:** ao ler o print do banco, cada linha é comparada com o que já existe (mesmo tipo, valor e dia) e pulada se já estava anotada; duas compras iguais no mesmo dia contam como duas.
- **Dados sem banco de dados:** arquivos JSON com escrita atômica (arquivo temporário + `rename`), cópia de arquivo corrompido em vez de sobrescrever, backup antes de operações perigosas e migração automática de formatos antigos.
- **Agendador que não perde aviso:** se o bot estava desligado no horário, a tarefa roda quando ele volta, uma vez por dia, com estado salvo em disco.
- **Nunca responde a si mesmo:** o ID de cada mensagem enviada é gerado antes do envio, porque o WhatsApp devolve a própria mensagem antes da resposta da API.
- **Figurinhas leves:** a figurinha animada é refeita com qualidade, fps, tamanho e duração menores até caber no limite de 1 MB do WhatsApp.
- **Privacidade:** só o dono usa por padrão; quem for liberado recebe um aviso de privacidade e mexe só na carteira da própria conversa (`#backup`, `#restaurar` e `#avisos` são só do dono); um modo privado mantém finanças, comprovantes e áudios longe das IAs que usam os dados no plano grátis.
- **Uma cópia só:** uma porta local, liberada sozinha quando o bot cai, impede duas cópias ligadas na mesma pasta; se o WhatsApp avisa que outra cópia assumiu a sessão, o bot para em vez de brigar.
- **Login protegido:** a pasta do login é copiada a cada hora para `auth_info_baileys.reserva`, só quando o `creds.json` está íntegro (uma cópia estragada nunca substitui uma boa).
- **Mensagem "trancada":** quando o WhatsApp troca a chave de criptografia e a mensagem chega sem poder ser aberta, o bot espera 20 s pelo reenvio e, se não vier, avisa para mandar de novo, em vez de ficar calado. As mensagens enviadas ficam guardadas para o celular conseguir pedir o reenvio delas.
- **Log limpo:** as chaves de criptografia que a biblioteca escreve no log viram uma linha curta; `DEBUG_MSG=1` mostra uma linha por mensagem recebida, para descobrir se ela chegou.
- **Testes sem WhatsApp:** 123 testes com um WhatsApp simulado cobrem finanças, leitura de extrato, edição, fila de IAs, chave de cada pessoa, agenda, backup, lembretes que repetem, privacidade, mensagem trancada e conversão de mídia com ffmpeg de verdade. O GitHub Actions roda o lint e os testes a cada mudança, no Node 20, 22 e 24.

## Rodando no WhatsApp

1. Node.js 20.19+ e ffmpeg. No Termux: `pkg install nodejs ffmpeg`.
2. `npm install`
3. Copie `.env.example` para `.env` e coloque ao menos uma chave de IA (`GROQ_API_KEY` ou `GEMINI_API_KEY`; ambas têm plano grátis).
4. `npm start`, digite seu número e use o código de pareamento em WhatsApp > Aparelhos conectados > Conectar com número de telefone.
5. Mande `#menu` em qualquer conversa.

No Termux, `npm run iniciar` religa o bot se ele cair e `npm run instalar-boot` liga o bot junto com o celular (app Termux:Boot). Se o bot já estiver ligado, um novo `npm start` avisa e fecha.

Fora da conversa com você mesmo, o bot não responde a comandos que não existem: uma hashtag como `#tbt` num grupo não ganha resposta.

| Comando | Para quê |
|---|---|
| `npm run demo` | conversa com o bot no terminal |
| `npm test` | roda os testes |
| `npm run lint` | confere o padrão do código (ESLint) |
| `npm run modelos` | lista os modelos das IAs com chave |

## Estrutura

```
src/conexao.js        conexão com o WhatsApp, pareamento e reconexão
src/roteador.js       permissões, comandos, modo figurinha, modo extrato e áudio automático
src/agenda.js         avisos automáticos (fixos, resumos, backup)
src/estado.js         tempo ligado e quedas (para o #status e o aviso de volta)
src/silenciar.js      tira as chaves de criptografia do log
src/comandos/         comandos, um arquivo por grupo (o #menu se monta sozinho)
src/servicos/ia/      fila de IAs e um arquivo por provedor
src/servicos/         finanças, edição, parcelas, mídia, lembretes, anotações e armazenamento
scripts/              demo, religamento automático, Termux:Boot e lista de modelos
test/                 testes com WhatsApp simulado
```

## Avisos

- O bot usa a [Baileys](https://github.com/WhiskeySockets/Baileys), que **não é um cliente oficial** do WhatsApp: o número pode ser suspenso. É um projeto pessoal. Para clientes ou uso comercial, o caminho é a API oficial (WhatsApp Business Platform).
- Privacidade, LGPD e o que vai para cada serviço: [TERMOS-E-PRIVACIDADE.md](TERMOS-E-PRIVACIDADE.md).

## English summary

Personal WhatsApp assistant in Node.js (runs even on an Android phone via Termux): expense tracking with credit cards, installments, budgets and goals; AI features with a provider queue and automatic fallback (Groq, Gemini, Mistral, OpenRouter) for chat, voice notes, receipt photos, PDFs and bank statement screenshots; notes, lists and recurring reminders; stickers with ffmpeg; scheduled summaries and backups. Try it without WhatsApp: `npm install && npm run demo -- --roteiro`. Each user can bring their own AI key (`#chave`). 123 automated tests run against a simulated WhatsApp.

## Licença

[MIT](LICENSE) · feito por [Zet (Gustavo)](https://github.com/G4vo-dev)
