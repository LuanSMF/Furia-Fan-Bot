const { pool, getAllMatches, removeMatch } = require('../../banco/database');
const { formatDate, formatTime, chunkArray } = require('../../utils/utils');
const security = require('../../admin/security');

// Função principal para lidar com os botões de remoção de partidas
async function handleDeletePartida(bot, chatId, messageId, userId, isAdmin, data, callbackQuery) {
    // Caso o botão seja para iniciar o processo de remoção
    if (data === 'remove_match') {
        if (!isAdmin) {
            await bot.telegram.answerCbQuery(callbackQuery.id, { text: "❌ Acesso não autorizado" });
            return true;
        }

        try {
            const matches = await getAllMatches();
            if (!matches || !Array.isArray(matches)) throw new Error('Dados de partidas inválidos');

            if (matches.length === 0) {
                await bot.telegram.editMessageText(chatId, messageId, null, 'Nenhuma partida cadastrada para remover.', {
                    reply_markup: { inline_keyboard: [[{ text: "🔙 Voltar", callback_data: "admin_panel" }]] }
                });
                return true;
            }

             // Cria lista de botões com os dados das partidas
            const matchButtons = matches.map(match => ({
                text: `🎮 ${security.escapeHtml(match.team_name || 'Sem time')} | 🏆 ${security.escapeHtml(match.tournament_name || 'Desconhecido')} | 🗓️ ${match.dt_match ? formatDate(match.dt_match) : 'Data indefinida'} |  ⏰ ${match.dt_time ? formatTime(match.dt_time) : 'Sem hora'}`,
                callback_data: `confirm_remove_${match.id_matches}`
            }));

            const chunkedButtons = chunkArray(matchButtons, 1);
            chunkedButtons.push([{ text: "🔙 Voltar", callback_data: "admin_panel" }]);

            await bot.telegram.editMessageText(chatId, messageId, null, 'Selecione a partida para remover:', {
                reply_markup: { inline_keyboard: chunkedButtons }
            });

            return true;
        } catch (error) {
            console.error('Erro ao listar partidas:', error);
            await bot.telegram.editMessageText(chatId, messageId, null, '❌ Erro ao listar partidas.', {
                reply_markup: { inline_keyboard: [[{ text: "🔙 Voltar", callback_data: "admin_panel" }]] }
            });
            return true;
        }
    }

    // Confirmação visual antes de remover a partida
    else if (data.startsWith('confirm_remove_')) {
        const rawMatchId = data.replace('confirm_remove_', '');
        const matchId = security.validateId(rawMatchId);

        if (!matchId) {
            return await bot.telegram.answerCbQuery(callbackQuery.id, { text: "❌ ID inválido" });
        }

        try {
            const [match] = await pool.query(`
                SELECT 
                    m.id_matches,
                    m.id_formato,
                    t.nm_name as team_name,
                    tour.nm_name as tournament_name,
                    m.dt_match,
                    m.dt_time
                FROM tb_matches m
                JOIN tb_multivalorado mv ON m.id_multivalorado = mv.id_multivalorado
                JOIN tb_teams t ON mv.id_teams = t.id_teams
                JOIN tb_tournaments tour ON mv.id_tournaments = tour.id_tournaments
                WHERE m.id_matches = ?
            `, [matchId]);

            if (match.length === 0) {
                await bot.telegram.editMessageText(chatId, messageId, null, '❌ Partida não encontrada ou já removida.', {
                    reply_markup: { inline_keyboard: [[{ text: "🔙 Voltar", callback_data: "remove_match" }]] }
                });
                return true;
            }

            const matchInfo = match[0];
            const formatMap = { 1: 'MD1', 2: 'MD3', 3: 'MD5' };
            const formatoTexto = formatMap[matchInfo.id_formato] || 'Formato indefinido';

            await bot.telegram.editMessageText(chatId, messageId, null,
                `⚠️ Confirmar remoção:\n\n📅 ${formatDate(matchInfo.dt_match)}\n\n🏆 ${security.escapeHtml(matchInfo.tournament_name)}\n📌 Formato: ${formatoTexto}\n⏰ ${formatTime(matchInfo.dt_time) || 'Sem horário'}\n🎮 Furia vs ${security.escapeHtml(matchInfo.team_name)}`,
                {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: "✅ Confirmar", callback_data: `execute_remove_${matchId}` },
                                { text: "❌ Cancelar", callback_data: "remove_match" }
                            ]
                        ]
                    }
                }
            );

            return true;
        } catch (error) {
            console.error('Erro ao buscar partida:', error);
            await bot.telegram.editMessageText(chatId, messageId, null, '❌ Erro ao buscar detalhes.', {
                reply_markup: { inline_keyboard: [[{ text: "🔙 Voltar", callback_data: "remove_match" }]] }
            });
            return true;
        }
    }

     // Execução final da remoção da partida
    else if (data.startsWith('execute_remove_')) {
        const rawMatchId = data.replace('execute_remove_', '');
        const matchId = security.validateId(rawMatchId);

        if (!matchId) {
            return await bot.telegram.answerCbQuery(callbackQuery.id, { text: "❌ ID inválido" });
        }

        try {
            const [check] = await pool.query('SELECT 1 FROM tb_matches WHERE id_matches = ?', [matchId]);
            if (check.length === 0) {
                await bot.telegram.editMessageText(chatId, messageId, null, '❌ Partida não encontrada.', {
                    reply_markup: { inline_keyboard: [[{ text: "🔙 Voltar", callback_data: "remove_match" }]] }
                });
                return true;
            }

            const wasRemoved = await removeMatch(matchId);
            if (!wasRemoved) throw new Error('Erro ao remover partida');

            await bot.telegram.editMessageText(chatId, messageId, null, `✅ Partida  removida com sucesso!`, {
                reply_markup: { inline_keyboard: [[{ text: "🔙 Voltar ao Painel Admin", callback_data: "admin_panel" }]] }
            });

            return true;
        } catch (error) {
            console.error('Erro ao remover partida:', error);
            let userMessage = error.message;

            if (userMessage.includes("Incorrect date value")) {
                userMessage = "❌ A data informada é inválida. Verifique se o dia existe no mês escolhido (ex: 31/04 não é válido).";
            }

            await bot.telegram.editMessageText(chatId, messageId, null, `❌ Erro: ${security.escapeHtml(userMessage)}`, {
                reply_markup: {
                    inline_keyboard: [[{ text: "🔙 Voltar", callback_data: "remove_match" }]]
                }
            });
            return true;
        }
    }

    return false;
}

module.exports = { handleDeletePartida };
