const fs = require('fs');
const path = require('path');
const midia = require('../servicos/midia');
const { acharMidia } = require('../util/mensagem');
const { SEGUNDOS_MODO_FIGURINHA } = require('../config');


// Modo figurinha: depois de um #s, fotos e vídeos mandados na mesma conversa viram figurinha.
const modoFigurinha = new Map();
const figurinhaAtiva = (jid) => (modoFigurinha.get(jid) || 0) > Date.now();
const ativarFigurinha = (jid) => modoFigurinha.set(jid, Date.now() + SEGUNDOS_MODO_FIGURINHA * 1000);

function links(args) {
    return args.filter((a) => /^https?:\/\/\S+$/i.test(a));
}

// Pega a foto/vídeo da própria mensagem ou da mensagem respondida.
function midiaDaMensagem(ctx) {
    return acharMidia(ctx.msg, ctx.conteudo, ['imageMessage', 'videoMessage'])?.mensagem || null;
}

// Mensagem de erro curta e útil.
function motivo(erro) {
    if (erro instanceof midia.ErroMidia) return erro.message;
    const linha = String(erro.stderr || erro.message || '').split('\n').find((l) => l.includes('ERROR'));
    return linha ? linha.replace(/^.*ERROR:\s*/, '').slice(0, 160) : 'não consegui processar.';
}

async function fazerFigurinha(ctx, fonte, texto) {
    const pasta = midia.criarPasta();
    try {
        let arquivo;
        if (fonte.url) {
            arquivo = await midia.baixarDoLink(fonte.url, pasta);
        } else {
            arquivo = path.join(pasta, 'midia.bin');
            fs.writeFileSync(arquivo, await midia.baixarDaMensagem(ctx.bot, fonte.mensagem));
        }
        await ctx.responder({ sticker: await midia.paraFigurinha(arquivo, pasta, { texto }) });
        return true;
    } catch (erro) {
        console.error('❌ figurinha:', erro.message);
        await ctx.responder(`❌ ${fonte.url ? `${fonte.url}\n` : ''}${motivo(erro)}`);
        return false;
    } finally {
        midia.apagarPasta(pasta);
    }
}

module.exports = {
    titulo: '📥 *mídia & links*',
    comandos: [
        {
            nome: 's',
            apelidos: ['sticker', 'figurinha', 'fig', 'f'],
            uso: 's [texto] [links]',
            descricao: 'figurinha de foto, vídeo, gif ou link',
            ajuda: `mande a foto/vídeo com a legenda #s, responda uma mídia com #s, ou mande #s com até 10 links. `
                + `depois de um #s, as fotos e vídeos que você mandar na conversa em até ${SEGUNDOS_MODO_FIGURINHA}s também viram figurinha.`,
            exemplos: ['s (na legenda da foto)', 's quando o bot funciona (texto embaixo da figurinha)', 's https://x.com/usuario/status/123'],
            async executar(ctx) {
                const fontes = [];
                const mensagem = midiaDaMensagem(ctx);
                if (mensagem) fontes.push({ mensagem });
                for (const url of links(ctx.args).slice(0, 10)) fontes.push({ url });
                let texto = ctx.args.filter((a) => !/^https?:\/\//i.test(a)).join(' ');
                if (texto && !(await midia.suportaTexto())) {
                    await ctx.responder('⚠️ o ffmpeg deste aparelho não escreve texto; vou fazer a figurinha sem texto.');
                    texto = '';
                }
                if (!fontes.length) {
                    return ctx.responder(`❌ mande uma foto/vídeo com a legenda ${ctx.prefixo}s, responda uma mídia com ${ctx.prefixo}s ou mande ${ctx.prefixo}s [link]`);
                }
                ativarFigurinha(ctx.jid);
                if (!ctx.automatico) await ctx.reagir('⏳');
                let deuCerto = 0;
                for (const fonte of fontes) {
                    if (await fazerFigurinha(ctx, fonte, texto)) deuCerto++;
                    ativarFigurinha(ctx.jid);
                }
                if (!ctx.automatico) await ctx.reagir(deuCerto ? '✅' : '❌');
            },
        },
        {
            nome: 'img',
            apelidos: ['toimg', 'foto'],
            uso: 'img',
            descricao: 'responda uma figurinha para virar foto',
            async executar(ctx) {
                const alvo = acharMidia(ctx.msg, ctx.conteudo, ['stickerMessage']);
                if (!alvo) return ctx.responder(`❌ responda uma figurinha com ${ctx.prefixo}img`);
                if (alvo.info?.isAnimated) return ctx.responder('❌ figurinha animada ainda não vira foto, só as paradas.');
                const pasta = midia.criarPasta();
                try {
                    const foto = await midia.figurinhaParaFoto(await midia.baixarDaMensagem(ctx.bot, alvo.mensagem), pasta);
                    await ctx.responder({ image: foto, mimetype: 'image/png' }, { citar: true });
                } catch (erro) {
                    await ctx.responder(`❌ ${motivo(erro)}`);
                } finally {
                    midia.apagarPasta(pasta);
                }
            },
        },
    ],
    figurinhaAtiva,
};
