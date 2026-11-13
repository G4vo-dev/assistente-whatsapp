// Ajuda para estudar: explicação passo a passo (#estudar) e perguntas para treinar (#quiz / #resposta).
const ia = require('../servicos/ia');

const SISTEMA_PROFESSOR = 'você é um professor paciente que ensina quem está aprendendo a programar. '
    + 'explique o porquê das coisas, não só o como. use linguagem simples, sem jargão; se um termo técnico for inevitável, explique em poucas palavras. '
    + 'vá passo a passo, com um exemplo curto. termine com uma pergunta para o aluno pensar. '
    + 'use a formatação do WhatsApp (*negrito*, _itálico_), sem markdown com ## ou **.';

// conversa -> { tema, pergunta, resposta, explicacao, acertos, total }
const quizzes = new Map();

function lerPergunta(texto) {
    const bruto = String(texto || '').match(/\{[\s\S]*\}/)?.[0];
    if (!bruto) return null;
    try {
        const dados = JSON.parse(bruto);
        if (!dados.pergunta || !dados.resposta) return null;
        return { pergunta: String(dados.pergunta), resposta: String(dados.resposta), explicacao: String(dados.explicacao || '') };
    } catch {
        return null;
    }
}

module.exports = {
    titulo: '📚 *estudos*',
    comandos: [
        {
            nome: 'estudar',
            apelidos: ['explicar'],
            uso: 'estudar [tema]',
            descricao: 'a IA explica o tema passo a passo, com o porquê',
            exemplos: ['estudar laços de repetição', 'estudar o que é uma função'],
            async executar(ctx) {
                if (!ctx.texto) return ctx.responder(`❌ ex: ${ctx.prefixo}estudar laços de repetição`);
                await ctx.reagir('⏳');
                const resposta = await ia.perguntarIA(`Explique para um iniciante: ${ctx.texto}`, { sistema: SISTEMA_PROFESSOR, maxTokens: 1500 });
                await ctx.responder(`📚 ${resposta}`, { citar: true });
                await ctx.reagir('✅');
            },
        },
        {
            nome: 'quiz',
            uso: 'quiz [tema]',
            descricao: 'a IA faz uma pergunta sobre o tema para você treinar',
            ajuda: 'responda com "resposta [sua resposta]". o bot corrige, explica e conta seus acertos. sem tema, repete o último.',
            exemplos: ['quiz variáveis', 'quiz', 'resposta é um espaço na memória com nome'],
            async executar(ctx) {
                const anterior = quizzes.get(ctx.jid);
                const tema = ctx.texto || anterior?.tema;
                if (!tema) return ctx.responder(`❌ ex: ${ctx.prefixo}quiz variáveis`);
                await ctx.reagir('⏳');
                const bruto = await ia.perguntarIA(
                    `Faça UMA pergunta de estudo (nível iniciante) sobre: ${tema}.\n`
                    + 'Responda SOMENTE com JSON neste formato: {"pergunta":"...","resposta":"resposta esperada, curta","explicacao":"1 ou 2 frases explicando o porquê"}',
                    { sistema: 'você cria perguntas de estudo. responda apenas com JSON válido.', temperatura: 0.6 },
                );
                const q = lerPergunta(bruto);
                if (!q) {
                    return ctx.responder(bruto.startsWith('❌') ? bruto : '❌ não consegui montar a pergunta agora. tente de novo.');
                }
                quizzes.set(ctx.jid, { tema, ...q, aberta: true, acertos: anterior?.tema === tema ? anterior.acertos : 0, total: anterior?.tema === tema ? anterior.total : 0 });
                await ctx.responder(`🧠 *quiz · ${tema}*\n\n${q.pergunta}\n\nresponda com ${ctx.prefixo}resposta [sua resposta]`);
            },
        },
        {
            nome: 'resposta',
            uso: 'resposta [sua resposta]',
            descricao: 'responde a pergunta do quiz',
            async executar(ctx) {
                const q = quizzes.get(ctx.jid);
                if (!q?.aberta) return ctx.responder(`🤷 nenhuma pergunta aberta. peça uma com ${ctx.prefixo}quiz [tema]`);
                if (!ctx.texto) return ctx.responder(`❌ escreva sua resposta. ex: ${ctx.prefixo}resposta é um espaço na memória`);
                await ctx.reagir('⏳');
                const avaliacao = await ia.perguntarIA(
                    `Pergunta: ${q.pergunta}\nResposta esperada: ${q.resposta}\nResposta do aluno: ${ctx.texto}\n\n`
                    + 'Na primeira linha escreva só CERTO, PARCIAL ou ERRADO (aceite respostas com outras palavras mas o mesmo sentido). '
                    + 'Depois, em até 2 frases simples, explique o porquê.',
                    { sistema: 'você corrige respostas de estudo com gentileza e clareza.', temperatura: 0.1 },
                );
                const veredito = (avaliacao.match(/\b(CERTO|PARCIAL|ERRADO)\b/i)?.[1] || 'ERRADO').toUpperCase();
                const comentario = avaliacao.replace(/^.*?\b(CERTO|PARCIAL|ERRADO)\b[:.!\s]*/is, '').trim();
                q.aberta = false;
                q.total += 1;
                if (veredito === 'CERTO') q.acertos += 1;
                const titulo = veredito === 'CERTO' ? '✅ *certo!*' : veredito === 'PARCIAL' ? '🟡 *quase!*' : '❌ *não foi dessa vez*';
                let txt = `${titulo}${comentario ? `\n${comentario}` : ''}`;
                if (veredito !== 'CERTO') txt += `\n\n*resposta esperada:* ${q.resposta}`;
                if (q.explicacao) txt += `\n_${q.explicacao}_`;
                txt += `\n\n📊 placar: ${q.acertos}/${q.total} · outra pergunta: ${ctx.prefixo}quiz`;
                await ctx.responder(txt, { citar: true });
            },
        },
    ],
    quizzes,
};
