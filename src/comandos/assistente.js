// Áudio vira texto (e lançamento); foto de comprovante e print do extrato viram lançamentos.
const fin = require('../servicos/financas');
const ia = require('../servicos/ia');
const midia = require('../servicos/midia');
const lancamentoIA = require('../servicos/lancamento-ia');
const { acharMidia } = require('../util/mensagem');
const { IA_MODO_PRIVADO } = require('../config');
const { metodoConhecido } = require('../servicos/financas-modelo');

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

// ---------- foto, print e PDF ----------

// Acha a foto/PDF na mensagem ou na respondida. Devolve { alvo, mimetype, ehPdf } ou null.
function arquivoDaMensagem(ctx) {
    const alvo = acharMidia(ctx.msg, ctx.conteudo, TIPOS_IMAGEM);
    const mimetype = String(alvo?.info?.mimetype || '').split(';')[0];
    const ehPdf = mimetype === 'application/pdf';
    if (!alvo || !(mimetype.startsWith('image/') || ehPdf)) return null;
    return { alvo, mimetype, ehPdf };
}

// Motivo para não conseguir ler o arquivo agora, ou null se dá para ler.
function semIAParaArquivo(ehPdf) {
    if (ehPdf && !ia.iaLigada('pdf')) {
        return IA_MODO_PRIVADO
            ? '🔒 o modo privado está ligado e só o Gemini lê PDF. mande um print (foto da tela).'
            : '❌ para ler PDF, coloque a GEMINI_API_KEY no .env (ou mande um print, foto da tela).';
    }
    if (!ia.iaLigada(ehPdf ? 'pdf' : 'imagem')) return ia.SEM_CHAVE;
    return null;
}

async function baixarArquivo(ctx, { alvo, mimetype, ehPdf }) {
    const baixado = await midia.baixarDaMensagem(ctx.bot, alvo.mensagem);
    return ehPdf ? { dados: baixado, tipo: mimetype } : midia.prepararImagem(baixado, mimetype);
}

// ---------- print do extrato ----------

// Depois de um #lerextrato, os próximos prints mandados em pouco tempo (álbum, extrato comprido) também são lidos.
const SEGUNDOS_MODO_EXTRATO = 90;
const modoExtrato = new Map(); // jid -> { ate, observacao }

function extratoAtivo(jid) {
    const modo = modoExtrato.get(jid);
    if (!modo) return null;
    if (modo.ate < Date.now()) {
        modoExtrato.delete(jid);
        return null;
    }
    return modo;
}

function ligarModoExtrato(jid, observacao) {
    modoExtrato.set(jid, { ate: Date.now() + SEGUNDOS_MODO_EXTRATO * 1000, observacao });
}

// Compras no crédito precisam de um cartão: o que a IA leu, o dito na observação ("#lerextrato nubank")
// ou o único cadastrado. Devolve { acoes, semCartao } (semCartao = compras que ficaram de fora).
function escolherCartoes(conta, acoes, palavras) {
    const cartaoDito = palavras.map((x) => fin.acharCartao(conta, x)).find(Boolean)?.nome;
    const unico = conta.cartoes.length === 1 ? conta.cartoes[0].nome : null;
    const semCartao = [];
    const comCartao = acoes.filter((a) => {
        if (a.metodo !== 'credito') return true;
        const cartao = fin.acharCartao(conta, a.cartao)?.nome || cartaoDito || unico;
        if (!cartao) {
            semCartao.push(a);
            return false;
        }
        a.cartao = cartao;
        return true;
    });
    return { acoes: comCartao, semCartao };
}

