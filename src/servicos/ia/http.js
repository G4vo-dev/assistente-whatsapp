// Pedidos HTTP em JSON para as IAs, com erro que guarda o código (429 = limite, 401 = chave errada...).

class ErroDeIA extends Error {
    constructor(mensagem, status, esperarSegundos) {
        super(mensagem);
        this.status = status;
        this.esperarSegundos = esperarSegundos;
    }
}

async function postarJson(url, cabecalhos, corpo, { tempoMs = 90000 } = {}) {
    const resposta = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...cabecalhos },
        body: JSON.stringify(corpo),
        signal: AbortSignal.timeout(tempoMs),
    });
    const texto = await resposta.text();
    let dados = null;
    try {
        dados = texto ? JSON.parse(texto) : null;
    } catch {
        dados = null;
    }
    if (!resposta.ok) {
        const detalhe = dados?.error?.message || dados?.message || dados?.detail || texto.slice(0, 200) || resposta.statusText;
        const esperar = Number(resposta.headers.get('retry-after')) || undefined;
        throw new ErroDeIA(`${resposta.status} ${String(detalhe).slice(0, 200)}`, resposta.status, esperar);
    }
    return dados;
}

// Formato "OpenAI" usado pela Mistral e pelo OpenRouter.
function textoDoChat(dados) {
    const conteudo = dados?.choices?.[0]?.message?.content;
    if (Array.isArray(conteudo)) return conteudo.filter((p) => p.type === 'text').map((p) => p.text).join('');
    return String(conteudo || '');
}

module.exports = { ErroDeIA, postarJson, textoDoChat };
