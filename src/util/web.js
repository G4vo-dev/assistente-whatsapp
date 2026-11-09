// Busca JSON nas APIs públicas e gratuitas (clima, CEP, Pokémon, cotações). Página não encontrada (404) vira null.
async function buscarJson(url, { tempoMs = 15000 } = {}) {
    const resposta = await fetch(url, { headers: { 'User-Agent': 'assistente-whatsapp (bot pessoal)' }, signal: AbortSignal.timeout(tempoMs) });
    if (resposta.status === 404) return null;
    if (!resposta.ok) throw new Error(`o site respondeu ${resposta.status}`);
    return resposta.json();
}

module.exports = { buscarJson };
