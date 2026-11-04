// Áudio vira texto (e lançamento) e foto de comprovante vira lançamento.
const fin = require('../servicos/financas');
const ia = require('../servicos/ia');
const midia = require('../servicos/midia');
const { lancarAcoes, promptDeLancamento } = require('./ia');
const { acharMidia } = require('../util/mensagem');
const { normalizar, hojeISO } = require('../util/formato');

const TIPOS_AUDIO = ['audioMessage'];
const TIPOS_IMAGEM = ['imageMessage', 'documentMessage'];

// Palavras que indicam que o áudio fala de dinheiro.
const PALAVRAS_DE_DINHEIRO = /\b(gastei|gasto|paguei|pagar|comprei|compra|recebi|ganhei|caiu|despesa|receita|parcel\w*|pix|credito|debito|cartao|reais|real|conto|contos|fatura|fixo|meta|salario)\b|r\$|\d+\s*(reais|conto)/;

async function transcrever(ctx, alvo) {
    const dados = await midia.baixarDaMensagem(ctx.bot, alvo.mensagem);
    const mimetype = String(alvo.info?.mimetype || 'audio/ogg').split(';')[0];
    const extensao = mimetype.includes('mpeg') ? 'mp3' : mimetype.includes('mp4') ? 'm4a' : 'ogg';
    return ia.transcreverAudio(dados, `audio.${extensao}`, mimetype);
}

// Texto falado -> lançamentos. Devolve a resposta pronta ou null se não houver nada para lançar.
async function lancarPorTexto(ctx, texto, titulo) {
    const resposta = await ia.perguntarIA(promptDeLancamento(fin.lerConta(ctx.conta), texto), {
        sistema: 'você converte frases em JSON. responda apenas com JSON válido.',
        temperatura: 0.1,
        tarefa: 'financas',
    });
    const acoes = ia.extrairListaJson(resposta);
    if (!acoes?.length) return null;
    return lancarAcoes(ctx, acoes, titulo);
}

// Áudio mandado na conversa com você mesmo (sem comando): transcreve e lança se for gasto/ganho.
async function audioAutomatico(ctx) {
    const alvo = acharMidia(ctx.msg, ctx.conteudo, TIPOS_AUDIO);
    if (!alvo || !ia.iaLigada('audio')) return;
    await ctx.reagir('🎧');
    const texto = await transcrever(ctx, alvo);
    if (!texto) return ctx.reagir('🤷');
    if (PALAVRAS_DE_DINHEIRO.test(normalizar(texto)) && ia.iaLigada('financas')) {
        const resposta = await lancarPorTexto(ctx, texto, `🎙️ _"${texto}"_\n\n✅ *lançado*`);
        if (resposta) {
            await ctx.responder(resposta, { citar: true });
            return ctx.reagir('✅');
        }
    }
    await ctx.responder(`🎙️ ${texto}`, { citar: true });
    await ctx.reagir('📝');
}

