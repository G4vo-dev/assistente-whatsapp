const fin = require('../servicos/financas');
const { depoisDeLancar } = require('./financas');
const ia = require('../servicos/ia');
const { metodoConhecido } = require('../servicos/financas-modelo');
const { reais, lerValor, lerData, hojeISO, dataCurta } = require('../util/formato');
const { acharMidia } = require('../util/mensagem');

function perguntaSimples({ nome, apelidos, descricao, exemplo, sistema, rodape }) {
    return {
        nome,
        apelidos,
        uso: `${nome} [pergunta]`,
        descricao,
        exemplos: [`${nome} ${exemplo}`],
        async executar(ctx) {
            if (!ctx.texto) return ctx.responder(`❌ escreva a pergunta. ex: ${ctx.prefixo}${nome} ${exemplo}`);
            await ctx.reagir('⏳');
            const resposta = await ia.perguntarIA(ctx.texto, sistema ? { sistema } : undefined);
            await ctx.responder(rodape && !resposta.startsWith('❌') ? `${resposta}\n\n${rodape}` : resposta, { citar: true });
            await ctx.reagir('✅');
        },
    };
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

// Lança as ações e monta a resposta (usado também pelo áudio e pelo comprovante).
function lancarAcoes(ctx, acoes, titulo) {
    return fin.alterarConta(ctx.conta, (c) => {
        const novas = [];
        const feitas = acoes.slice(0, 20).map((a) => aplicarAcao(c, a, novas));
        const resumo = novas.length ? depoisDeLancar(c, novas, ctx.prefixo) : '';
        return `${titulo}\n\n${feitas.join('\n')}${resumo ? `\n\n${resumo}` : ''}\nerrou algo? ${ctx.prefixo}apagar [nº]`;
    });
}

// Instruções para a IA transformar texto em lançamentos.
function promptDeLancamento(conta, pedido) {
    const [ano, mes, dia] = hojeISO().split('-');
    return `Hoje é ${dia}/${mes}/${ano}. Cartões de crédito cadastrados: ${conta.cartoes.map((c) => c.nome).join(', ') || 'nenhum'}.\n`
        + 'Transforme o pedido abaixo em uma lista JSON de ações. Responda SOMENTE com o JSON, sem explicação.\n'
        + 'Cada item: {"acao":"receita"|"despesa"|"fixo"|"meta","valor":numero total,"parcelas":numero (1 se à vista),'
        + '"metodo":"pix"|"debito"|"credito"|"dinheiro"|"boleto","cartao":"nome do cartão se for crédito","categoria":"uma palavra",'
        + '"data":"dd/mm/aaaa","descricao":"texto curto","prioridade":"alta"|"media"|"baixa"}\n'
        + '"fixo" = conta que se repete todo mês. "meta" = objetivo para juntar dinheiro. Se não souber o método, use "pix". '
        + 'Se não houver nenhum gasto, ganho, conta fixa ou meta no pedido, responda [].\n'
        + `Pedido: "${pedido}"`;
}

module.exports = {
    lancarAcoes,
    promptDeLancamento,
    titulo: '🤖 *IA*',
    comandos: [
        perguntaSimples({
            nome: 'ia',
            descricao: 'pergunta qualquer coisa pra IA',
            exemplo: 'qual o melhor pokémon de fogo?',
        }),
        {
            nome: 'ias',
            apelidos: ['provedores', 'filaia'],
            descricao: 'quais IAs estão ligadas e a fila de cada tarefa',
            ajuda: 'cada tarefa tenta as IAs na ordem da fila. se uma bater no limite, fica descansando e a próxima assume. '
                + 'para ligar mais IAs, coloque as chaves no .env: GROQ_API_KEY, GEMINI_API_KEY, MISTRAL_API_KEY, OPENROUTER_API_KEY.',
            async executar(ctx) {
                const { provedores, filas } = ia.situacao();
                const CHAVES = { groq: 'GROQ_API_KEY', gemini: 'GEMINI_API_KEY', mistral: 'MISTRAL_API_KEY', openrouter: 'OPENROUTER_API_KEY' };
                const hora = (ms) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
                const linhas = provedores.map((p) => {
                    if (!p.ligado) return `⚪ ${p.titulo} · sem chave (${CHAVES[p.nome]})`;
                    const usos = `${p.usos} resposta(s)`;
                    if (p.parados.length) {
                        const detalhes = p.parados.map((x) => `${x.capacidade}: ${x.d.motivo} até ${hora(x.d.ate)}`).join(', ');
                        return `💤 ${p.titulo} · ${usos} · descansando (${detalhes})`;
                    }
                    return `✅ ${p.titulo} · ${usos}`;
                });
                const NOMES = { texto: 'conversa', financas: 'finanças', imagem: 'foto', pdf: 'pdf', audio: 'áudio' };
                const ordem = Object.entries(filas).map(([tarefa, lista]) => `${NOMES[tarefa]}: ${lista.length ? lista.join(' → ') : 'nenhuma IA ligada'}`);
                await ctx.responder(`🤖 *IAs do bot*\n\n${linhas.join('\n')}\n\n*fila de cada tarefa*\n${ordem.join('\n')}`);
            },
        },
        perguntaSimples({
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
                if (!ia.iaLigada('financas')) return ctx.responder(ia.SEM_CHAVE);
                // também funciona respondendo um áudio
                const audio = !ctx.texto && acharMidia(ctx.msg, ctx.conteudo, ['audioMessage']);
                if (!ctx.texto && !audio) return ctx.responder(`❌ conte o que aconteceu. ex: ${ctx.prefixo}iagerente gastei 30 de uber no pix\n(ou responda um áudio com ${ctx.prefixo}iagerente)`);
                await ctx.reagir('⏳');
                const pedido = ctx.texto || await require('./assistente').transcrever(ctx, audio);
                const prompt = promptDeLancamento(fin.lerConta(ctx.conta), pedido);
                const resposta = await ia.perguntarIA(prompt, { sistema: 'você converte frases em JSON. responda apenas com JSON válido.', temperatura: 0.1, tarefa: 'financas' });
                const acoes = ia.extrairListaJson(resposta);
                if (!acoes?.length) {
                    await ctx.reagir('❌');
                    return ctx.responder(`❌ a IA não entendeu. tente de novo com valores claros, ou use ${ctx.prefixo}despesa.`);
                }
                await ctx.responder(lancarAcoes(ctx, acoes, '✅ *lançado pela IA*'));
                await ctx.reagir('✅');
            },
        },
    ],
};
