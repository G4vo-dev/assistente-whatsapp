// Lançamentos feitos pela IA: o que foi escrito, falado ou fotografado vira uma lista de ações em JSON.
// Usado pelo #iagerente, pelo áudio automático, pelo #comprovante e pelo #lerextrato.
const fin = require('./financas');
const ia = require('./ia');
const midia = require('./midia');
const { metodoConhecido } = require('./financas-modelo');
const { depoisDeLancar } = require('./financas-texto');
const { reais, lerValor, lerData, hojeISO, dataCurta, normalizar } = require('../util/formato');

const SISTEMA_JSON = 'você converte frases em JSON. responda apenas com JSON válido.';

// Palavras que indicam que o áudio fala de dinheiro.
const PALAVRAS_DE_DINHEIRO = new RegExp('\\b(gastei|gasto|paguei|pagar|comprei|compra|recebi|ganhei|caiu|despesa|receita|parcel\\w*|pix|credito|debito|cartao'
    + '|reais|real|conto|contos|pila|grana|fatura|fixo|meta|salario|transferi|transferencia|vendi|depositei|saquei|investi|emprestei|boleto)\\b'
    + '|r\\$|\\d+\\s*(reais|conto)');

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

// Instruções para a IA ler o print (ou PDF) do extrato do banco ou da fatura do cartão.
function promptDeExtrato(conta, observacao) {
    return `Este arquivo deve ser um extrato bancário (print do app do banco, conta corrente, poupança ou carteira digital) ou uma fatura de cartão de crédito. Hoje é ${hojePorExtenso()}.\n`
        + `Cartões de crédito cadastrados: ${conta.cartoes.map((c) => c.nome).join(', ') || 'nenhum'}.\n`
        + 'Liste TODAS as movimentações que aparecem, uma por item, na mesma ordem do arquivo. Responda SOMENTE com uma lista JSON, sem explicação.\n'
        + 'Cada item: {"acao":"despesa"|"receita","valor":numero positivo,"metodo":"pix"|"debito"|"credito"|"boleto"|"transferencia"|"dinheiro",'
        + '"cartao":"nome do cartão se for fatura de cartão","categoria":"uma palavra (mercado, comida, transporte, contas, saude, lazer, compras, assinaturas, salario, transferencia, fatura, outros)",'
        + '"data":"dd/mm/aaaa","descricao":"loja, pessoa ou serviço, curto"}\n'
        + 'Regras:\n'
        + '- Dinheiro que ENTROU (Pix recebido, salário, depósito, estorno, reembolso, resgate) é "receita". Dinheiro que SAIU (compra, Pix enviado, pagamento, tarifa, saque, aplicação) é "despesa". O valor é sempre positivo.\n'
        + '- NÃO inclua linhas de saldo (saldo do dia, saldo anterior, saldo disponível), totais, limite, rendimento previsto nem propaganda.\n'
        + '- Datas que aparecem como título ("12 NOV", "Hoje", "Ontem") valem para as linhas abaixo delas. Se a data não mostrar o ano, use o ano de hoje; se assim ela ficar depois de hoje, use o ano anterior.\n'
        + '- Fatura de cartão de crédito: "metodo":"credito". Compra parcelada aparece como "03/10": use o valor da parcela mostrado e coloque "(3/10)" no fim da descrição. "Pagamento recebido" na fatura é "receita" com categoria "fatura".\n'
        + '- Pagamento de fatura de cartão no extrato da conta: "despesa" com categoria "fatura".\n'
        + '- Não invente nada. Se não der para ler o valor de uma linha, pule a linha.\n'
        + 'Se o arquivo não for um extrato nem uma fatura, responda [].'
        + (observacao ? `\nObservação do usuário: "${observacao}"` : '');
}

// Valor que a IA mandou: número (45.9) ou texto ("45,90", "-45,90", "R$ 1.200,00"). Sempre positivo.
function valorDaAcao(v) {
    const n = typeof v === 'number' ? v : lerValor(String(v ?? '').replace(/^[-−]\s*/, '').replace(/^r\$\s*/i, ''));
    return Math.round(Math.abs(n) * 100) / 100;
}

