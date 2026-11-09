// Lançamentos feitos pela IA: o que foi escrito, falado ou fotografado vira uma lista de ações em JSON.
// Usado pelo #iagerente, pelo áudio automático e pelo #comprovante.
const fin = require('./financas');
const ia = require('./ia');
const midia = require('./midia');
const { metodoConhecido } = require('./financas-modelo');
const { depoisDeLancar } = require('./financas-texto');
const { reais, lerValor, lerData, hojeISO, dataCurta, normalizar } = require('../util/formato');

const SISTEMA_JSON = 'você converte frases em JSON. responda apenas com JSON válido.';

// Palavras que indicam que o áudio fala de dinheiro.
const PALAVRAS_DE_DINHEIRO = /\b(gastei|gasto|paguei|pagar|comprei|compra|recebi|ganhei|caiu|despesa|receita|parcel\w*|pix|credito|debito|cartao|reais|real|conto|contos|fatura|fixo|meta|salario)\b|r\$|\d+\s*(reais|conto)/;

function falaDeDinheiro(texto) {
    return PALAVRAS_DE_DINHEIRO.test(normalizar(texto));
}

function hojePorExtenso() {
    const [ano, mes, dia] = hojeISO().split('-');
    return `${dia}/${mes}/${ano}`;
}

// Instruções para a IA transformar texto em lançamentos.
function promptDeLancamento(conta, pedido) {
    return `Hoje é ${hojePorExtenso()}. Cartões de crédito cadastrados: ${conta.cartoes.map((c) => c.nome).join(', ') || 'nenhum'}.\n`
        + 'Transforme o pedido abaixo em uma lista JSON de ações. Responda SOMENTE com o JSON, sem explicação.\n'
        + 'Cada item: {"acao":"receita"|"despesa"|"fixo"|"meta","valor":numero total,"parcelas":numero (1 se à vista),'
        + '"metodo":"pix"|"debito"|"credito"|"dinheiro"|"boleto","cartao":"nome do cartão se for crédito","categoria":"uma palavra",'
        + '"data":"dd/mm/aaaa","descricao":"texto curto","prioridade":"alta"|"media"|"baixa"}\n'
        + '"fixo" = conta que se repete todo mês. "meta" = objetivo para juntar dinheiro. Se não souber o método, use "pix". '
        + 'Se não houver nenhum gasto, ganho, conta fixa ou meta no pedido, responda [].\n'
        + `Pedido: "${pedido}"`;
}

// Instruções para a IA ler uma foto/PDF de comprovante.
function promptDeComprovante(conta, observacao) {
    return `Este arquivo deve ser um comprovante de pagamento, print de Pix/transferência, nota fiscal, cupom ou recibo. Hoje é ${hojePorExtenso()}.\n`
        + `Cartões de crédito cadastrados: ${conta.cartoes.map((c) => c.nome).join(', ') || 'nenhum'}.\n`
        + 'Responda SOMENTE com uma lista JSON. Cada item: {"acao":"despesa"|"receita","valor":numero total,"parcelas":numero,'
        + '"metodo":"pix"|"debito"|"credito"|"dinheiro"|"boleto","cartao":"nome se for crédito","categoria":"uma palavra",'
        + '"data":"dd/mm/aaaa","descricao":"quem recebeu/loja, curto"}.\n'
        + 'Pix ou transferência que a pessoa RECEBEU é "receita"; o que ela pagou é "despesa". Use o valor total pago. '
        + 'Se não for um comprovante, responda [].'
        + (observacao ? `\nObservação do usuário: "${observacao}"` : '');
}

