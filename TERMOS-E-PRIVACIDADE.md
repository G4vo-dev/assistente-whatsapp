# Termos de uso e privacidade do Assistente para WhatsApp

> Este texto foi escrito para reduzir riscos e deixar claro como o bot funciona. Ele **não é aconselhamento jurídico**. Se um dia você quiser oferecer o bot para o público, cobrar por ele ou usar numa empresa, converse antes com um advogado: nesse caso valem regras bem mais rígidas (LGPD completa, Código de Defesa do Consumidor, contratos com os serviços de IA).

## 1. O que é o bot

O Assistente para WhatsApp é um **bot pessoal**, de uso **particular e não comercial**, que roda no WhatsApp de quem o instala, num aparelho dessa pessoa (por exemplo, no Termux). O código é aberto (licença MIT), mas cada instalação é responsabilidade de quem a roda.

## 2. WhatsApp

- O bot usa a biblioteca Baileys, que **não é um cliente oficial** do WhatsApp. Os termos do WhatsApp não permitem automação não autorizada, e o WhatsApp pode **suspender ou banir o número** que usa esse tipo de bot. Esse é um risco que o dono assume.
- Para reduzir o risco, o bot:
  - só responde aos comandos do dono (e de quem o dono liberar em `PERMITIDOS` ou com `#confiar`);
  - só manda mensagens automáticas (avisos, resumos, backup) para a conversa do dono com ele mesmo;
  - nunca manda mensagens em massa, propaganda ou mensagens para quem não pediu.
- **Não use o bot para spam, marketing ou mensagens em massa.** Além do banimento, isso pode violar a LGPD e as regras de telemarketing.

## 3. Dados pessoais e privacidade (LGPD)

### Por que a LGPD quase não se aplica aqui
A Lei Geral de Proteção de Dados (Lei 13.709/2018, art. 4º, I) **não se aplica** ao tratamento de dados feito por uma pessoa física para fins **exclusivamente particulares e não econômicos**. É o caso de um bot pessoal. Mesmo assim, o bot segue as boas práticas da lei, principalmente se outras pessoas usarem.

### O que fica guardado
Tudo fica **só no aparelho do dono**, na pasta `dados/`:

| Arquivo | O que tem | Como apagar |
|---|---|---|
| `dados/financas.json` | finanças de cada conversa (lançamentos, cartões, fixos, metas, limites) | `#resetfin tudo confirmar` (conversa) ou `#resetfin geral confirmar` (todas) |
| `dados/lembretes.json` | lembretes marcados (inclusive os que se repetem) | `#cancelar [nº]` |
| `dados/notas.json` | anotações e listas de cada conversa | `#notas apagar [nº]` e `#lista [nome] limpar` |
| `dados/confiaveis.json` | números que o dono liberou com `#confiar` | `#desconfiar [número]` |
| `dados/chaves.json` | chaves de IA que cada pessoa colocou com `#chave` (fora do backup; o arquivo só pode ser lido pelo usuário do aparelho, onde o sistema permitir) | `#chave remover tudo` |
| `dados/backups/` | cópias de segurança antes de resets e restaurações, e o backup diário das 4h (últimos 7 dias) | apagar os arquivos da pasta |
| `dados/bot.log` | registro dos comandos (só quando ligado pelo Termux:Boot) | apagar o arquivo |
| `dados/avisos.json`, `dados/agenda.json` | controle dos avisos já mostrados | apagar o arquivo |

**Fotos, vídeos, áudios e PDFs não ficam guardados**: são baixados para uma pasta temporária e apagados logo depois de usados.

O login do WhatsApp fica em `auth_info_baileys/`, com uma cópia de segurança feita a cada hora em `auth_info_baileys.reserva/`. Essas duas pastas, a pasta `dados/` e o arquivo `.env` (com as chaves) **nunca vão para o GitHub** (estão no `.gitignore`).

### O que vai para outros serviços
Só quando você usa um comando que precisa deles:

| Serviço | Recebe | Comandos |
|---|---|---|
| Groq, Google Gemini, Mistral, OpenRouter (IAs) | o texto, a foto, o PDF ou o áudio do comando | `#ia`, `#iaeco`, `#iagerente`, `#dicas`, `#comprovante`, `#lerextrato`, `#transcrever`, áudio automático, `#traduzir`, `#estudar`, `#quiz`, `#resposta`, `#mc`, `#quimica` |
| Open-Meteo, ViaCEP, PokéAPI | o nome da cidade, o CEP ou o nome do Pokémon | `#clima`, `#cep`, `#pokemon` |
| o site do link (X ou link direto de imagem/vídeo) | o pedido da imagem ou do vídeo | `#s [link]` |

- Esses serviços podem ficar **fora do Brasil**.
- Nos **planos grátis do Google Gemini e da Mistral**, o que você manda **pode ser usado para melhorar ou treinar as IAs deles**. O **OpenRouter** repassa cada pedido para empresas diferentes.
- Para manter finanças, comprovantes e áudios longe dessas IAs, ligue o **modo privado** no `.env`: `IA_MODO_PRIVADO=sim`. Nesse modo, esses dados vão só para a Groq. A leitura de PDF fica desligada, porque só o Gemini lê PDF. Confira a política de privacidade de cada serviço que você usar.

