// Funções pequenas de formatação, números e datas.

const FUSO = 'America/Sao_Paulo';
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function reais(valor, casas = 2) {
    return Number(valor)
        .toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: casas, maximumFractionDigits: casas })
        .replace(/ /g, ' ');
}

function arredondar(valor) {
    return Math.round(Number(valor) * 100) / 100;
}

// Lê valores escritos do jeito brasileiro: "50", "50,90", "1.234,56", "R$ 20".
function lerValor(texto) {
    let t = String(texto || '').replace(/r\$|\s/gi, '');
    if (!/^\d[\d.,]*$/.test(t)) return NaN;
    if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
    const valor = Number(t);
    return Number.isFinite(valor) ? arredondar(valor) : NaN;
}

// Tira acentos e deixa minúsculo: "Crédito" -> "credito".
function normalizar(texto) {
    return String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

// ---------- datas (sempre no horário de Brasília, formato interno AAAA-MM-DD) ----------

function isoDoDia(data = new Date()) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(data);
}

function hojeISO() {
    return isoDoDia(new Date());
}

function mesAtual() {
    return hojeISO().slice(0, 7);
}

function dataValida(ano, mes, dia) {
    const d = new Date(Date.UTC(ano, mes - 1, dia));
    return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

function montarISO(ano, mes, dia) {
    return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

// Entende "hoje", "ontem", "15/10", "15/10/26" e "15/10/2026". Devolve AAAA-MM-DD ou null.
function lerData(texto, anoPadrao) {
    const t = normalizar(texto);
    if (t === 'hoje') return hojeISO();
    if (t === 'ontem' || t === 'anteontem') {
        const dias = t === 'ontem' ? 1 : 2;
        return isoDoDia(new Date(Date.now() - dias * 86400000));
    }
    const m = t.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2}|\d{4}))?$/);
    if (!m) return null;
    const dia = Number(m[1]);
    const mes = Number(m[2]);
    let ano = m[3] ? Number(m[3]) : (anoPadrao || Number(hojeISO().slice(0, 4)));
    if (ano < 100) ano += 2000;
    return dataValida(ano, mes, dia) ? montarISO(ano, mes, dia) : null;
}

// Entende "10/2026", "10/26", "outubro", "outubro/2026" e "mes". Devolve AAAA-MM ou null.
function lerMes(texto) {
    const t = normalizar(texto);
    if (t === 'mes' || t === 'atual') return mesAtual();
    let m = t.match(/^(\d{1,2})[/-](\d{2}|\d{4})$/);
    if (m) {
        const mes = Number(m[1]);
        let ano = Number(m[2]);
        if (ano < 100) ano += 2000;
        return mes >= 1 && mes <= 12 ? `${ano}-${String(mes).padStart(2, '0')}` : null;
    }
    m = t.match(/^([a-z]+)(?:[/-](\d{4}))?$/);
    if (m) {
        const indice = MESES.findIndex((nome) => normalizar(nome) === m[1] || normalizar(nome).slice(0, 3) === m[1]);
        if (indice === -1) return null;
        return `${m[2] || hojeISO().slice(0, 4)}-${String(indice + 1).padStart(2, '0')}`;
    }
    return null;
}

// "2026-10-15" -> "15/10" (ou "15/10/2026" se for de outro ano)
function dataCurta(iso) {
    if (!/^\d{4}-\d{2}-\d{2}/.test(iso || '')) return String(iso || '');
    const [ano, mes, dia] = iso.slice(0, 10).split('-');
    return ano === hojeISO().slice(0, 4) ? `${dia}/${mes}` : `${dia}/${mes}/${ano}`;
}

function nomeDoMes(anoMes) {
    const [ano, mes] = anoMes.split('-');
    return `${MESES[Number(mes) - 1]}/${ano}`;
}

function dataHora(ms) {
    return new Date(ms).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: FUSO });
}

// Barra de progresso em texto: barra(0.42) -> "████░░░░░░"
function barra(fracao, largura = 10) {
    const cheios = Math.max(0, Math.min(largura, Math.round(fracao * largura)));
    return '█'.repeat(cheios) + '░'.repeat(largura - cheios);
}

function porcento(fracao) {
    return `${Math.round(fracao * 100)}%`;
}

module.exports = {
    reais, arredondar, lerValor, normalizar,
    hojeISO, mesAtual, isoDoDia, lerData, lerMes, dataCurta, nomeDoMes, dataHora,
    barra, porcento,
};
