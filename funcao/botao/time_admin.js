const { pool, removeTeam, getTournamentsFromDB } = require('../../banco/database');
const { chunkArray } = require('../../utils/utils');
const security = require('../../admin/security');
const handleUpdateTime = require('./update_time');

module.exports = async (bot, chatId, messageId, userId, isAdmin, data, callbackQuery) => {

    // === Adição de um novo time ===
    if (data === 'add_team') {
        // Verifica se o usuário tem permissão administrativa
        if (!isAdmin) {
            await bot.telegram.answerCbQuery(callbackQuery.id, { text: "❌ Acesso não autorizado" });
            return true;
        }

         // Busca torneios disponíveis
        const tournaments = await getTournamentsFromDB();

         // Se não houver torneios cadastrados, avisa o admin
        if (tournaments.length === 0) {
            await bot.telegram.answerCbQuery(callbackQuery.id, { text: "❌ Nenhum torneio cadastrado" });
            return true;
        }

        // Cria botões para cada torneio listado
        const keyboard = tournaments.map(t => [{
            text: security.escapeHtml(t.nm_name),
            callback_data: `addteam_tournament_${t.id_tournaments}`
        }]);
        // Botão para voltar ao painel
        keyboard.push([{ text: "🔙 Voltar", callback_data: "admin_panel" }]);

          // Envia a lista de torneios para o admin escolher
        await bot.telegram.editMessageText(chatId, messageId, null, '🏆 Escolha o torneio para adicionar o time:', {
            reply_markup: { inline_keyboard: keyboard }
        });
        return true;
    }

    // === Captura a escolha do torneio e aguarda nome do time ===
    else if (data.startsWith('addteam_tournament_')) {
        const rawId = data.replace('addteam_tournament_', '');
        const tournamentId = security.validateId(rawId);

        if (!tournamentId) {
            await bot.telegram.answerCbQuery(callbackQuery.id, { text: "❌ ID do torneio inválido" });
            return true;
        }

         // Salva o estado do usuário para a próxima etapa: nome do time
        bot.context.userStates[userId] = {
            step: 'awaiting_team_name',
            tournamentId
        };

          // Solicita o nome do time
        await bot.telegram.editMessageText(chatId, messageId, null, 'Digite o nome do novo time:', {
            reply_markup: {
                inline_keyboard: [[{ text: "❌ Cancelar", callback_data: "main_menu" }]]
            }
        });
        return true;
    }

     // === Remoção de time ===
    else if (data === 'remove_team') {
        if (!isAdmin) {
            await bot.telegram.answerCbQuery(callbackQuery.id, { text: "❌ Acesso não autorizado" });
            return true;
        }

        try {
            // Busca todos os times exceto "FURIA"
            const [teams] = await pool.query(
                'SELECT id_teams, nm_name FROM tb_teams WHERE nm_name != "FURIA" ORDER BY nm_name'
            );

            if (teams.length === 0) {
                await bot.telegram.editMessageText(chatId, messageId, null, 'Nenhum time cadastrado para remover.', {
                    reply_markup: { inline_keyboard: [[{ text: "🔙 Voltar", callback_data: "admin_panel" }]] }
                });
                return true;
            }

             // Cria botões para cada time
            const teamButtons = teams.map(team => ({
                text: security.escapeHtml(team.nm_name),
                callback_data: `confirm_remove_team_${team.id_teams}`
            }));

             // Divide botões em grupos de 2
            const chunkedButtons = chunkArray(teamButtons, 2);
            chunkedButtons.push([{ text: "🔙 Voltar", callback_data: "admin_panel" }]);

            await bot.telegram.editMessageText(chatId, messageId, null, 'Selecione o time para remover:', {
                reply_markup: { inline_keyboard: chunkedButtons }
            });
            return true;

        } catch (error) {
            console.error('Erro ao listar times:', error);
            await bot.telegram.editMessageText(chatId, messageId, null, '❌ Erro ao listar times.', {
                reply_markup: { inline_keyboard: [[{ text: "🔙 Voltar", callback_data: "admin_panel" }]] }
            });
            return true;
        }
    }

     // === Confirmação de remoção do time ===
    else if (data.startsWith('confirm_remove_team_')) {
        const teamId = security.validateId(data.replace('confirm_remove_team_', ''));
        if (!teamId) {
            await bot.telegram.answerCbQuery(callbackQuery.id, { text: "❌ ID inválido" });
            return true;
        }

        try {
            const [team] = await pool.query('SELECT id_teams, nm_name FROM tb_teams WHERE id_teams = ?', [teamId]);

            if (team.length === 0) {
                await bot.telegram.editMessageText(chatId, messageId, null, 'Time não encontrado.', {
                    reply_markup: { inline_keyboard: [[{ text: "🔙 Voltar", callback_data: "remove_team" }]] }
                });
                return true;
            }

            const teamInfo = team[0];

              // Lista torneios vinculados ao time
            const [tournaments] = await pool.query(
                `SELECT t.nm_name FROM tb_tournaments t JOIN tb_multivalorado mv ON t.id_tournaments = mv.id_tournaments WHERE mv.id_teams = ?`,
                [teamId]
            );

            const tournamentList = tournaments.map(t => security.escapeHtml(t.nm_name)).join(', ') || 'Nenhum torneio associado';

             // Confirma a remoção com aviso de consequência
            await bot.telegram.editMessageText(chatId, messageId, null,
                `⚠️ Confirmar remoção do time:\n\n` +
                `👥 Nome: ${security.escapeHtml(teamInfo.nm_name)}\n` +
                `🏆 Torneios associados: ${tournamentList}\n\n` +
                `❗ Esta ação removerá todas as partidas e vínculos com torneios!`,
                {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: "✅ Confirmar Remoção", callback_data: `execute_remove_team_${teamId}` },
                                { text: "❌ Cancelar", callback_data: "remove_team" }
                            ]
                        ]
                    }
                }
            );
            return true;

        } catch (error) {
            console.error('Erro ao buscar time:', error);
            await bot.telegram.editMessageText(chatId, messageId, null, '❌ Erro ao buscar time.', {
                reply_markup: { inline_keyboard: [[{ text: "🔙 Voltar", callback_data: "remove_team" }]] }
            });
            return true;
        }
    }

       // === Execução da remoção ===
    else if (data.startsWith('execute_remove_team_')) {
        const teamId = security.validateId(data.replace('execute_remove_team_', ''));
        if (!teamId) {
            await bot.telegram.answerCbQuery(callbackQuery.id, { text: "❌ ID inválido" });
            return true;
        }

        try {
            const wasRemoved = await removeTeam(teamId);

            if (!wasRemoved) {
                throw new Error('Time não encontrado');
            }

            await bot.telegram.editMessageText(chatId, messageId, null, '✅ Time removido com sucesso!', {
                reply_markup: {
                    inline_keyboard: [[{ text: "🔙 Voltar ao Painel Admin", callback_data: "admin_panel" }]]
                }
            });
            return true;

        } catch (error) {
            console.error('Erro ao remover time:', error);
            await bot.telegram.editMessageText(chatId, messageId, null, `❌ Erro ao remover time: ${security.escapeHtml(error.message)}`, {
                reply_markup: { inline_keyboard: [[{ text: "🔙 Voltar", callback_data: "remove_team" }]] }
            });
            return true;
        }
    }

    // === Atualização de times ===
    else if (data === 'update_team') {
        if (!isAdmin) {
            await bot.telegram.answerCbQuery(callbackQuery.id, { text: "❌ Acesso não autorizado" });
            return true;
        }

        try {
            const [teams] = await pool.query('SELECT id_teams, nm_name FROM tb_teams WHERE nm_name != "FURIA" ORDER BY nm_name');

            if (teams.length === 0) {
                await bot.telegram.editMessageText(chatId, messageId, null, 'Nenhum time disponível para atualizar.', {
                    reply_markup: { inline_keyboard: [[{ text: "🔙 Voltar", callback_data: "admin_agenda" }]] }
                });
                return true;
            }

            const teamButtons = teams.map(team => ({
                text: security.escapeHtml(team.nm_name),
                callback_data: `select_team_update_${team.id_teams}`
            }));

            const chunkedButtons = chunkArray(teamButtons, 2);
            chunkedButtons.push([{ text: "🔙 Voltar", callback_data: "admin_agenda" }]);

            await bot.telegram.editMessageText(chatId, messageId, null, 'Selecione o time para atualizar:', {
                reply_markup: { inline_keyboard: chunkedButtons }
            });
            return true;

        } catch (error) {
            console.error('Erro ao listar times:', error);
            await bot.telegram.editMessageText(chatId, messageId, null, '❌ Erro ao carregar times.', {
                reply_markup: { inline_keyboard: [[{ text: "🔙 Voltar", callback_data: "admin_agenda" }]] }
            });
            return true;
        }
    }
};