// Lê o print/PDF do extrato e lança cada movimentação. Pula o que já estava anotado.
async function lerExtrato(ctx) {
    const arquivo = arquivoDaMensagem(ctx);
    const p = ctx.prefixo;
    if (!arquivo) {
        return ctx.responder(`❌ mande o print do extrato com a legenda ${p}lerextrato, ou responda o print com ${p}lerextrato.\n`
            + 'dica: num álbum de vários prints, basta a legenda no primeiro.');
    }
    const semIA = semIAParaArquivo(arquivo.ehPdf);
    if (semIA) return ctx.responder(semIA);

    const observacao = ctx.automatico ? extratoAtivo(ctx.jid)?.observacao || '' : ctx.texto;
    ligarModoExtrato(ctx.jid, observacao);
    await ctx.reagir('⏳');
    const imagem = await baixarArquivo(ctx, arquivo);
    const conta = fin.lerConta(ctx.conta);
    const resposta = await ia.perguntarSobreImagem(imagem.dados, imagem.tipo, lancamentoIA.promptDeExtrato(conta, observacao), { maxTokens: 6000 });
    const lidas = (ia.extrairListaJson(resposta) || []).filter((a) => a && (a.acao === 'receita' || a.acao === 'despesa'));
    if (!lidas.length) {
        await ctx.reagir('❌');
        return ctx.responder(ia.ehFalha(resposta) ? resposta
            : `🤷 não achei movimentações nesse arquivo. tente um print mais nítido (sem cortar os valores) ou lance com ${p}despesa.`);
    }

    // extrato não cria parcelas futuras: cada linha é o que aconteceu naquele dia
    const normalizadas = lidas.map((a) => ({ ...a, parcelas: 1, metodo: metodoConhecido(a.metodo) || 'pix' }));
    const { acoes, semCartao } = escolherCartoes(conta, normalizadas, ctx.args.concat(observacao.split(/\s+/)));

    const { texto, lancadas } = lancamentoIA.lancarAcoes(ctx.conta, acoes, '📥 *extrato lido*', p, { limite: 80, pularRepetidas: true });
    let aviso = '';
    if (semCartao.length) {
        const nomes = conta.cartoes.map((c) => c.nome).join(', ');
        aviso = conta.cartoes.length
            ? `\n\n💳 ${semCartao.length} compra(s) no crédito ficaram de fora porque não sei de qual cartão. responda o print com ${p}lerextrato [cartão] (${nomes}).`
            : `\n\n💳 ${semCartao.length} compra(s) no crédito ficaram de fora: cadastre o cartão com ${p}cartao adicionar [nome] [limite] e responda o print com ${p}lerextrato [cartão].`;
    }
    const mais = `\n\n📸 tem mais prints? mande nos próximos ${SEGUNDOS_MODO_EXTRATO} segundos que eu leio também (sem precisar de legenda).`;
    await ctx.responder(`${texto}${aviso}${mais}`, { citar: true });
    await ctx.reagir(lancadas ? '✅' : '♻️');
}

module.exports = {
    titulo: '🎙️ *áudio, comprovante & extrato*',
    audioAutomatico,
    lerExtrato,
    extratoAtivo,
    arquivoDaMensagem,
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
                const arquivo = arquivoDaMensagem(ctx);
                if (!arquivo) {
                    return ctx.responder(`❌ mande a foto/PDF do comprovante com a legenda ${ctx.prefixo}comprovante ou responda o arquivo com ${ctx.prefixo}comprovante`);
                }
                const semIA = semIAParaArquivo(arquivo.ehPdf);
                if (semIA) return ctx.responder(semIA);
                await ctx.reagir('⏳');
                const imagem = await baixarArquivo(ctx, arquivo);
                const pergunta = lancamentoIA.promptDeComprovante(fin.lerConta(ctx.conta), ctx.texto);
                const resposta = await ia.perguntarSobreImagem(imagem.dados, imagem.tipo, pergunta);
                const acoes = ia.extrairListaJson(resposta);
                if (!acoes?.length) {
                    await ctx.reagir('❌');
                    return ctx.responder(ia.ehFalha(resposta) ? resposta : `🤷 não achei um valor de pagamento nesse arquivo. tente uma foto mais nítida ou use ${ctx.prefixo}despesa.`);
                }
                await ctx.responder(lancamentoIA.lancarAcoes(ctx.conta, acoes, '🧾 *comprovante lançado*', ctx.prefixo).texto, { citar: true });
                await ctx.reagir('✅');
            },
        },
        {
            nome: 'lerextrato',
            apelidos: ['printextrato', 'importarextrato', 'importar', 'lerfatura'],
            uso: 'lerextrato [cartão ou observação]',
            descricao: 'print ou PDF do extrato do banco vira lançamentos, um por linha',
            ajuda: 'mande o print do extrato (ou da fatura do cartão) com a legenda #lerextrato, ou responda o print. '
                + 'a IA anota cada movimentação e mostra o número de cada uma para você corrigir só o que precisar com #editar. '
                + 'o que já estava anotado (mesmo valor, mesmo dia) é pulado, então pode mandar prints que se repetem. '
                + 'vários prints: mande em álbum com a legenda só no primeiro, ou mande um atrás do outro logo depois. '
                + 'fatura de cartão: diga qual (#lerextrato nubank). PDF precisa da GEMINI_API_KEY. '
                + 'também funciona com #extrato na legenda do print.',
            exemplos: ['lerextrato (na legenda do print)', 'lerextrato nubank (print da fatura do cartão nubank)', 'lerextrato conta do inter'],
            executar: lerExtrato,
        },
    ],
};