module.exports = {
    titulo: '🎙️ *áudio & comprovante*',
    audioAutomatico,
    transcrever,
    comandos: [
        {
            nome: 'transcrever',
            apelidos: ['transcricao', 'textodoaudio'],
            uso: 'transcrever',
            descricao: 'responda um áudio para ver o texto',
            ajuda: 'na conversa com você mesmo não precisa de comando: todo áudio é transcrito sozinho, '
                + 'e se você falar de um gasto ou ganho ("gastei 30 no uber no pix") ele já é lançado nas finanças.',
            async executar(ctx) {
                const alvo = acharMidia(ctx.msg, ctx.conteudo, TIPOS_AUDIO);
                if (!alvo) return ctx.responder(`❌ responda um áudio com ${ctx.prefixo}transcrever`);
                if (!ia.iaLigada('audio')) return ctx.responder(ia.SEM_CHAVE);
                await ctx.reagir('⏳');
                const texto = await transcrever(ctx, alvo);
                await ctx.responder(texto ? `🎙️ ${texto}` : '🤷 não entendi nada nesse áudio.', { citar: true });
                await ctx.reagir(texto ? '✅' : '❌');
            },
        },
        {
            nome: 'comprovante',
            apelidos: ['nota', 'recibo', 'cupom'],
            uso: 'comprovante [observação]',
            descricao: 'foto, print ou PDF de pagamento vira lançamento',
            ajuda: 'mande a foto com a legenda #comprovante ou responda a foto/PDF. funciona com print de Pix, nota fiscal, '
                + 'cupom e recibo. PDF precisa da GEMINI_API_KEY. a observação ajuda a IA (ex.: "no crédito do itau" ou "dividido em 3x").',
            exemplos: ['comprovante (na legenda da foto)', 'comprovante no crédito do itau'],
            async executar(ctx) {
                const alvo = acharMidia(ctx.msg, ctx.conteudo, TIPOS_IMAGEM);
                const mimetype = String(alvo?.info?.mimetype || '').split(';')[0];
                const ehPdf = mimetype === 'application/pdf';
                if (!alvo || !(mimetype.startsWith('image/') || ehPdf)) {
                    return ctx.responder(`❌ mande a foto/PDF do comprovante com a legenda ${ctx.prefixo}comprovante ou responda o arquivo com ${ctx.prefixo}comprovante`);
                }
                if (ehPdf && !ia.iaLigada('pdf')) {
                    return ctx.responder(require('../config').IA_MODO_PRIVADO
                        ? '🔒 o modo privado está ligado e só o Gemini lê PDF. mande um print do comprovante.'
                        : '❌ para ler PDF, coloque a GEMINI_API_KEY no .env (ou mande um print do comprovante).');
                }
                if (!ia.iaLigada(ehPdf ? 'pdf' : 'imagem')) return ctx.responder(ia.SEM_CHAVE);
                await ctx.reagir('⏳');
                const baixado = await midia.baixarDaMensagem(ctx.bot, alvo.mensagem);
                const imagem = ehPdf ? { dados: baixado, tipo: mimetype } : await midia.prepararImagem(baixado, mimetype);
                const conta = fin.lerConta(ctx.conta);
                const [ano, mes, dia] = hojeISO().split('-');
                const pergunta = `Este arquivo deve ser um comprovante de pagamento, print de Pix/transferência, nota fiscal, cupom ou recibo. Hoje é ${dia}/${mes}/${ano}.\n`
                    + `Cartões de crédito cadastrados: ${conta.cartoes.map((c) => c.nome).join(', ') || 'nenhum'}.\n`
                    + 'Responda SOMENTE com uma lista JSON. Cada item: {"acao":"despesa"|"receita","valor":numero total,"parcelas":numero,'
                    + '"metodo":"pix"|"debito"|"credito"|"dinheiro"|"boleto","cartao":"nome se for crédito","categoria":"uma palavra",'
                    + '"data":"dd/mm/aaaa","descricao":"quem recebeu/loja, curto"}.\n'
                    + 'Pix ou transferência que a pessoa RECEBEU é "receita"; o que ela pagou é "despesa". Use o valor total pago. '
                    + 'Se não for um comprovante, responda [].'
                    + (ctx.texto ? `\nObservação do usuário: "${ctx.texto}"` : '');
                const resposta = await ia.perguntarSobreImagem(imagem.dados, imagem.tipo, pergunta);
                const acoes = ia.extrairListaJson(resposta);
                if (!acoes?.length) {
                    await ctx.reagir('❌');
                    return ctx.responder(resposta.startsWith('❌') ? resposta : '🤷 não achei um valor de pagamento nesse arquivo. tente uma foto mais nítida ou use #despesa.');
                }
                await ctx.responder(lancarAcoes(ctx, acoes, '🧾 *comprovante lançado*'), { citar: true });
                await ctx.reagir('✅');
            },
        },
    ],
};
