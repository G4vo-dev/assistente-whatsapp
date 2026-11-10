const lembretes = require('../servicos/lembretes');
const { reais, dataHora } = require('../util/formato');
const { buscarJson } = require('../util/web');

const URL_COTACOES = 'https://economia.awesomeapi.com.br/last/USD-BRL,EUR-BRL,GBP-BRL,BTC-BRL';
const MAX_MINUTOS = 7 * 24 * 60;

// Aceita "10", "10m", "10min", "2h" e "1h30".
function lerMinutos(texto) {
    const t = String(texto || '').toLowerCase();
    let m = t.match(/^(\d+)(m|min)?$/);
    if (m) return Number(m[1]);
    m = t.match(/^(\d+)h(\d+)?(m|min)?$/);
    if (m) return Number(m[1]) * 60 + Number(m[2] || 0);
    return NaN;
}

module.exports = {
    titulo: '🎲 *utilitários*',
    comandos: [
        {
            nome: 'dado',
            uso: 'dado [lados]',
            descricao: 'rola um dado (padrão d6)',
            async executar(ctx) {
                const faces = Math.min(Math.max(parseInt(ctx.args[0], 10) || 6, 2), 1000);
                const numero = Math.floor(Math.random() * faces) + 1;
                await ctx.responder(`🎲 d${faces}: *${numero}*`);
            },
        },
        {
            nome: 'moeda',
            apelidos: ['cotacao', 'dolar'],
            descricao: 'dólar, euro, libra e bitcoin',
            async executar(ctx) {
                let dados;
                try {
                    dados = await buscarJson(URL_COTACOES, { tempoMs: 10000 });
                    if (!dados) throw new Error('cotações não encontradas');
                } catch (erro) {
                    console.error('⚠️ cotação:', erro.message);
                    return ctx.responder('❌ não consegui buscar as cotações agora. tente de novo em instantes.');
                }
                const valor = (par) => reais(Number(dados[par].bid));
                await ctx.responder(
                    `📉 *cotações*\n\n💵 dólar: ${valor('USDBRL')}\n💶 euro: ${valor('EURBRL')}\n💷 libra: ${valor('GBPBRL')}\n🪙 bitcoin: ${valor('BTCBRL')}`,
                );
            },
        },
        {
            nome: 'lembrar',
            apelidos: ['lembrete'],
            uso: 'lembrar [tempo] [msg]',
            descricao: 'avisa depois (10, 30m, 2h, 1h30)',
            async executar(ctx) {
                const minutos = lerMinutos(ctx.args[0]);
                const texto = ctx.texto.slice(String(ctx.args[0] || '').length).trim();
                if (!(minutos > 0) || !texto) {
                    return ctx.responder(`❌ uso: ${ctx.prefixo}lembrar 10 tirar a comida do fogo\n(também aceita 30m, 2h, 1h30)`);
                }
                if (minutos > MAX_MINUTOS) return ctx.responder('❌ o máximo é 7 dias.');
                const l = lembretes.criar(ctx.jid, minutos, texto);
                await ctx.responder(`✅ lembrete marcado para ${dataHora(l.quando)}.`);
            },
        },
        {
            nome: 'lembretes',
            descricao: 'lista os lembretes marcados',
            async executar(ctx) {
                const lista = lembretes.listar(ctx.jid);
                if (!lista.length) return ctx.responder('📭 nenhum lembrete marcado.');
                let txt = '⏰ *lembretes*\n\n';
                lista.forEach((l, i) => { txt += `${i + 1}. ${dataHora(l.quando)} · ${l.texto}\n`; });
                txt += `\npara cancelar: ${ctx.prefixo}cancelar [número]`;
                await ctx.responder(txt);
            },
        },
        {
            nome: 'cancelar',
            uso: 'cancelar [número]',
            descricao: 'cancela um lembrete',
            async executar(ctx) {
                const posicao = parseInt(ctx.args[0], 10);
                const removido = posicao > 0 ? lembretes.cancelar(ctx.jid, posicao) : null;
                if (!removido) return ctx.responder(`❌ não achei esse lembrete. veja os números em ${ctx.prefixo}lembretes`);
                await ctx.responder(`🗑️ lembrete cancelado: ${removido.texto}`);
            },
        },
    ],
};
