// Comandos rápidos com APIs gratuitas (sem chave): clima, CEP, Pokémon; e tradução pela IA.
const ia = require('../servicos/ia');
const { citadaDo, textoDo } = require('../util/mensagem');
const { normalizar } = require('../util/formato');
const { buscarJson } = require('../util/web');
const { CIDADE_PADRAO } = require('../config');

// ---------- clima (Open-Meteo) ----------

const TEMPO = {
    0: ['☀️', 'céu limpo'], 1: ['🌤️', 'quase limpo'], 2: ['⛅', 'parcialmente nublado'], 3: ['☁️', 'nublado'],
    45: ['🌫️', 'neblina'], 48: ['🌫️', 'neblina'], 51: ['🌦️', 'garoa fraca'], 53: ['🌦️', 'garoa'], 55: ['🌦️', 'garoa forte'],
    61: ['🌧️', 'chuva fraca'], 63: ['🌧️', 'chuva'], 65: ['🌧️', 'chuva forte'], 66: ['🌧️', 'chuva congelante'], 67: ['🌧️', 'chuva congelante'],
    71: ['🌨️', 'neve fraca'], 73: ['🌨️', 'neve'], 75: ['🌨️', 'neve forte'], 77: ['🌨️', 'neve'],
    80: ['🌦️', 'pancadas de chuva'], 81: ['🌧️', 'pancadas de chuva'], 82: ['⛈️', 'temporal'],
    85: ['🌨️', 'pancadas de neve'], 86: ['🌨️', 'pancadas de neve'], 95: ['⛈️', 'trovoadas'], 96: ['⛈️', 'trovoadas com granizo'], 99: ['⛈️', 'trovoadas com granizo'],
};
const DIA_DA_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

function tempo(codigo) {
    return TEMPO[codigo] || ['🌡️', 'tempo indefinido'];
}

async function clima(cidade) {
    const busca = await buscarJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cidade)}&count=1&language=pt&format=json`);
    const lugar = busca?.results?.[0];
    if (!lugar) return `❌ não achei a cidade "${cidade}".`;
    const previsao = await buscarJson('https://api.open-meteo.com/v1/forecast'
        + `?latitude=${lugar.latitude}&longitude=${lugar.longitude}`
        + '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m'
        + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max'
        + '&timezone=America%2FSao_Paulo&forecast_days=4');
    const agora = previsao.current;
    const [emoji, descricao] = tempo(agora.weather_code);
    const nome = [lugar.name, lugar.admin1, lugar.country_code !== 'BR' ? lugar.country : null].filter(Boolean).join(', ');
    let txt = `${emoji} *${nome}*\nagora: *${Math.round(agora.temperature_2m)}°C* (sensação ${Math.round(agora.apparent_temperature)}°C) · ${descricao}`
        + `\n💧 umidade ${agora.relative_humidity_2m}% · 💨 vento ${Math.round(agora.wind_speed_10m)} km/h\n\n*próximos dias*`;
    previsao.daily.time.forEach((dia, i) => {
        const [emojiDia] = tempo(previsao.daily.weather_code[i]);
        const rotulo = i === 0 ? 'hoje' : i === 1 ? 'amanhã' : DIA_DA_SEMANA[new Date(`${dia}T12:00:00Z`).getUTCDay()];
        const chuva = previsao.daily.precipitation_probability_max?.[i];
        txt += `\n${emojiDia} ${rotulo}: ${Math.round(previsao.daily.temperature_2m_min[i])}° a ${Math.round(previsao.daily.temperature_2m_max[i])}°${chuva != null ? ` · chuva ${chuva}%` : ''}`;
    });
    return `${txt}\n\n_dados: Open-Meteo.com (CC BY 4.0)_`;
}

// ---------- CEP (ViaCEP) ----------

async function cep(texto) {
    const numero = String(texto).replace(/\D/g, '');
    if (numero.length !== 8) return '❌ o CEP tem 8 números. ex: #cep 01001-000';
    const dados = await buscarJson(`https://viacep.com.br/ws/${numero}/json/`);
    if (!dados || dados.erro) return `❌ CEP ${numero.slice(0, 5)}-${numero.slice(5)} não encontrado.`;
    return [
        `📮 *${dados.cep}*`,
        dados.logradouro && `${dados.logradouro}${dados.complemento ? ` (${dados.complemento})` : ''}`,
        dados.bairro && `bairro: ${dados.bairro}`,
        `${dados.localidade} - ${dados.uf}`,
        dados.ddd && `DDD: ${dados.ddd}`,
    ].filter(Boolean).join('\n');
}

// ---------- Pokémon (PokéAPI) ----------

const TIPOS = {
    normal: 'normal', fire: 'fogo', water: 'água', grass: 'planta', electric: 'elétrico', ice: 'gelo', fighting: 'lutador',
    poison: 'venenoso', ground: 'terra', flying: 'voador', psychic: 'psíquico', bug: 'inseto', rock: 'pedra', ghost: 'fantasma',
    dragon: 'dragão', dark: 'sombrio', steel: 'aço', fairy: 'fada', stellar: 'estelar',
};
const STATUS = { hp: 'HP', attack: 'ataque', defense: 'defesa', 'special-attack': 'atq. esp.', 'special-defense': 'def. esp.', speed: 'velocidade' };