// Aplica uma ação devolvida pela IA. Devolve o texto do que foi feito ou o motivo de não fazer.
// repetidas (opcional): lançamentos que já existiam; se a ação bater com um deles, é pulada (devolve null).
function aplicarAcao(conta, a, novas = [], repetidas = null) {
    const valor = valorDaAcao(a.valor);
    if (!(valor > 0)) return `⚠️ ignorei "${a.descricao || a.acao}": valor inválido`;
    const descricao = String(a.descricao || a.desc || a.titulo || a.acao).slice(0, 80);
    const acao = normalizar(a.acao);

    if (acao === 'receita' || acao === 'despesa') {
        const metodo = metodoConhecido(a.metodo) || 'conta';
        let cartao = null;
        if (metodo === 'credito') {
            cartao = fin.acharCartao(conta, a.cartao)?.nome || (conta.cartoes.length === 1 ? conta.cartoes[0].nome : null);
            if (!cartao) return `⚠️ ignorei "${descricao}": não sei em qual cartão de crédito`;
        }
        const dados = {
            tipo: acao, valor, metodo, cartao,
            categoria: String(a.categoria || 'outros').split(/\s+/)[0].toLowerCase(),
            data: lerData(a.data) || hojeISO(),
            descricao,
        };
        const parcelas = Math.min(48, Math.max(1, parseInt(a.parcelas, 10) || 1));
        if (repetidas && parcelas === 1 && fin.tirarRepetida(repetidas, dados)) return null;
        const criadas = parcelas > 1 ? fin.adicionarParcelado(conta, dados, parcelas) : [fin.adicionarTransacao(conta, dados)];
        novas.push(...criadas.map((c) => c.transacao));
        const { transacao, numero } = criadas[0];
        const forma = cartao ? `💳 ${cartao}` : metodo;
        const vezes = parcelas > 1 ? ` · ${parcelas}x de ${reais(transacao.valor)}` : '';
        return `${acao === 'receita' ? '🟢' : '🔴'} nº ${numero} ${transacao.descricao} · ${reais(valor)}${vezes} · ${forma} · ${dataCurta(transacao.data)} · 🏷️ ${transacao.categoria}`;
    }
    if (acao === 'fixo') {
        conta.fixos.push({ descricao, valor });
        return `📌 fixo: ${descricao} · ${reais(valor)}/mês`;
    }
    if (acao === 'meta') {
        const prioridade = fin.prioridadeValida(a.prioridade) || 'media';
        conta.metas.push({ titulo: descricao, valorAlvo: valor, guardado: 0, prioridade, criadaEm: new Date().toISOString() });
        return `🎯 meta: ${descricao} · ${reais(valor)} · ${prioridade}`;
    }
    return `⚠️ ignorei uma ação desconhecida (${a.acao})`;
}

function numeroDaLinha(linha = '') {
    return (linha.match(/nº (\d+)/) || [])[1] || 1;
}

// Lança as ações na carteira e monta a resposta. Devolve { texto, lancadas, puladas }.
// limite: quantas ações no máximo. pularRepetidas: não lança o que já estava anotado (mesmo tipo, valor e dia).
function lancarAcoes(ref, acoes, titulo, prefixo, { limite = 20, pularRepetidas = false } = {}) {
    return fin.alterarConta(ref, (c) => {
        const novas = [];
        const repetidas = pularRepetidas ? c.transacoes.slice() : null;
        const resultado = acoes.slice(0, limite).map((a) => aplicarAcao(c, a, novas, repetidas));
        const feitas = resultado.filter(Boolean);
        const puladas = resultado.length - feitas.length;
        const resumo = novas.length ? depoisDeLancar(c, novas, prefixo) : '';
        const p = prefixo;
        let txt = titulo;
        if (feitas.length) txt += `\n\n${feitas.join('\n')}`;
        if (puladas) txt += `\n\n♻️ ${puladas} já estava${puladas > 1 ? 'm' : ''} anotado${puladas > 1 ? 's' : ''}, pulei para não repetir.`;
        if (acoes.length > limite) txt += `\n⚠️ li só os ${limite} primeiros. mande o resto em outro print.`;
        if (resumo) txt += `\n\n${resumo}`;
        if (novas.length) {
            txt += pularRepetidas
                ? `\n\n✏️ *errou algo?*\n${p}editar [nº] [o que mudar] · ex: ${p}editar ${numeroDaLinha(feitas.find((l) => l.startsWith('🔴')) || feitas[0])} mercado\n${p}apagar [nº] para tirar um`
                : `\nerrou algo? ${p}editar [nº] ou ${p}apagar [nº]`;
        }
        return { texto: txt, lancadas: novas.length, puladas };
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
    return lancarAcoes(ref, acoes, titulo, prefixo).texto;
}

// Áudio do WhatsApp (alvo de acharMidia) -> texto.
async function transcrever(bot, alvo) {
    const dados = await midia.baixarDaMensagem(bot, alvo.mensagem);
    const mimetype = String(alvo.info?.mimetype || 'audio/ogg').split(';')[0];
    const extensao = mimetype.includes('mpeg') ? 'mp3' : mimetype.includes('mp4') ? 'm4a' : 'ogg';
    return ia.transcreverAudio(dados, `audio.${extensao}`, mimetype);
}

module.exports = { falaDeDinheiro, promptDeLancamento, promptDeComprovante, promptDeExtrato, valorDaAcao, aplicarAcao, lancarAcoes, lancarPorTexto, transcrever };
