// #chave: cada pessoa coloca a própria chave de IA, e os comandos dela passam a gastar a cota dela.
const chaves = require('../servicos/ia/chaves');
const { enviar } = require('../envio');
const { normalizar } = require('../util/formato');

const NOMES = { groq: 'groq', gemini: 'gemini', google: 'gemini', mistral: 'mistral', openrouter: 'openrouter' };
const REMOVER = ['remover', 'apagar', 'tirar', 'excluir', 'rm'];

// Tira a mensagem com a chave da conversa: a sua some para todos; a de outra pessoa some do celular do dono
// (o WhatsApp não deixa o bot apagar do celular dela, então ela é avisada para apagar).
async function apagarMensagem(ctx) {
    const { key, messageTimestamp } = ctx.msg;
    try {
        if (key.fromMe) {
            await enviar(ctx.bot, ctx.jid, { delete: key });
        } else {
            if (typeof ctx.bot.chatModify !== 'function') return false;
            await ctx.bot.chatModify({ deleteForMe: { deleteMedia: false, key, timestamp: Number(messageTimestamp) || Date.now() / 1000 } }, ctx.jid);
        }
        return true;
    } catch {
        return false;
    }
}

function situacao(ctx) {
    const p = ctx.prefixo;
    const dono = chaves.ehDono();
    const linhas = Object.entries(chaves.IAS).map(([nome, ia]) => {
        const { chave, de } = chaves.chaveEOrigem(nome);
        if (de === 'sua') return `✅ ${ia.titulo}: sua (${chaves.mascarar(chave)})`;
        if (de === 'dono') return dono ? `🔸 ${ia.titulo}: a do .env` : `🔸 ${ia.titulo}: usando a do dono do bot`;
        return `⚪ ${ia.titulo}: nenhuma`;
    });
    const sites = Object.values(chaves.IAS).map((ia) => `• ${ia.titulo}: ${ia.site}`).join('\n');
    return `🔑 *suas chaves de IA*\n\n${linhas.join('\n')}\n\n`
        + `*para colocar a sua* (todas têm plano grátis), mande aqui no privado:\n${p}chave groq [sua chave]\n\n${sites}\n\n`
        + `para tirar: ${p}chave remover groq (ou ${p}chave remover tudo)`;
}

async function remover(ctx) {
    const alvo = normalizar(ctx.args[1]);
    const nome = alvo === 'tudo' ? 'tudo' : NOMES[alvo];
    if (!nome) return ctx.responder(`❌ diga qual: ${ctx.prefixo}chave remover groq · gemini · mistral · openrouter · tudo`);
    const quantas = chaves.removerChave(chaves.pessoaDaMensagem(ctx.msg.key), nome);
    if (!quantas) return ctx.responder(`ℹ️ você não tinha ${nome === 'tudo' ? 'nenhuma chave' : `chave da ${chaves.IAS[nome].titulo}`} guardada.`);
    const volta = chaves.ehDono() ? 'as do .env' : chaves.emprestar() ? 'as do dono do bot' : 'nenhuma (a IA fica desligada para você)';
    return ctx.responder(`🗑️ ${quantas} chave(s) apagada(s). agora seus comandos usam ${volta}.\n`
        + 'se não for mais usar, apague a chave também no site da IA.');
}

async function guardar(ctx) {
    const p = ctx.prefixo;
    const dita = NOMES[normalizar(ctx.args[0])];
    const chave = String(dita ? ctx.args[1] || '' : ctx.args[0]).trim();
    const nome = dita || chaves.adivinharIA(chave);

    // chave em grupo fica à vista de todo mundo: não guarda e manda trocar
    if (ctx.jid.endsWith('@g.us')) {
        await apagarMensagem(ctx);
        return ctx.responder(`🔒 não mande chave em grupo: todo mundo vê. apague essa mensagem, crie uma chave nova no site da IA (esta ficou exposta) e mande no privado comigo: ${p}chave groq [sua chave]`);
    }
    if (!chaves.pareceChave(chave)) return ctx.responder(`❌ isso não parece uma chave. ex: ${p}chave groq gsk_... (veja ${p}ajuda chave)`);
    if (!nome) return ctx.responder(`🤔 não sei de qual IA é essa chave. diga junto: ${p}chave groq [chave] (ou gemini, mistral, openrouter)`);

    const apagou = await apagarMensagem(ctx);
    await ctx.reagir('⏳');
    const teste = await chaves.testarChave(nome, chave);
    const titulo = chaves.IAS[nome].titulo;
    if (teste === 'invalida') {
        await ctx.reagir('❌');
        return ctx.responder(`❌ a ${titulo} recusou essa chave (errada, apagada ou sem permissão). confira em ${chaves.IAS[nome].site} e mande de novo.`);
    }
    chaves.guardarChave(chaves.pessoaDaMensagem(ctx.msg.key), nome, chave);
    const linhas = [`✅ chave da ${titulo} guardada (${chaves.mascarar(chave)}). seus comandos de IA agora usam a sua cota.`];
    if (teste === 'sem_resposta') linhas.push(`⚠️ a ${titulo} não respondeu agora, então não deu para testar a chave. se a IA der erro, confira a chave.`);
    if (!ctx.msg.key.fromMe) {
        linhas.push('🧹 apague a mensagem com a chave aqui da conversa (no seu celular).');
        linhas.push('🔐 a chave fica guardada no aparelho do dono do bot. use uma chave só para isto e apague no site da IA quando quiser parar.');
    } else if (!apagou) {
        linhas.push('🧹 não consegui apagar a mensagem com a chave: apague você.');
    }
    linhas.push(`ver suas chaves: ${p}chave · tirar: ${p}chave remover ${nome}`);
    await ctx.reagir('✅');
    return ctx.responder(linhas.join('\n'));
}

module.exports = {
    nome: 'chave',
    apelidos: ['chaves', 'minhachave', 'apikey'],
    // nunca escreve o que vem depois do comando no log (é a chave)
    segredo: true,
    uso: 'chave [ia] [sua chave]',
    descricao: 'usa a sua própria chave de IA (sem gastar a do dono)',
    ajuda: 'cada pessoa pode usar a própria chave da Groq, do Gemini, da Mistral ou do OpenRouter (todas têm plano grátis). '
        + 'mande no privado com o bot, nunca em grupo. o bot testa a chave antes de guardar e nunca mostra a chave inteira. '
        + 'sem o nome da IA, ele tenta descobrir pelo jeito da chave (gsk_ = Groq, AIza = Gemini, sk-or- = OpenRouter). '
        + 'sem chave própria, você usa a do dono do bot (se ele deixar). a chave fica guardada no aparelho do dono do bot, '
        + 'então use uma chave só para isto e apague no site da IA quando quiser parar.',
    exemplos: ['chave (mostra suas chaves)', 'chave groq gsk_...', 'chave AIza... (descobre que é do Gemini)', 'chave remover groq', 'chave remover tudo'],
    async executar(ctx) {
        if (!ctx.args.length) return ctx.responder(situacao(ctx));
        if (REMOVER.includes(normalizar(ctx.args[0]))) return remover(ctx);
        return guardar(ctx);
    },
};
