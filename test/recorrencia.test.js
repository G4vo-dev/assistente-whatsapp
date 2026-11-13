// Testes dos lembretes que se repetem (todo dia, toda semana, todo mês).
const test = require('node:test');
const assert = require('node:assert');
const { lerRegra, proxima } = require('../src/servicos/recorrencia');

// Horário de Brasília = UTC-3. 8h em Brasília = 11h UTC.
const utc = (texto) => new Date(texto).getTime();

test('lê "todo dia 8h" com a mensagem', () => {
    assert.deepStrictEqual(lerRegra('todo dia 8h tomar remédio'.split(' ')),
        { regra: { tipo: 'diario', hora: 8, minuto: 0 }, texto: 'tomar remédio' });
});

test('lê "toda segunda 8h30" e "toda terça-feira 18:15"', () => {
    assert.deepStrictEqual(lerRegra('toda segunda 8h30 reunião'.split(' ')),
        { regra: { tipo: 'semanal', diaSemana: 1, hora: 8, minuto: 30 }, texto: 'reunião' });
    assert.deepStrictEqual(lerRegra('toda terça-feira 18:15 aula'.split(' ')),
        { regra: { tipo: 'semanal', diaSemana: 2, hora: 18, minuto: 15 }, texto: 'aula' });
});

test('lê "todo mês dia 5 9h"', () => {
    assert.deepStrictEqual(lerRegra('todo mês dia 5 9h pagar aluguel'.split(' ')),
        { regra: { tipo: 'mensal', diaMes: 5, hora: 9, minuto: 0 }, texto: 'pagar aluguel' });
});

test('rejeita hora inválida, dia inválido e falta de mensagem', () => {
    assert.strictEqual(lerRegra('todo dia 25h algo'.split(' ')), null);
    assert.strictEqual(lerRegra('todo dia 8h'.split(' ')), null);
    assert.strictEqual(lerRegra('toda blabla 8h algo'.split(' ')), null);
    assert.strictEqual(lerRegra('todo mês dia 40 9h algo'.split(' ')), null);
    assert.strictEqual(lerRegra('10 tirar a comida do fogo'.split(' ')), null);
});

test('próxima ocorrência diária: hoje se ainda não passou, senão amanhã', () => {
    const regra = { tipo: 'diario', hora: 8, minuto: 0 };
    assert.strictEqual(proxima(regra, utc('2026-11-10T10:00:00Z')), utc('2026-11-10T11:00:00Z'));
    assert.strictEqual(proxima(regra, utc('2026-11-10T12:00:00Z')), utc('2026-11-11T11:00:00Z'));
});

test('próxima ocorrência semanal: segunda 8h a partir de uma terça', () => {
    const regra = { tipo: 'semanal', diaSemana: 1, hora: 8, minuto: 0 };
    assert.strictEqual(proxima(regra, utc('2026-11-10T12:00:00Z')), utc('2026-11-16T11:00:00Z'));
});

test('próxima ocorrência mensal: dia 31 vira o último dia dos meses curtos', () => {
    const regra = { tipo: 'mensal', diaMes: 31, hora: 9, minuto: 0 };
    assert.strictEqual(proxima(regra, utc('2026-11-01T12:00:00Z')), utc('2026-11-30T12:00:00Z'));
    assert.strictEqual(proxima(regra, utc('2026-11-30T13:00:00Z')), utc('2026-12-31T12:00:00Z'));
});
