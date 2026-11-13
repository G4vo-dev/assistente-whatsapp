// Guarda o estado da conexão (desde quando está ligado, quedas) para o #status e para os avisos de queda e volta.

// 95 -> "1 min", 7320 -> "2 h 2 min", 176400 -> "2 d 1 h"
function duracao(segundos) {
    const s = Math.max(0, Math.floor(segundos));
    if (s < 60) return `${s} s`;
    if (s < 3600) return `${Math.floor(s / 60)} min`;
    if (s < 86400) {
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        return m ? `${h} h ${m} min` : `${h} h`;
    }
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    return h ? `${d} d ${h} h` : `${d} d`;
}

function novo(agora = Date.now()) {
    const e = {
        iniciadoEm: agora,
        conectadoDesde: null,
        caiuEm: null,
        ultimoCodigo: null,
        quedas: 0,
        jaConectou: false,
        // chame quando a conexão abrir; devolve o que aconteceu
        conectou(quando = Date.now()) {
            const info = {
                primeira: !e.jaConectou,
                foraSegundos: e.caiuEm ? (quando - e.caiuEm) / 1000 : 0,
                codigo: e.ultimoCodigo,
            };
            e.jaConectou = true;
            e.conectadoDesde = quando;
            e.caiuEm = null;
            return info;
        },
        caiu(codigo, quando = Date.now()) {
            if (!e.caiuEm) e.caiuEm = quando;
            e.conectadoDesde = null;
            e.ultimoCodigo = codigo ?? null;
            e.quedas += 1;
        },
        ligadoHa(quando = Date.now()) {
            return duracao((quando - e.iniciadoEm) / 1000);
        },
        online() {
            return e.conectadoDesde !== null;
        },
    };
    return e;
}

// Texto do aviso; null quando foi só uma piscada de poucos segundos (para não encher a conversa).
function mensagemDeConexao(info) {
    if (info.primeira) return '🟢 assistente ligado e conectado.';
    if (info.foraSegundos < 20) return null;
    return `🔄 voltei! fiquei fora por ${duracao(info.foraSegundos)} (código ${info.codigo ?? '?'}).`;
}

module.exports = { novo, duracao, mensagemDeConexao, atual: novo() };
