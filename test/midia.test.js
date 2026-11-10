// Testa a conversão de figurinhas com o ffmpeg de verdade (pula se o ffmpeg não estiver instalado).
require('./ajudante');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const test = require('node:test');
const assert = require('node:assert');
const midia = require('../src/servicos/midia');

let temFfmpeg = true;
try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
} catch {
    temFfmpeg = false;
}

function info(arquivo) {
    const json = execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height,nb_read_frames', '-of', 'json', arquivo]).toString();
    return JSON.parse(json).streams[0];
}

// Largura e altura da tela de uma figurinha animada (cabeçalho VP8X do webp).
function telaDaFigurinha(dados) {
    return { largura: dados.readUIntLE(24, 3) + 1, altura: dados.readUIntLE(27, 3) + 1 };
}

function gerar(pasta, nome, argumentos) {
    const arquivo = path.join(pasta, nome);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...argumentos, arquivo]);
    return arquivo;
}

test('foto vira figurinha 512x512 sem esticar', { skip: !temFfmpeg && 'sem ffmpeg', timeout: 120000 }, async () => {
    const pasta = midia.criarPasta();
    try {
        const foto = gerar(pasta, 'foto.jpg', ['-f', 'lavfi', '-i', 'testsrc=size=800x400:duration=1', '-frames:v', '1']);
        const webp = path.join(pasta, 'saida.webp');
        fs.writeFileSync(webp, await midia.paraFigurinha(foto, pasta));
        const i = info(webp);
        assert.strictEqual(i.width, 512);
        assert.strictEqual(i.height, 512);
    } finally {
        midia.apagarPasta(pasta);
    }
});

test('figurinha com texto embaixo', { skip: !temFfmpeg && 'sem ffmpeg', timeout: 120000 }, async () => {
    const pasta = midia.criarPasta();
    try {
        const foto = gerar(pasta, 'foto.jpg', ['-f', 'lavfi', '-i', 'color=c=blue:size=600x600', '-frames:v', '1']);
        const semTexto = await midia.paraFigurinha(foto, pasta);
        const comTexto = await midia.paraFigurinha(foto, pasta, { texto: 'quando o bot funciona de primeira' });
        assert.ok(await midia.suportaTexto(), 'o ffmpeg deveria ter o filtro drawtext');
        assert.notDeepStrictEqual(comTexto, semTexto);
        const png = await midia.figurinhaParaFoto(comTexto, pasta);
        assert.ok(png.subarray(1, 4).toString() === 'PNG');
    } finally {
        midia.apagarPasta(pasta);
    }
});

test('vídeo e gif viram figurinha animada abaixo de 1 MB', { skip: !temFfmpeg && 'sem ffmpeg', timeout: 300000 }, async () => {
    const pasta = midia.criarPasta();
    try {
        const video = gerar(pasta, 'video.mp4', ['-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=15:duration=3', '-pix_fmt', 'yuv420p']);
        const gif = gerar(pasta, 'anim.gif', ['-f', 'lavfi', '-i', 'testsrc=size=160x120:rate=10:duration=1']);
        for (const entrada of [video, gif]) {
            const dados = await midia.paraFigurinha(entrada, pasta);
            assert.ok(dados.length <= 1024 * 1024, `ficou com ${dados.length} bytes`);
            const webp = path.join(pasta, 'saida.webp');
            fs.writeFileSync(webp, dados);
            assert.ok(dados.includes(Buffer.from('ANIM')), 'deveria ser animada');
        }
    } finally {
        midia.apagarPasta(pasta);
    }
});

test('vídeo muito agitado é reduzido até caber no limite de 1 MB', { skip: !temFfmpeg && 'sem ffmpeg', timeout: 300000 }, async () => {
    const pasta = midia.criarPasta();
    try {
        // ruído aleatório é o pior caso para comprimir
        const video = gerar(pasta, 'ruido.mp4', ['-f', 'lavfi', '-i', 'nullsrc=s=512x512:d=2:r=30,geq=random(1)*255:128:128', '-pix_fmt', 'yuv420p']);
        const dados = await midia.paraFigurinha(video, pasta);
        assert.ok(dados.length <= 1024 * 1024, `ficou com ${(dados.length / 1048576).toFixed(2)} MB`);
        assert.ok(dados.includes(Buffer.from('ANIM')), 'deveria continuar animada');
        assert.deepStrictEqual(telaDaFigurinha(dados), { largura: 512, altura: 512 });
    } finally {
        midia.apagarPasta(pasta);
    }
});
