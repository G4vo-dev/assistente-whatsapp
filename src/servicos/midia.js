// Figurinhas e imagens: usa ffmpeg/ffprobe.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const pino = require('pino');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');

const executar = promisify(execFile);
const LIMITE_LINK = 50 * 1024 * 1024; // 50 MB para arquivos baixados por link direto
const LIMITE_FIGURINHA_ANIMADA = 1024 * 1024; // o WhatsApp recusa figurinha animada muito pesada
const SEGUNDOS_FIGURINHA_ANIMADA = 8;
const LIMITE_TEMPO_MS = 3 * 60 * 1000; // no celular o ffmpeg é lento; mais que isso, desiste
const CODECS_DE_IMAGEM = ['mjpeg', 'png', 'bmp', 'tiff', 'webp', 'jpeg2000', 'jpegls'];
const AJUSTE_512 = 'scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black@0';
const FONTE = path.join(__dirname, '..', '..', 'assets', 'DejaVuSans-Bold.ttf');

class ErroMidia extends Error {}

// ---------- pasta temporária ----------

function criarPasta() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'assistente-'));
}

function apagarPasta(pasta) {
    if (pasta) fs.rmSync(pasta, { recursive: true, force: true });
}

// ---------- ferramentas externas ----------

async function rodar(programa, argumentos) {
    try {
        return await executar(programa, argumentos, { maxBuffer: 10 * 1024 * 1024, timeout: LIMITE_TEMPO_MS });
    } catch (erro) {
        if (erro.killed) throw new ErroMidia(`demorou demais para processar (mais de ${LIMITE_TEMPO_MS / 1000}s).`);
        if (erro.code === 'ENOENT') {
            throw new ErroMidia(`o ${programa} não está instalado. no Termux: pkg install ffmpeg`);
        }
        throw erro;
    }
}

// ---------- baixar ----------

// Baixa a foto/vídeo de uma mensagem do WhatsApp (tenta 3 vezes se o servidor demorar).
async function baixarDaMensagem(bot, mensagem) {
    for (let tentativa = 1; ; tentativa++) {
        try {
            return await downloadMediaMessage(mensagem, 'buffer', {}, {
                logger: pino({ level: 'silent' }),
                reuploadRequest: bot.updateMediaMessage,
            });
        } catch (erro) {
            if (tentativa >= 3) throw erro;
            await new Promise((r) => setTimeout(r, 2000));
        }
    }
}

async function baixarArquivo(url, destino) {
    const resposta = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (assistente-whatsapp)' },
        signal: AbortSignal.timeout(60000),
    });
    if (!resposta.ok) return false;
    const tipo = resposta.headers.get('content-type') || '';
    if (!tipo.startsWith('image/') && !tipo.startsWith('video/')) return false;
    if (Number(resposta.headers.get('content-length')) > LIMITE_LINK) throw new ErroMidia('arquivo grande demais (máx. 50 MB)');
    const dados = Buffer.from(await resposta.arrayBuffer());
    if (dados.length > LIMITE_LINK) throw new ErroMidia('arquivo grande demais (máx. 50 MB)');
    fs.writeFileSync(destino, dados);
    return true;
}

// Posts do X/Twitter só com imagem: o yt-dlp não pega, então usa a API pública do vxtwitter.
async function baixarDoX(url, destino) {
    const endereco = new URL(url);
    if (!/(^|\.)(x|twitter)\.com$/.test(endereco.hostname) || !endereco.pathname.includes('/status/')) return false;
    const resposta = await fetch(`https://api.vxtwitter.com${endereco.pathname}`, { signal: AbortSignal.timeout(20000) });
    if (!resposta.ok) return false;
    const post = await resposta.json();
    const midia = post.media_extended?.[0]?.url || post.mediaURLs?.[0];
    return midia ? baixarArquivo(midia, destino) : false;
}

// Link -> arquivo local (post do X/Twitter ou link direto de imagem/vídeo).
async function baixarDoLink(url, pasta) {
    const destino = path.join(pasta, 'link.bin');
    const tentativas = [() => baixarDoX(url, destino), () => baixarArquivo(url, destino)];
    for (const tentar of tentativas) {
        try {
            if (await tentar()) return destino;
        } catch (erro) {
            if (erro instanceof ErroMidia) throw erro;
        }
    }
    throw new ErroMidia('não achei foto ou vídeo nesse link. use um link direto de imagem/vídeo ou um post do X.');
}

// ---------- figurinha ----------

async function ehAnimado(arquivo) {
    try {
        const { stdout } = await rodar('ffprobe', [
            '-v', 'error', '-select_streams', 'v:0',
            '-show_entries', 'stream=codec_name,nb_frames:format=duration', '-of', 'json', arquivo,
        ]);
        const info = JSON.parse(stdout);
        const codec = info.streams?.[0]?.codec_name || '';
        const quadros = Number(info.streams?.[0]?.nb_frames) || 0;
        const duracao = Number(info.format?.duration) || 0;
        if (codec === 'gif') return quadros > 1 || duracao > 0.2;
        return codec !== '' && !CODECS_DE_IMAGEM.includes(codec);
    } catch (erro) {
        if (erro instanceof ErroMidia) throw erro;
        return false;
    }
}

// ---------- texto na figurinha ----------

let suporteATexto = null;

