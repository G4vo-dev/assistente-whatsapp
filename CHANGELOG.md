# Changelog

Todas as mudanças importantes do projeto, da mais nova para a mais antiga.
O formato segue a ideia do [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/), e os números de versão seguem o [SemVer](https://semver.org/lang/pt-BR/): o primeiro número muda quando algo deixa de funcionar como antes, o do meio quando entra função nova e o último quando é só correção.

## [1.2.0] - 2026-11-13

### Adicionado
- `#chave [ia] [chave]`: cada pessoa que usa o bot coloca a própria chave da Groq, do Gemini, da Mistral ou do OpenRouter, e os comandos dela passam a gastar a cota dela. Sem o nome da IA, o bot descobre pelo jeito da chave. `#chave` mostra de quem é cada chave; `#chave remover groq` (ou `tudo`) tira.
- O bot testa a chave antes de guardar, apaga a mensagem com a chave quando consegue, recusa chave mandada em grupo, nunca mostra a chave inteira nem a escreve no log, e não a coloca no backup.
- `EMPRESTAR_CHAVES` no `.env`: com `nao`, quem não colocou a própria chave fica sem IA (o padrão, `sim`, mantém como era: usa as do dono).
- O dono também pode colocar as chaves dele por `#chave`, sem mexer no `.env`.

### Mudado
- O limite das IAs é contado por chave: a chave de uma pessoa bater no limite não deixa as outras "descansando".
- Para quem não é o dono, a mensagem de "IA desligada" e o `#ias` explicam como colocar a própria chave.
- Os testes passaram de 113 para 123.

## [1.1.0] - 2026-11-13

Traz para cá o que o bot pessoal do autor (o bity, versões 3.4.0 a 3.5.3) ganhou depois que este projeto foi publicado. O prefixo continua `#`.

### Adicionado
- `#lerextrato`: o print (ou PDF) do extrato do banco ou da fatura do cartão vira um lançamento por linha, com o número de cada um. O que já estava anotado (mesmo tipo, valor e dia) é pulado. Prints mandados até 90 segundos depois também são lidos, sem legenda. `#extrato` na legenda de um print faz o mesmo.
- `#editar [nº] [o que mudar]`: corrige valor, categoria, descrição, data, tipo, método ou cartão de um lançamento, ou de vários de uma vez (`#editar 3-7 transporte`).
- `#lembrar` com repetição: `todo dia 8h`, `toda segunda 8h30`, `todo mês dia 5 9h`. Os que repetem aparecem com 🔁 em `#lembretes`.
- `#anotar`, `#notas`, `#lista` e `#listas`: anotações e listas de cada conversa. Entram no backup.
- `#estudar [tema]`, `#quiz [tema]` e `#resposta [texto]`.
- `#confiar [número]`, `#desconfiar [número]` e `#confiaveis`: o dono libera pessoas pelo WhatsApp, sem mexer no `.env` (só o dono usa).
- `#status`: tempo ligado, quedas, IAs, lembretes, último backup, memória, espaço livre e bateria (no Termux).
- Aviso na conversa com você mesmo quando o bot liga ou volta de uma queda (piscadas de menos de 20 s não avisam).
- Backup diário guardado no aparelho às 4h (`dados/backups`, últimos 7 dias).
- Cópia do login do WhatsApp a cada hora em `auth_info_baileys.reserva`, só quando o `creds.json` está íntegro.
- Mensagem "trancada" (o WhatsApp trocou a chave de criptografia e o bot não conseguiu abrir): se o celular não reenviar em 20 segundos, o bot avisa na conversa com você mesmo para mandar de novo.
- `IA_PERSONALIDADE`, `IA_MAX_TOKENS` e `IA_RACIOCINIO` no `.env`.
- `DEBUG_MSG=1 npm start`: uma linha no terminal para cada mensagem que chega (quem mandou, tipo, atraso e o começo do texto).
- O log mostra quanto tempo cada comando lento levou e avisa quando o WhatsApp entregou uma mensagem atrasada.

### Mudado
- A IA deixou de responder com personalidade "gamer e nerd": o padrão agora é um assistente geral, completo e direto. As respostas podem ser mais longas (limite padrão de 2048 em vez de 1024).
- O backup passou para a versão 2, com as anotações e listas. Backups da versão 1 continuam restaurando.
- Lançamentos feitos pela IA mostram a categoria e sugerem `#editar` para corrigir.
- O `#ajuda` troca o `#` dos textos pelo prefixo em uso.
- Os testes passaram de 61 para 113.

### Corrigido
- **Demora para responder.** O modelo padrão da Groq pensava antes de toda resposta, até para lançar um gasto. Agora as finanças e a leitura de imagens não pensam, e a conversa pensa pouco (`IA_RACIOCINIO=baixo`).
- Quando a Groq batia no limite, o bot ficava parado esperando ela liberar (às vezes quase 1 minuto) antes de tentar outra IA. Agora passa na hora para a próxima da fila.
- Uma mensagem demorada (IA, figurinha) não segura mais as outras que chegam junto.
- Leitura de foto na Groq: o modelo `meta-llama/llama-4-scout-17b-16e-instruct` foi desligado pela Groq em 17/07/2026. Agora a Groq lê imagens com o `qwen/qwen3.8-27b`. Se o `.env` ainda tiver um modelo que a Groq desligou, o bot usa o substituto sozinho e avisa no log.
- Gemini sobrecarregado ("high demand", erro 503), com erro 500 ou demorando demais: agora tenta o modelo reserva (`gemini-flash-lite-latest`) antes de desistir.
- O bot guarda as mensagens que enviou: quando o celular pede para reenviar uma, ela não fica em "Aguardando mensagem".
- Em grupos, o bot guarda os dados do grupo em vez de perguntar ao WhatsApp a cada resposta.
- O log não mostra mais as chaves de criptografia de cada conversa ("Closing session: SessionEntry..."): virou uma linha curta.

## [1.0.0] - 2026-11-04

Primeira versão pública: finanças com cartões, parcelas, metas e limites; fila de IAs com reserva (Groq, Gemini, Mistral, OpenRouter) para conversa, áudio, fotos e PDFs de comprovante; figurinhas com ffmpeg; lembretes e avisos automáticos; modo demonstração no terminal; testes no GitHub Actions.