async function pokemon(nome) {
    const alvo = normalizar(nome).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const p = alvo && await buscarJson(`https://pokeapi.co/api/v2/pokemon/${alvo}`);
    if (!p) return { texto: `❌ não achei o pokémon "${nome}". use o nome em inglês ou o número da pokédex.` };
    const tipos = p.types.map((t) => TIPOS[t.type.name] || t.type.name).join(' / ');
    const habilidades = p.abilities.map((a) => a.ability.name.replace(/-/g, ' ') + (a.is_hidden ? ' (oculta)' : '')).join(', ');
    const status = p.stats.map((s) => `${(STATUS[s.stat.name] || s.stat.name).padEnd(10)} ${String(s.base_stat).padStart(3)}`).join('\n');
    const total = p.stats.reduce((soma, s) => soma + s.base_stat, 0);
    const texto = `*#${String(p.id).padStart(4, '0')} ${p.name.replace(/-/g, ' ')}*\n`
        + `tipo: ${tipos}\naltura: ${(p.height / 10).toLocaleString('pt-BR')} m · peso: ${(p.weight / 10).toLocaleString('pt-BR')} kg\n`
        + `habilidades: ${habilidades}\n\n\`\`\`\n${status}\n${'total'.padEnd(10)} ${String(total).padStart(3)}\n\`\`\``
        + '\n_dados: PokéAPI · Pokémon © Nintendo/Game Freak/The Pokémon Company_';
    const imagem = p.sprites?.other?.['official-artwork']?.front_default || p.sprites?.front_default || null;
    return { texto, imagem };
}

// ---------- tradução ----------

const IDIOMAS = {
    en: 'inglês', ingles: 'inglês', english: 'inglês', es: 'espanhol', espanhol: 'espanhol', pt: 'português', portugues: 'português',
    fr: 'francês', frances: 'francês', it: 'italiano', italiano: 'italiano', de: 'alemão', alemao: 'alemão',
    ja: 'japonês', japones: 'japonês', ko: 'coreano', coreano: 'coreano', zh: 'chinês', chines: 'chinês', ru: 'russo', russo: 'russo',
};

module.exports = {
    titulo: '🌎 *rápidos*',
    comandos: [
        {
            nome: 'clima',
            apelidos: ['tempo', 'previsao'],
            uso: 'clima [cidade]',
            descricao: 'temperatura agora e próximos dias',
            exemplos: ['clima são paulo', 'clima recife'],
            async executar(ctx) {
                const cidade = ctx.texto || CIDADE_PADRAO;
                if (!cidade) return ctx.responder(`❌ diga a cidade. ex: ${ctx.prefixo}clima são paulo\n(dá pra fixar uma com CIDADE_PADRAO no .env)`);
                await ctx.responder(await clima(cidade));
            },
        },
        {
            nome: 'cep',
            uso: 'cep [número]',
            descricao: 'endereço de um CEP',
            exemplos: ['cep 01001-000'],
            async executar(ctx) {
                if (!ctx.texto) return ctx.responder(`❌ ex: ${ctx.prefixo}cep 01001-000`);
                await ctx.responder(await cep(ctx.texto));
            },
        },
        {
            nome: 'traduzir',
            apelidos: ['traducao', 'tr'],
            uso: 'traduzir [idioma] [texto]',
            descricao: 'traduz (ou responda uma mensagem)',
            ajuda: 'sem idioma: português vira inglês e qualquer outro idioma vira português. idiomas: en, es, fr, it, de, ja, ko, zh, ru, pt.',
            exemplos: ['traduzir bom dia, tudo bem?', 'traduzir es onde fica a praia?', 'traduzir (respondendo uma mensagem)'],
            async executar(ctx) {
                const idioma = IDIOMAS[normalizar(ctx.args[0])] || null;
                let texto = idioma ? ctx.texto.slice(ctx.args[0].length).trim() : ctx.texto;
                if (!texto) texto = textoDo(citadaDo(ctx.conteudo)?.conteudo).trim();
                if (!texto) return ctx.responder(`❌ ex: ${ctx.prefixo}traduzir en bom dia\n(ou responda uma mensagem com ${ctx.prefixo}traduzir)`);
                const destino = idioma
                    ? `para ${idioma}`
                    : 'para inglês se o texto estiver em português; se estiver em qualquer outro idioma, para português';
                await ctx.reagir('⏳');
                const resposta = await ia.perguntarIA(`Traduza ${destino}. Responda SOMENTE com a tradução, sem explicar.\n\n${texto}`, {
                    sistema: 'você é um tradutor profissional. mantenha o tom, gírias e emojis do original.',
                    temperatura: 0.2,
                });
                await ctx.responder(`🌎 ${resposta}`, { citar: true });
                await ctx.reagir('✅');
            },
        },
        {
            nome: 'pokemon',
            apelidos: ['poke', 'pokedex'],
            uso: 'pokemon [nome ou número]',
            descricao: 'ficha de um pokémon com imagem',
            exemplos: ['pokemon charizard', 'pokemon 25'],
            async executar(ctx) {
                if (!ctx.texto) return ctx.responder(`❌ ex: ${ctx.prefixo}pokemon pikachu`);
                const { texto, imagem } = await pokemon(ctx.texto);
                if (!imagem) return ctx.responder(texto);
                try {
                    await ctx.responder({ image: { url: imagem }, caption: texto });
                } catch {
                    await ctx.responder(texto);
                }
            },
        },
    ],
    clima,
    cep,
    pokemon,
};
