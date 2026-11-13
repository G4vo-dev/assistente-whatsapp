const ia = require('../servicos/ia');
const lancamentoIA = require('../servicos/lancamento-ia');
const { comandoDeIA } = require('./pergunta-ia');
const { acharMidia } = require('../util/mensagem');
const { horaCurta } = require('../util/formato');
const comandoChave = require('./chave');
const chaves = require('../servicos/ia/chaves');

module.exports = {
    titulo: '🤖 *IA*',
    comandos: [
        comandoDeIA({
            nome: 'ia',
            descricao: 'pergunta qualquer coisa pra IA',
            exemplo: 'qual o melhor pokémon de fogo?',
        }),
        {
            nome: 'ias',
            apelidos: ['provedores', 'filaia'],
            descricao: 'quais IAs estão ligadas e a fila de cada tarefa',
            ajuda: 'cada tarefa tenta as IAs na ordem da fila. se uma bater no limite, fica descansando e a próxima assume. '
                + 'para ligar mais IAs, coloque as chaves no .env: GROQ_API_KEY, GEMINI_API_KEY, MISTRAL_API_KEY, OPENROUTER_API_KEY. '
                + 'cada pessoa também pode usar a própria chave com #chave.',
            async executar(ctx) {
                const { provedores, filas } = ia.situacao();
                const CHAVES = { groq: 'GROQ_API_KEY', gemini: 'GEMINI_API_KEY', mistral: 'MISTRAL_API_KEY', openrouter: 'OPENROUTER_API_KEY' };
                const linhas = provedores.map((p) => {
                    if (!p.ligado) return `⚪ ${p.titulo} · sem chave (${chaves.ehDono() ? CHAVES[p.nome] : `${ctx.prefixo}chave ${p.nome}`})`;
                    const usos = `${p.usos} resposta(s)`;
                    if (p.parados.length) {
                        const detalhes = p.parados.map((x) => `${x.capacidade}: ${x.d.motivo} até ${horaCurta(x.d.ate)}`).join(', ');
                        return `💤 ${p.titulo} · ${usos} · descansando (${detalhes})`;
                    }
                    return `✅ ${p.titulo} · ${usos}`;
                });
                const NOMES = { texto: 'conversa', financas: 'finanças', imagem: 'foto', pdf: 'pdf', audio: 'áudio' };
                const ordem = Object.entries(filas).map(([tarefa, lista]) => `${NOMES[tarefa]}: ${lista.length ? lista.join(' → ') : 'nenhuma IA ligada'}`);
                await ctx.responder(`🤖 *IAs do bot*\n\n${linhas.join('\n')}\n\n*fila de cada tarefa*\n${ordem.join('\n')}\n\n🔑 de quem é cada chave: ${ctx.prefixo}chave`);
            },
        },
        comandoChave,
        comandoDeIA({
            nome: 'iaeco',
            apelidos: ['economista'],
            descricao: 'pergunta pra uma IA economista',
            exemplo: 'vale mais a pena CDB ou tesouro selic?',
            sistema: 'você é um economista sênior brasileiro. explique de forma clara, com exemplos em reais, '
                + 'considerando a realidade do Brasil. responda em português com formatação do WhatsApp. '
                + 'explique conceitos e prós e contras; não recomende comprar ou vender ativos específicos e não prometa rentabilidade.',
            rodape: '⚠️ _conteúdo gerado por IA, só para informação. não é recomendação de investimento nem consultoria financeira; a IA pode errar._',
        }),
        {
            nome: 'iagerente',
            apelidos: ['gerente'],
            uso: 'iagerente [o que você gastou/recebeu]',
            descricao: 'escreva normal e a IA lança nas finanças',
            exemplos: ['iagerente gastei 45 no ifood ontem no pix e 120 de mercado no crédito do nubank', 'iagerente comprei um fone de 400 em 4x no itau', 'iagerente (respondendo um áudio)'],
            async executar(ctx) {
                if (!ia.iaLigada('financas')) return ctx.responder(ia.semChave());
                // também funciona respondendo um áudio
                const audio = !ctx.texto && acharMidia(ctx.msg, ctx.conteudo, ['audioMessage']);
                if (!ctx.texto && !audio) return ctx.responder(`❌ conte o que aconteceu. ex: ${ctx.prefixo}iagerente gastei 30 de uber no pix\n(ou responda um áudio com ${ctx.prefixo}iagerente)`);
                await ctx.reagir('⏳');
                const pedido = ctx.texto || await lancamentoIA.transcrever(ctx.bot, audio);
                const resposta = await lancamentoIA.lancarPorTexto(ctx.conta, pedido, '✅ *lançado pela IA*', ctx.prefixo);
                if (!resposta) {
                    await ctx.reagir('❌');
                    return ctx.responder(`❌ a IA não entendeu. tente de novo com valores claros, ou use ${ctx.prefixo}despesa.`);
                }
                await ctx.responder(resposta);
                await ctx.reagir('✅');
            },
        },
    ],
};