// Aplica uma ação devolvida pela IA. Devolve o texto do que foi feito ou o motivo de não fazer.
function aplicarAcao(conta, a, novas = []) {
    const valor = typeof a.valor === 'number' ? Math.round(a.valor * 100) / 100 : lerValor(a.valor);
    if (!(valor > 0)) return `⚠️ ignorei "${a.descricao || a.acao}": valor inválido`;
    const descricao = String(a.descricao || a.desc || a.titulo || a.acao).slice(0, 80);

    if (a.acao === 'receita' || a.acao === 'despesa') {
        const metodo = metodoConhecido(a.metodo) || 'conta';
        let cartao = null;
        if (metodo === 'credito') {
            cartao = fin.acharCartao(conta, a.cartao)?.nome || (conta.cartoes.length === 1 ? conta.cartoes[0].nome : null);
            if (!cartao) return `⚠️ ignorei "${descricao}": não sei em qual cartão de crédito`;
        }
        const dados = {
            tipo: a.acao, valor, metodo, cartao,
            categoria: String(a.categoria || 'outros').split(/\s+/)[0],
            data: lerData(a.data) || hojeISO(),
            descricao,
        };
        const parcelas = Math.min(48, Math.max(1, parseInt(a.parcelas, 10) || 1));
        const criadas = parcelas > 1 ? fin.adicionarParcelado(conta, dados, parcelas) : [fin.adicionarTransacao(conta, dados)];
        novas.push(...criadas.map((c) => c.transacao));
        const { transacao, numero } = criadas[0];
        const forma = cartao ? `💳 ${cartao}` : metodo;
        const vezes = parcelas > 1 ? ` · ${parcelas}x de ${reais(transacao.valor)}` : '';
        return `${a.acao === 'receita' ? '🟢' : '🔴'} nº ${numero} ${transacao.descricao} · ${reais(valor)}${vezes} · ${forma} · ${dataCurta(transacao.data)}`;
    }
    if (a.acao === 'fixo') {
        conta.fixos.push({ descricao, valor });
        return `📌 fixo: ${descricao} · ${reais(valor)}/mês`;
    }
    if (a.acao === 'meta') {
        const prioridade = fin.prioridadeValida(a.prioridade) || 'media';
        conta.metas.push({ titulo: descricao, valorAlvo: valor, guardado: 0, prioridade, criadaEm: new Date().toISOString() });
        return `🎯 meta: ${descricao} · ${reais(valor)} · ${prioridade}`;
    }
    return `⚠️ ignorei uma ação desconhecida (${a.acao})`;
}

// Lança as ações na carteira e monta a resposta.
function lancarAcoes(ref, acoes, titulo, prefixo) {
    return fin.alterarConta(ref, (c) => {
        const novas = [];
        const feitas = acoes.slice(0, 20).map((a) => aplicarAcao(c, a, novas));
        const resumo = novas.length ? depoisDeLancar(c, novas, prefixo) : '';
        return `${titulo}\n\n${feitas.join('\n')}${resumo ? `\n\n${resumo}` : ''}\nerrou algo? ${prefixo}apagar [nº]`;
    });
}

// Texto -> lançamentos. Devolve a resposta pronta ou null se a IA não achou nada para lançar.
async function lancarPorTexto(ref, texto, titulo, prefixo) {
    const resposta = await ia.perguntarIA(promptDeLancamento(fin.lerConta(ref), texto), {
        sistema: SISTEMA_JSON,
        temperatura: 0.1,
        tarefa: 'financas',
    });
    const acoes = ia.extrairListaJson(resposta);
    if (!acoes?.length) return null;
    return lancarAcoes(ref, acoes, titulo, prefixo);
}

// Áudio do WhatsApp (alvo de acharMidia) -> texto.
async function transcrever(bot, alvo) {
    const dados = await midia.baixarDaMensagem(bot, alvo.mensagem);
    const mimetype = String(alvo.info?.mimetype || 'audio/ogg').split(';')[0];
    const extensao = mimetype.includes('mpeg') ? 'mp3' : mimetype.includes('mp4') ? 'm4a' : 'ogg';
    return ia.transcreverAudio(dados, `audio.${extensao}`, mimetype);
}

module.exports = { falaDeDinheiro, promptDeLancamento, promptDeComprovante, aplicarAcao, lancarAcoes, lancarPorTexto, transcrever };
