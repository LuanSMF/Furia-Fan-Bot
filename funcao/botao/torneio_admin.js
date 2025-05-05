const { 
    pool,
    getTournamentsFromDB,
    removeTournament
} = require('../../banco/database');

const { chunkArray } = require('../../utils/utils');
const security = require('../../admin/security');
const handleUpdateTime = require('./update_time');

// Função principal exportada que trata ações de botões relacionados a torneios
module.exports = async (bot, chatId, messageId, userId, isAdmin, data, callbackQuery) => {
      // Adicionar novo torneio
    if (data === 'add_tournament') {
        if (!isAdmin) {
            await bot.telegram.answerCbQuery(callbackQuery.id, { text: "❌ Acesso não autorizado" });
            return true;
        }

         // Define que o usuário está na etapa de digitação do nome do torneio
        bot.context.userStates[userId] = { step: 'awaiting_tournament_name' };

        // Solicita ao admin o nome da nova competição
        await bot.telegram.editMessageText(chatId, messageId, null, '✏️ Digite o nome da nova competição:', {
            reply_markup: {
                inline_keyboard: [[{ text: "❌ Cancelar", callback_data: "main_menu" }]]
            }
        });
        return true;
    }

    // Remover torneio
    if (data === 'remove_tournament') {
        if (!isAdmin) {
            await bot.telegram.answerCbQuery(callbackQuery.id, { text: "❌ Acesso não autorizado" });
            return true;
        }

        try {
            const tournaments = await getTournamentsFromDB();
            if (tournaments.length === 0) {
                await bot.telegram.editMessageText(chatId, messageId, null, 'Nenhum torneio cadastrado para remover.', {
                    reply_markup: {
                        inline_keyboard: [[{ text: "🔙 Voltar", callback_data: "admin_panel" }]]
                    }
                });
                return true;
            }

            // Monta teclado com os torneios
            const tournamentButtons = tournaments.map(t => ({
                text: security.escapeHtml(t.nm_name),
                callback_data: `select_tournament_remove_${t.id_tournaments}`
            }));

            const chunked = chunkArray(tournamentButtons, 2);
            chunked.push([{ text: "🔙 Voltar", callback_data: "admin_panel" }]);

             // Exibe lista de torneios para o admin selecionar um para remover
            await bot.telegram.editMessageText(chatId, messageId, null, 'Selecione o torneio para remover:', {
                reply_markup: { inline_keyboard: chunked }
            });
            return true;
        } catch (error) {
            console.error('Erro ao listar torneios:', error);
            await bot.telegram.editMessageText(chatId, messageId, null, '❌ Erro ao listar torneios.', {
                reply_markup: {
                    inline_keyboard: [[{ text: "🔙 Voltar", callback_data: "admin_panel" }]]
                }
            });
            return true;
        }
    }

     // Confirmação de remoção
    if (data.startsWith('select_tournament_remove_')) {
        const tournamentId = security.validateId(data.replace('select_tournament_remove_', ''));
        if (!tournamentId) {
            await bot.telegram.answerCbQuery(callbackQuery.id, { text: "❌ ID inválido" });
            return true;
        }

        const [tournament] = await pool.query(
            'SELECT id_tournaments, nm_name FROM tb_tournaments WHERE id_tournaments = ?',
            [tournamentId]
        );

        if (tournament.length === 0) {
            await bot.telegram.editMessageText(chatId, messageId, null, '❌ Torneio não encontrado.', {
                reply_markup: {
                    inline_keyboard: [[{ text: "🔙 Voltar", callback_data: "remove_tournament" }]]
                }
            });
            return true;
        }

        const { nm_name } = tournament[0];

        // Solicita confirmação ao admin para excluir o torneio e todas as partidas ligadas
        await bot.telegram.editMessageText(chatId, messageId, null,
            `⚠️ Confirmar remoção do torneio:\n\n🏆 Nome: ${security.escapeHtml(nm_name)}\n\n❗ Isso removerá todas as partidas relacionadas.`,
            {
                reply_markup: {
                    inline_keyboard: [[
                        { text: "✅ Confirmar", callback_data: `execute_remove_tournament_${tournamentId}` },
                        { text: "❌ Cancelar", callback_data: "remove_tournament" }
                    ]]
                }
            }
        );
        return true;
    }

    // Execução da remoção no banco
    if (data.startsWith('execute_remove_tournament_')) {
        const tournamentId = security.validateId(data.replace('execute_remove_tournament_', ''));
        if (!tournamentId) {
            await bot.telegram.answerCbQuery(callbackQuery.id, { text: "❌ ID inválido" });
            return true;
        }

        try {
            const wasRemoved = await removeTournament(tournamentId);

            if (!wasRemoved) {
                throw new Error('Torneio não encontrado');
            }

            await bot.telegram.editMessageText(chatId, messageId, null, '✅ Torneio removido com sucesso!', {
                reply_markup: {
                    inline_keyboard: [[{ text: "🔙 Voltar ao Painel Admin", callback_data: "admin_panel" }]]
                }
            });
        } catch (error) {
            console.error('Erro ao remover torneio:', error);
            await bot.telegram.editMessageText(chatId, messageId, null, `❌ Erro ao remover: ${security.escapeHtml(error.message)}`, {
                reply_markup: {
                    inline_keyboard: [[{ text: "🔙 Voltar", callback_data: "remove_tournament" }]]
                }
            });
        }
        return true;
    }

     // Atualizar nome de torneio
    if (data === 'update_tournament') {
        if (!isAdmin) {
            await bot.telegram.answerCbQuery(callbackQuery.id, { text: "❌ Acesso não autorizado" });
            return true;
        }

        try {
            const tournaments = await getTournamentsFromDB();

            if (tournaments.length === 0) {
                await bot.telegram.editMessageText(chatId, messageId, null, 'Nenhuma competição cadastrada para atualizar.', {
                    reply_markup: {
                        inline_keyboard: [[{ text: "🔙 Voltar", callback_data: "admin_agenda" }]]
                    }
                });
                return true;
            }

            const tournamentButtons = tournaments.map(t => ({
                text: security.escapeHtml(t.nm_name),
                callback_data: `select_tournament_update_${t.id_tournaments}`
            }));

            const chunked = chunkArray(tournamentButtons, 2);
            chunked.push([{ text: "🔙 Voltar", callback_data: "admin_agenda" }]);

            await bot.telegram.editMessageText(chatId, messageId, null, 'Selecione a competição para atualizar:', {
                reply_markup: { inline_keyboard: chunked }
            });
            return true;
        } catch (error) {
            console.error('Erro ao listar competições:', error);
            await bot.telegram.editMessageText(chatId, messageId, null, '❌ Erro ao carregar competições.', {
                reply_markup: {
                    inline_keyboard: [[{ text: "🔙 Voltar", callback_data: "admin_agenda" }]]
                }
            });
            return true;
        }
    }

    // Captura o torneio escolhido para renomeação

    if (data.startsWith('select_tournament_update_')) {
        const tournamentId = security.validateId(data.replace('select_tournament_update_', ''));
        if (!tournamentId) {
            await bot.telegram.answerCbQuery(callbackQuery.id, { text: "❌ ID inválido" });
            return true;
        }

        // Atualiza o estado do usuário para aguardar novo nome do torneio
        bot.context.userStates[userId] = {
            step: 'updating_tournament_name',
            tournamentId
        };

        await bot.telegram.editMessageText(chatId, messageId, null, '✏️ Digite o NOVO nome para esta competição:', {
            reply_markup: {
                inline_keyboard: [[{ text: "❌ Cancelar", callback_data: "main_menu" }]]
            }
        });
        return true;
    }

    // Redireciona chamadas de atualização de time para update_time.js
    const result = await handleUpdateTime(bot, chatId, messageId, userId, data, callbackQuery);
    if (result) return true;

    // Se nenhum if anterior tratou o callback, retorna false
    return false;
};