// O ffmpeg precisa ter o filtro "drawtext" (vem no ffmpeg do Termux).
async function suportaTexto() {
    if (suporteATexto === null) {
        try {
            const { stdout } = await rodar('ffmpeg', ['-hide_banner', '-filters']);
            suporteATexto = / drawtext /.test(stdout) && fs.existsSync(FONTE);
        } catch {
            suporteATexto = false;
        }
    }
    return suporteATexto;
}

function quebrarEmLinhas(texto, largura) {
    const linhas = [];
    let atual = '';
    for (const palavra of texto.trim().split(/\s+/)) {
        for (let pedaco = palavra; pedaco; pedaco = pedaco.slice(largura)) {
            const parte = pedaco.slice(0, largura);
            if (!atual) atual = parte;
            else if (`${atual} ${parte}`.length <= largura) atual += ` ${parte}`;
            else { linhas.push(atual); atual = parte; }
        }
    }
    if (atual) linhas.push(atual);
    return linhas;
}

// Quebra o texto em até 3 linhas: linhas mais longas (letra menor) antes de cortar alguma palavra.
function quebrarTexto(texto) {
    for (const largura of [14, 16, 18, 20, 24, 28]) {
        const linhas = quebrarEmLinhas(texto, largura);
        if (linhas.length <= 3) return linhas;
    }
    const linhas = quebrarEmLinhas(texto, 28).slice(0, 3);
    linhas[2] = `${linhas[2].slice(0, 27)}…`;
    return linhas;
}

function escaparCaminho(caminho) {
    return caminho.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

// Filtro que escreve o texto embaixo, centralizado, branco com borda preta (estilo meme).
function filtroDeTexto(texto, pasta) {
    const linhas = quebrarTexto(texto);
    const maior = Math.max(...linhas.map((l) => l.length));
    const tamanho = Math.max(28, Math.min(72, Math.floor(470 / (maior * 0.62))));
    const alturaLinha = Math.round(tamanho * 1.15);
    return linhas.map((linha, i) => {
        const arquivo = path.join(pasta, `texto${i}.txt`);
        fs.writeFileSync(arquivo, linha);
        const acima = (linhas.length - i) * alturaLinha + 16;
        return `,drawtext=fontfile='${escaparCaminho(FONTE)}':textfile='${escaparCaminho(arquivo)}':fontcolor=white:fontsize=${tamanho}`
            + `:borderw=4:bordercolor=black:x=(w-text_w)/2:y=h-${acima}`;
    }).join('');
}

// Converte foto/vídeo/GIF em figurinha 512x512 (sem esticar, fundo transparente), com texto opcional.
async function paraFigurinha(entrada, pasta, { texto = '' } = {}) {
    const saida = path.join(pasta, 'figurinha.webp');
    const comTexto = texto ? filtroDeTexto(texto, pasta) : '';
    if (!(await ehAnimado(entrada))) {
        await rodar('ffmpeg', ['-y', '-loglevel', 'error', '-i', entrada, '-vf', AJUSTE_512 + comTexto,
            '-frames:v', '1', '-c:v', 'libwebp', '-quality', '80', saida]);
        return fs.readFileSync(saida);
    }
    // animada: vai baixando a qualidade até caber no limite do WhatsApp
    for (const [qualidade, fps] of [[60, 15], [40, 12], [25, 10]]) {
        await rodar('ffmpeg', ['-y', '-loglevel', 'error', '-t', String(SEGUNDOS_FIGURINHA_ANIMADA), '-i', entrada,
            '-vf', `fps=${fps},${AJUSTE_512}${comTexto}`, '-c:v', 'libwebp', '-loop', '0', '-an',
            '-quality', String(qualidade), '-compression_level', '4', saida]);
        if (fs.statSync(saida).size <= LIMITE_FIGURINHA_ANIMADA) break;
    }
    return fs.readFileSync(saida);
}

// Figurinha (webp parada) -> foto PNG.
async function figurinhaParaFoto(dados, pasta) {
    const entrada = path.join(pasta, 'figurinha.webp');
    const saida = path.join(pasta, 'foto.png');
    fs.writeFileSync(entrada, dados);
    await rodar('ffmpeg', ['-y', '-loglevel', 'error', '-i', entrada, '-frames:v', '1', saida]);
    return fs.readFileSync(saida);
}

// ---------- imagem para a IA ----------

// A IA aceita imagens de até ~4 MB: fotos maiores são reduzidas para 1600 px em JPEG.
async function prepararImagem(dados, tipo = 'image/jpeg') {
    if (dados.length <= 3 * 1024 * 1024) return { dados, tipo };
    const pasta = criarPasta();
    try {
        const entrada = path.join(pasta, 'grande.img');
        const saida = path.join(pasta, 'menor.jpg');
        fs.writeFileSync(entrada, dados);
        await rodar('ffmpeg', ['-y', '-loglevel', 'error', '-i', entrada, '-vf', "scale='min(1600,iw)':-2", '-q:v', '4', '-frames:v', '1', saida]);
        return { dados: fs.readFileSync(saida), tipo: 'image/jpeg' };
    } catch {
        return { dados, tipo };
    } finally {
        apagarPasta(pasta);
    }
}

module.exports = {
    ErroMidia, criarPasta, apagarPasta,
    baixarDaMensagem, baixarDoLink, paraFigurinha, prepararImagem,
    suportaTexto, quebrarTexto, figurinhaParaFoto,
};
