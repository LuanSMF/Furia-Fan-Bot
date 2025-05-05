const { exibirHistoricoPartida,exibirResumoPartida  } = require('../../comandos/partidas');
const { pool } = require('../../banco/database');

// Manipula callbacks relacionados às partidas encerradas
module.exports = async function handleCallbackPartidas(bot, chatId, messageId, userId, isAdmin, data, callbackQuery) {
        // Verifica se o callback recebido corresponde a ações esperadas
    if (!data.startsWith('ver_resumo_') && !data.startsWith('ver_eventos_')) return false;

      // Extrai o ID da partida a partir do callback
    const idPartida = parseInt(data.split('_').pop());

    // Consulta a partida no banco de dado
    const [rows] = await pool.query(`
        SELECT m.id_matches, m.dt_match, m.dt_time, m.id_formato, t.nm_name AS adversario
        FROM tb_matches m
        JOIN tb_multivalorado mv ON m.id_multivalorado = mv.id_multivalorado
        JOIN tb_teams t ON mv.id_teams = t.id_teams
        WHERE m.id_matches = ?
    `, [idPartida]);

    const partida = rows[0];

    // Se a partida não for encontrada, informa o usuário
    if (!partida) {
        await bot.telegram.sendMessage(chatId, '❌ Partida não encontrada.');
        return true;
    }

     // Caso seja um pedido de resumo da partida
    if (data.startsWith('ver_resumo_')) {
        await exibirResumoPartida(bot, chatId, idPartida);
    }

    // Caso seja um pedido de eventos detalhados da partida
    if (data.startsWith('ver_eventos_')) {
        await exibirHistoricoPartida(bot, chatId, idPartida);
    }

    return true;
};
