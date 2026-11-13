const fs = require('fs');
const { execFile } = require('child_process');
const ia = require('../servicos/ia');
const estado = require('../estado');
const lembretes = require('../servicos/lembretes');
const confiaveis = require('../servicos/confiaveis');
const { ultimoBackupDiario } = require('../servicos/armazenamento');
const config = require('../config');

const { IA_MODO_PRIVADO } = config;

// Bateria do celular (só existe no Termux, com o app Termux:API). Devolve null se não der.
function bateria() {
    return new Promise((resolve) => {
        execFile('termux-battery-status', [], { timeout: 3000 }, (erro, saida) => {
            if (erro) return resolve(null);
            try {
                const b = JSON.parse(saida);
                resolve(`${b.percentage}%${b.status === 'CHARGING' ? ' (carregando)' : ''}`);
            } catch {
                resolve(null);
            }
        });
    });
}

function espacoLivre() {
    try {
        const s = fs.statfsSync(config.RAIZ);
        return `${((s.bavail * s.bsize) / 1024 ** 3).toFixed(1)} GB livres`;
    } catch {
        return null;
    }
}

// Número da conversa privada em que o comando foi mandado (para "#confiar" sem número), ou null.
function numeroDaConversa(ctx) {
    if (ctx.conta.chave === 'eu') return null;
    const key = ctx.msg.key;
    const jid = key.remoteJid?.endsWith('@lid') ? key.remoteJidAlt : key.remoteJid;
    if (!jid?.endsWith('@s.whatsapp.net')) return null;
    return confiaveis.normalizarNumero(jid.split('@')[0].split(':')[0]);
}

