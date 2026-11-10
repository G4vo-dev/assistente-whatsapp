// IDs curtos para lançamentos e lembretes: o horário em base 36 mais 4 letras sorteadas.
function novoId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

module.exports = { novoId };
