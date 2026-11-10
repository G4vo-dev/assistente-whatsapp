// Áudio vira texto (e lançamento) e foto de comprovante vira lançamento.
const fin = require('../servicos/financas');
const ia = require('../servicos/ia');
const midia = require('../servicos/midia');
const lancamentoIA = require('../servicos/lancamento-ia');
const { acharMidia } = require('../util/mensagem');
const { IA_MODO_PRIVADO } = require('../config');

const TIPOS_AUDIO = ['audioMessage'];
const TIPOS_IMAGEM = ['imageMessage', 'documentMessage'];

// Áudio mandado na conversa com você mesmo (sem comando): transcreve e lança se for gasto/ganho.
async function audioAutomatico(ctx) {
    const alvo = acharMidia(ctx.msg, ctx.conteudo, TIPOS_AUDIO);
    if (!alvo || !ia.iaLigada('audio')) return;
    await ctx.reagir('🎧');
    const texto = await lancamentoIA.transcrever(ctx.bot, alvo);
    if (!texto) return ctx.reagir('🤷');
    if (lancamentoIA.falaDeDinheiro(texto) && ia.iaLigada('financas')) {
        const resposta = await lancamentoIA.lancarPorTexto(ctx.conta, texto, `🎙️ _"${texto}"_\n\n✅ *lançado*`, ctx.prefixo);
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
                const texto = await lancamentoIA.transcrever(ctx.bot, alvo);
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
                    return ctx.responder(IA_MODO_PRIVADO
                        ? '🔒 o modo privado está ligado e só o Gemini lê PDF. mande um print do comprovante.'
                        : '❌ para ler PDF, coloque a GEMINI_API_KEY no .env (ou mande um print do comprovante).');
                }
                if (!ia.iaLigada(ehPdf ? 'pdf' : 'imagem')) return ctx.responder(ia.SEM_CHAVE);
                await ctx.reagir('⏳');
                const baixado = await midia.baixarDaMensagem(ctx.bot, alvo.mensagem);
                const imagem = ehPdf ? { dados: baixado, tipo: mimetype } : await midia.prepararImagem(baixado, mimetype);
                const pergunta = lancamentoIA.promptDeComprovante(fin.lerConta(ctx.conta), ctx.texto);
                const resposta = await ia.perguntarSobreImagem(imagem.dados, imagem.tipo, pergunta);
                const acoes = ia.extrairListaJson(resposta);
                if (!acoes?.length) {
                    await ctx.reagir('❌');
                    return ctx.responder(resposta.startsWith('❌') ? resposta : '🤷 não achei um valor de pagamento nesse arquivo. tente uma foto mais nítida ou use #despesa.');
                }
                await ctx.responder(lancamentoIA.lancarAcoes(ctx.conta, acoes, '🧾 *comprovante lançado*', ctx.prefixo), { citar: true });
                await ctx.reagir('✅');
            },
        },
    ],
};