module.exports = {
    titulo: 'ℹ️ *ajuda*',
    comandos: [
        {
            nome: 'confiar',
            soDono: true,
            uso: 'confiar [número]',
            descricao: 'libera uma pessoa para usar o bot (só você)',
            ajuda: 'só o dono do bot usa. com o número (DDD + número; sem DDI assume Brasil) ou, sem número, na conversa privada com a pessoa. '
                + 'quem é confiável usa os comandos na própria conversa, mas não mexe na lista nem no backup. para tirar: #desconfiar [número]; ver todos: #confiaveis.',
            exemplos: ['confiar 21 97777-6666', 'confiar (na conversa privada com a pessoa)'],
            async executar(ctx) {
                const p = ctx.prefixo;
                const numero = ctx.texto ? confiaveis.normalizarNumero(ctx.texto) : numeroDaConversa(ctx);
                if (!numero) {
                    return ctx.responder(ctx.texto
                        ? `❌ não entendi esse número. use DDD + número. ex: ${p}confiar 21 97777-6666`
                        : `❌ ex: ${p}confiar 21 97777-6666\n(ou mande ${p}confiar na conversa privada com a pessoa)`);
                }
                await ctx.responder(confiaveis.adicionar(numero)
                    ? `✅ ${numero} agora é confiável e pode usar o bot. para tirar: ${p}desconfiar ${numero}`
                    : `ℹ️ ${numero} já estava na lista de confiáveis.`);
            },
        },
        {
            nome: 'desconfiar',
            soDono: true,
            uso: 'desconfiar [número]',
            descricao: 'tira uma pessoa da lista de confiáveis (só você)',
            exemplos: ['desconfiar 5521977776666'],
            async executar(ctx) {
                const numero = confiaveis.normalizarNumero(ctx.texto);
                if (!numero) return ctx.responder(`❌ ex: ${ctx.prefixo}desconfiar 5521977776666 (veja a lista em ${ctx.prefixo}confiaveis)`);
                await ctx.responder(confiaveis.remover(numero)
                    ? `🗑️ ${numero} removido. essa pessoa não usa mais o bot.`
                    : `ℹ️ ${numero} não está na lista de confiáveis.`);
            },
        },
        {
            nome: 'confiaveis',
            soDono: true,
            descricao: 'quem pode usar o bot além de você (só você vê)',
            async executar(ctx) {
                const lista = confiaveis.listar();
                const doEnv = config.LIBERADO_PARA_TODOS ? ['todos (PERMITIDOS=todos no .env)'] : config.NUMEROS_PERMITIDOS;
                if (!lista.length && !doEnv.length) return ctx.responder(`📭 ninguém além de você. para liberar alguém: ${ctx.prefixo}confiar [número]`);
                let txt = '🤝 *confiáveis*\n';
                if (lista.length) txt += `\n*adicionados por comando*\n${lista.map((n) => `• ${n}`).join('\n')}\n`;
                if (doEnv.length) txt += `\n*liberados no .env (PERMITIDOS)*\n${doEnv.map((n) => `• ${n}`).join('\n')}\n`;
                await ctx.responder(`${txt}\npara tirar: ${ctx.prefixo}desconfiar [número]`);
            },
        },
        {
            nome: 'status',
            descricao: 'como o bot está: tempo ligado, IAs, memória, bateria',
            async executar(ctx) {
                const { version } = require('../../package.json');
                const ligadas = ia.situacao().provedores.filter((p) => p.ligado);
                const descansando = ligadas.filter((p) => p.parados.length).map((p) => p.titulo);
                const e = estado.atual;
                const linhas = [
                    `🤖 *assistente ${version}*`,
                    '',
                    `${e.online() ? '🟢 online' : '🔴 sem conexão'} · ligado há ${e.ligadoHa()} · quedas: ${e.quedas}`,
                    `🧠 IAs: ${ligadas.map((p) => p.titulo).join(', ') || 'nenhuma'}${descansando.length ? ` (descansando: ${descansando.join(', ')})` : ''}`,
                    `⏰ lembretes marcados: ${lembretes.exportar().length}`,
                    `💾 último backup no aparelho: ${ultimoBackupDiario() || 'ainda não fez'}`,
                    `📟 memória: ${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB`,
                ];
                const livre = espacoLivre();
                if (livre) linhas.push(`💽 espaço: ${livre}`);
                const carga = await bateria();
                if (carga) linhas.push(`🔋 bateria: ${carga}`);
                linhas.push('', `veja detalhes das IAs com ${ctx.prefixo}ias`);
                await ctx.responder(linhas.join('\n'));
            },
        },
        {
            nome: 'menu',
            apelidos: ['comandos', 'help'],
            descricao: 'esta lista',
            async executar(ctx) {
                // require aqui dentro porque o index.js também carrega este arquivo
                const { montarMenu } = require('./index');
                await ctx.responder(montarMenu(ctx.prefixo));
            },
        },
        {
            nome: 'ajuda',
            uso: 'ajuda [comando]',
            descricao: 'explica um comando com exemplos',
            exemplos: ['ajuda despesa', 'ajuda s'],
            async executar(ctx) {
                const { montarAjuda, montarMenu } = require('./index');
                if (!ctx.args[0]) return ctx.responder(montarMenu(ctx.prefixo));
                await ctx.responder(montarAjuda(ctx.args[0].replace(ctx.prefixo, ''), ctx.prefixo));
            },
        },
        {
            nome: 'privacidade',
            apelidos: ['termos', 'lgpd', 'dados'],
            descricao: 'o que o bot guarda, pra onde manda e como apagar',
            async executar(ctx) {
                const p = ctx.prefixo;
                const { provedores, filas } = ia.situacao();
                const ligadas = provedores.filter((x) => x.ligado).map((x) => x.titulo).join(', ') || 'nenhuma';
                const sensiveis = [...new Set([...filas.financas, ...filas.imagem, ...filas.pdf, ...filas.audio])].join(', ') || 'nenhuma';
                await ctx.responder([
                    '🔒 *privacidade e seus dados*',
                    '',
                    '*o que fica guardado* (só no aparelho do dono, na pasta dados/)',
                    '• finanças de cada conversa: lançamentos, cartões, fixos, metas e limites',
                    '• lembretes marcados, anotações e listas',
                    `• a lista de pessoas liberadas com ${p}confiar`,
                    '• backups e o registro do bot (bot.log)',
                    'fotos, vídeos e áudios *não* ficam guardados: são apagados logo depois de usados.',
                    '',
                    '*o que vai para fora*',
                    `• IAs ligadas: ${ligadas}. só recebem o que você manda num comando de IA.`,
                    `• finanças, comprovantes e áudios vão para: ${sensiveis}`,
                    `• modo privado: ${IA_MODO_PRIVADO ? '✅ ligado (dados sensíveis só na Groq)' : '⛔ desligado (ligue com IA_MODO_PRIVADO=sim no .env)'}`,
                    '• nos planos grátis do Gemini e da Mistral, o que você manda pode ser usado para melhorar as IAs deles.',
                    `• ${p}clima, ${p}cep e ${p}pokemon consultam os sites desses serviços.`,
                    '',
                    '*como apagar*',
                    `• finanças desta conversa: ${p}resetfin tudo confirmar`,
                    `• lembretes: ${p}lembretes e ${p}cancelar [nº]`,
                    `• anotações e listas: ${p}notas apagar [nº] e ${p}lista [nome] limpar`,
                    '• tudo: o dono apaga a pasta dados/ do bot',
                    '',
                    'termos completos: arquivo TERMOS-E-PRIVACIDADE.md do projeto.',
                ].join('\n'));
            },
        },
        {
            nome: 'ping',
            descricao: 'vê se o bot está on',
            async executar(ctx) {
                const segundos = Math.round(process.uptime());
                const ligado = segundos < 3600 ? `${Math.round(segundos / 60)} min` : `${(segundos / 3600).toFixed(1)} h`;
                await ctx.responder(`pong 🏓 (ligado há ${ligado})`);
            },
        },
    ],
};
