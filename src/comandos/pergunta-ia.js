// Comandos que mandam a pergunta para a IA, cada um com o seu "papel" (#ia, #iaeco, #rom, #mc, #quimica).
const ia = require('../servicos/ia');

function comandoDeIA({ nome, apelidos, uso, descricao, exemplo, sistema, rodape }) {
    return {
        nome,
        apelidos,
        uso: uso || `${nome} [pergunta]`,
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

module.exports = { comandoDeIA };