### Dados de outras pessoas
- Comprovantes, prints de extrato, áudios e mensagens podem ter **dados de terceiros** (nome, CPF, banco, voz). Só mande para o bot o que você tem direito de usar, e evite mandar dados de outras pessoas para a IA sem necessidade.
- Se você liberar o bot para outras pessoas (`PERMITIDOS` no `.env` ou `#confiar`), na primeira vez que cada uma usar ela recebe um aviso de privacidade, e pode ver os detalhes com `#privacidade`. Ela pode apagar as próprias finanças a qualquer momento com `#resetfin tudo confirmar`. Se ela pedir para apagar tudo, atenda.
- Quem foi liberado só mexe na carteira, nas anotações e nas listas da própria conversa. `#backup`, `#restaurar` e `#avisos` são só do dono, porque o arquivo de backup tem os dados de todas as conversas. `#confiar`, `#desconfiar` e `#confiaveis` também são só do dono.

### Chaves de IA de cada pessoa (`#chave`)
- Quem usa o bot pode colocar a própria chave de IA. Os comandos dessa pessoa passam a usar a chave dela; os de mais ninguém usam.
- A chave fica guardada **no aparelho do dono do bot**, sem criptografia: quem controla o aparelho consegue lê-la. E como o bot roda no número do dono, a mensagem com a chave também chega ao WhatsApp do dono (o bot tenta apagá-la de lá, mas o WhatsApp não deixa apagar do celular de quem mandou). Por isso, **crie uma chave só para isto** e apague-a no site da IA quando quiser parar.
- O bot testa a chave antes de guardar, nunca mostra a chave inteira, não a escreve no registro (`bot.log`) e não a coloca no arquivo de backup. Chave mandada em grupo não é guardada: troque-a, porque ela ficou visível.
- O dono decide se quem não tem chave própria usa as dele (`EMPRESTAR_CHAVES` no `.env`).

## 4. Direitos autorais e direito de imagem

- **Figurinhas de link (`#s [link]`)**: use só imagens e vídeos que você tem direito de usar. Conteúdo protegido pode violar a Lei de Direitos Autorais (Lei 9.610/1998).
- **Figurinhas (`#s`)**: não faça figurinhas com a foto de outras pessoas sem permissão, nem para ofender ou expor alguém. O direito de imagem é protegido pela Constituição (art. 5º, X) e pelo Código Civil (art. 20).
- **`#pokemon`**: imagens e nomes são da Nintendo, da Game Freak e da The Pokémon Company. Os dados vêm da PokéAPI e são usados só para consulta pessoal.

## 5. Finanças e respostas da IA

- O bot é uma **ferramenta pessoal de anotação**. Ele não é banco, não movimenta dinheiro e não acessa contas.
- `#dicas`, `#iaeco` e as outras respostas de IA são **informativas**: **não são recomendação de investimento nem consultoria financeira**. A IA pode errar valores, interpretar mal um comprovante ou um áudio, e inventar informação. Sempre confira antes de decidir algo.
- Lançamentos feitos pela IA (`#iagerente`, áudio, `#comprovante`, `#lerextrato`) mostram o número para você conferir e corrigir com `#editar` ou apagar com `#apagar`.

## 6. Serviços e componentes de terceiros

| Componente | Licença / termos |
|---|---|
| Baileys (`@whiskeysockets/baileys`) | MIT |
| groq-sdk | Apache-2.0 |
| pino | MIT |
| dotenv | BSD-2-Clause |
| ffmpeg | LGPL/GPL, instalado à parte pelo Termux (`pkg install ffmpeg`), não vem junto com o bot |
| Fonte DejaVu Sans Bold (`assets/`) | licença Bitstream Vera / DejaVu, texto completo em `assets/LICENSE-DejaVu.txt` |
| Open-Meteo (`#clima`) | dados em CC BY 4.0; o crédito "Open-Meteo.com" aparece em toda resposta; uso não comercial gratuito |
| ViaCEP (`#cep`) | serviço gratuito |
| PokéAPI (`#pokemon`) | uso gratuito com moderação; crédito aparece em toda resposta |
| Groq, Google Gemini, Mistral, OpenRouter | termos de uso e políticas de privacidade de cada empresa |

## 7. Segurança

- Nunca compartilhe o arquivo `.env` (chaves das IAs), o `dados/chaves.json` (chaves das outras pessoas) nem as pastas `auth_info_baileys/` e `auth_info_baileys.reserva/` (dão acesso ao seu WhatsApp).
- Se você fizer um fork, nunca suba o `.env`, a pasta `dados/` nem as pastas do login (o `.gitignore` já impede).
- De tempos em tempos, confira em WhatsApp > Aparelhos conectados se só os seus aparelhos estão lá.
- Guarde o arquivo de backup num lugar seguro (por exemplo, no seu Google Drive), porque ele tem as suas finanças e anotações.
