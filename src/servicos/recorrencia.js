// Lembretes que se repetem: "todo dia 8h", "toda segunda 8h30", "todo mês dia 5 9h".
// Os horários são de Brasília (UTC-3, sem horário de verão).
const { normalizar } = require('../util/formato');

const DESLOCAMENTO = -3 * 3600000;
const DIAS_DA_SEMANA = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 };

// "8h", "8h30", "8:30", "08:05"
function lerHora(texto) {
    const m = String(texto || '').toLowerCase().match(/^(\d{1,2})(?:h|:)(\d{2})?$/);
    if (!m) return null;
    const hora = Number(m[1]);
    const minuto = Number(m[2] || 0);
    if (hora > 23 || minuto > 59) return null;
    return { hora, minuto };
}

// args = palavras depois de "lembrar". Devolve { regra, texto } ou null se não for um lembrete que repete.
function lerRegra(args) {
    const palavras = args.map((a) => normalizar(a));
    const inicio = palavras[0];
    if (inicio !== 'todo' && inicio !== 'toda') return null;
    const montar = (regra, horaTexto, restante) => {
        const h = lerHora(horaTexto);
        const texto = restante.join(' ').trim();
        if (!h || !texto) return null;
        return { regra: { ...regra, hora: h.hora, minuto: h.minuto }, texto };
    };
    if (palavras[1] === 'dia') return montar({ tipo: 'diario' }, args[2], args.slice(3));
    if (palavras[1] === 'mes' && palavras[2] === 'dia') {
        const diaMes = Number(palavras[3]);
        if (!Number.isInteger(diaMes) || diaMes < 1 || diaMes > 31) return null;
        return montar({ tipo: 'mensal', diaMes }, args[4], args.slice(5));
    }
    const diaSemana = DIAS_DA_SEMANA[(palavras[1] || '').replace(/-?feira$/, '')];
    if (diaSemana === undefined) return null;
    return montar({ tipo: 'semanal', diaSemana }, args[2], args.slice(3));
}

function diasNoMes(ano, mes) {
    return new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
}

// Primeiro horário depois de "desde" (em ms) que cumpre a regra. Devolve ms.
function proxima(regra, desde = Date.now()) {
    const t = desde + DESLOCAMENTO; // relógio de Brasília, lido como se fosse UTC
    const agora = new Date(t);
    const ano = agora.getUTCFullYear();
    const mes = agora.getUTCMonth();
    const dia = agora.getUTCDate();
    const em = (a, m, d) => Date.UTC(a, m, d, regra.hora, regra.minuto);
    let candidato;
    if (regra.tipo === 'diario') {
        candidato = em(ano, mes, dia);
        if (candidato <= t) candidato += 86400000;
    } else if (regra.tipo === 'semanal') {
        candidato = em(ano, mes, dia);
        while (candidato <= t || new Date(candidato).getUTCDay() !== regra.diaSemana) candidato += 86400000;
    } else {
        for (let i = 0; i < 3; i++) {
            const alvo = new Date(Date.UTC(ano, mes + i, 1));
            const d = Math.min(regra.diaMes, diasNoMes(alvo.getUTCFullYear(), alvo.getUTCMonth()));
            candidato = em(alvo.getUTCFullYear(), alvo.getUTCMonth(), d);
            if (candidato > t) break;
        }
    }
    return candidato - DESLOCAMENTO;
}

const NOMES_DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

function descrever(regra) {
    const hora = `${regra.hora}h${regra.minuto ? String(regra.minuto).padStart(2, '0') : ''}`;
    if (regra.tipo === 'diario') return `todo dia às ${hora}`;
    if (regra.tipo === 'semanal') return `toda ${NOMES_DIAS[regra.diaSemana]} às ${hora}`;
    return `todo mês, dia ${regra.diaMes}, às ${hora}`;
}

module.exports = { lerRegra, proxima, descrever };
