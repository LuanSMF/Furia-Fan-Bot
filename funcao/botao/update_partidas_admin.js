const { pool, getAllMatches, getTournamentsFromDB } = require('../../banco/database');
const { formatDate, chunkArray, formatTime } = require('../../utils/utils');
const security = require('../../admin/security');

// Função principal que trata a atualização de partidas
async function handleUpdatePartida(bot, chatId, messageId, userId, isAdmin, data, callbackQuery) {
     // Verifica se o comando é para atualizar uma partida
    if (data === 'update_match') {
        // Garante que apenas administradores possam acessar
        if (!isAdmin) {
            return await bot.telegram.answerCbQuery(callbackQuery.id, { text: "❌ Acesso não autorizado" });
        }

        try {
            // Filtra partidas que não estão encerradas (id_status !== 3)
            const matches = (await getAllMatches()).filter(match => match.id_status !== 3);
            if (!matches || matches.length === 0) {
                // Se não houver partidas, avisa o usuário
                return await bot.telegram.editMessageText(chatId, messageId, null, 'Nenhuma partida cadastrada para atualizar.', {
                    reply_markup: { inline_keyboard: [[{ text: "🔙 Voltar", callback_data: "admin_agenda" }]] }
                });
            }

            // Monta os botões de seleção de partida com informações úteis
            const matchButtons = matches.map(match => ({
                text: `🎮 ${security.escapeHtml(match.team_name || 'Sem time')} | 🏆 ${security.escapeHtml(match.tournament_name || 'Desconhecido')} | 🗓️ ${match.dt_match ? formatDate(match.dt_match) : 'Data indefinida'} |  ⏰ ${match.dt_time ? formatTime(match.dt_time) : 'Sem hora'}`,
                callback_data: `select_match_update_${match.id_matches}`
            }));

            const chunkedButtons = chunkArray(matchButtons, 1);
            chunkedButtons.push([{ text: "🔙 Voltar", callback_data: "admin_agenda" }]);

            // Mostra a lista de partidas para atualização
            await bot.telegram.editMessageText(chatId, messageId, null, 'Selecione a partida para atualizar:', {
                reply_markup: { inline_keyboard: chunkedButtons }
            });

            return true;
        } catch (error) {
            // Erro ao buscar partidas
            console.error('Erro ao listar partidas:', error);
            await bot.telegram.editMessageText(chatId, messageId, null, '❌ Erro ao listar partidas.', {
                reply_markup: { inline_keyboard: [[{ text: "🔙 Voltar", callback_data: "admin_agenda" }]] }
            });
            return true;
        }
    }

    // Trata a seleção de uma partida específica
    if (data.startsWith('select_match_update_')) {
        const matchId = security.validateId(data.replace('select_match_update_', ''));
        if (!matchId) return false;

        // Exibe opções de atualização para a partida selecionada
        await bot.telegram.editMessageText(chatId, messageId, null, 'Selecione o que deseja atualizar:', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "📅 Data", callback_data: `update_match_date_${matchId}` }],
                    [{ text: "⏰ Hora", callback_data: `update_match_time_${matchId}` }],
                    [{ text: "🎮 Adversário", callback_data: `update_match_team_${matchId}` }],
                    [{ text: "🏆 Torneio", callback_data: `update_match_tournament_${matchId}` }],
                    [{ text: "📌 Formato", callback_data: `update_match_format_${matchId}` }],
                    [{ text: "🔙 Voltar", callback_data: "update_match" }]
                ]
            }
        });
        return true;
    }

     // Trata o início do processo de atualização do formato da partida (MD1, MD3, etc.)
    if (data.startsWith('update_match_format_')) {
        const matchId = security.validateId(data.replace('update_match_format_', ''));
        if (!matchId) return false;

        // Salva o estado de atualização
        console.log("🎯 Entrou no botão de escolher formato");
        console.log("📌 matchId recebido:", matchId);

        bot.context.userStates[userId] = { step: 'updating_match_format', matchId };

        // Exibe botões para escolher novo formato
        await bot.telegram.sendMessage(chatId, '📌 Escolha o novo formato da partida:', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🎯 MD1", callback_data: `set_format_edit_1_${matchId}` }],
                    [{ text: "🎯 MD3", callback_data: `set_format_edit_2_${matchId}` }],
                    [{ text: "🎯 MD5", callback_data: `set_format_edit_3_${matchId}` }],
                    [{ text: "🔙 Voltar", callback_data: `select_match_update_${matchId}` }]
                ]
            }
        });
        return true;
    }

    // Executa a atualização do formato da partida no banco
    if (data.startsWith('set_format_edit_')) {
        let matchId, id_formato;
        try {
            console.log('🔍 Callback de formato recebido:', data);
            
            // Extrai os parâmetros
            const parts = data.split('_');
             id_formato = parseInt(parts[3]);
             matchId = parseInt(parts[4]);
            
            console.log('📊 Parâmetros extraídos:', {id_formato, matchId});
    
            // Validação
            if (isNaN(id_formato) || isNaN(matchId)) {
                throw new Error('IDs inválidos');
            }

            let md= null;
            if(id_formato === 1){
                md=1
            }else if(id_formato === 2){
                md=3
            }else if(id_formato === 3){
                md=5
            }
            
            // Feedback imediato para o usuário
            await bot.telegram.answerCbQuery(callbackQuery.id, {
                text: `⌛ Atualizando para MD${md}...`
            });
    
            // Atualização no banco de dados
            const [result] = await pool.execute(
                'UPDATE tb_matches SET id_formato = ? WHERE id_matches = ?',
                [id_formato, matchId]
            );
            
            console.log('✅ Resultado da atualização:', md);
    
            // Atualização da mensagem
            await bot.telegram.editMessageText(
                chatId,
                messageId,
                null,
                `✅ Formato atualizado para: MD${md}`,
                {
                    reply_markup: {
                        inline_keyboard: [
                            [{ 
                                text: "↩️ Voltar à partida", 
                                callback_data: `select_match_update_${matchId}` 
                            }]
                        ]
                    }
                }
            );
    
            return true;
    
        } catch (error) {
            console.error('❌ Erro crítico:', error);
            
            // Tenta enviar mensagem de erro
            try {
                await bot.telegram.answerCbQuery(callbackQuery.id, {
                    text: "❌ Falha na atualização"
                });
                
                await bot.telegram.editMessageText(
                    chatId,
                    messageId,
                    null,
                    "⚠️ Erro ao atualizar formato. Tente novamente.",
                    {
                        reply_markup: {
                            inline_keyboard: [
                                [{ 
                                    text: "🔄 Tentar novamente", 
                                    callback_data: `update_match_format_${matchId}` 
                                }]
                            ]
                        }
                    }
                );
            } catch (secondaryError) {
                console.error('❌ Falha ao enviar mensagem de erro:', secondaryError);
            }
            
            return false;
        }
    }
    
    
    
// Inicia atualização da data da partida
    if (data.startsWith('update_match_date_')) {
        const matchId = security.validateId(data.replace('update_match_date_', ''));
        if (!matchId) return false;

        bot.context.userStates[userId] = { step: 'updating_match_date', matchId };
        await bot.telegram.sendMessage(chatId, '📅 Envie a nova data no formato DD/MM/AAAA');
        return true;
    }

    // Inicia atualização da hora da partida
    if (data.startsWith('update_match_time_')) {
        const matchId = security.validateId(data.replace('update_match_time_', ''));
        if (!matchId) return false;

        bot.context.userStates[userId] = { step: 'updating_match_time', matchId };
        await bot.telegram.sendMessage(chatId, '⏰ Envie o novo horário no formato HH:MM');
        return true;
    }

      // Inicia troca de adversário
    if (data.startsWith('update_match_team_')) {
        const matchId = security.validateId(data.replace('update_match_team_', ''));
        if (!matchId) return false;

        // Busca todos os times disponíveis, exceto FURIA
        try {
            const [teams] = await pool.query(
                'SELECT id_teams, nm_name FROM tb_teams WHERE nm_name != "FURIA" ORDER BY nm_name'
            );

            if (teams.length === 0) {
                return await bot.telegram.answerCbQuery(callbackQuery.id, {
                    text: "❌ Nenhum time disponível"
                });
            }

            const teamButtons = teams.map(team => ({
                text: security.escapeHtml(team.nm_name),
                callback_data: `select_new_team_${matchId}_${team.id_teams}`
            }));

            const chunkedButtons = chunkArray(teamButtons, 2);
            chunkedButtons.push([{ text: "❌ Cancelar", callback_data: `select_match_update_${matchId}` }]);

            await bot.telegram.editMessageText(chatId, messageId, null, 'Selecione o NOVO adversário:', {
                reply_markup: { inline_keyboard: chunkedButtons }
            });

            return true;

        } catch (error) {
            console.error('Erro ao buscar times:', error);
            await bot.telegram.editMessageText(chatId, messageId, null, '❌ Erro ao carregar times.', {
                reply_markup: { inline_keyboard: [[{ text: "🔙 Voltar", callback_data: `select_match_update_${matchId}` }]] }
            });
            return true;
        }
    }

    // Finaliza troca de time adversário no banco
    if (data.startsWith('select_new_team_')) {
        const parts = data.split('_');
        const matchId = security.validateId(parts[3]);
        const teamId = security.validateId(parts[4]);
        if (!matchId || !teamId) return false;

        try {
            const [matchRows] = await pool.query(
                'SELECT id_multivalorado FROM tb_matches WHERE id_matches = ?',
                [matchId]
            );
            if (matchRows.length === 0) throw new Error('Partida não encontrada');

            const id_multivalorado = matchRows[0].id_multivalorado;
            await pool.query('UPDATE tb_multivalorado SET id_teams = ? WHERE id_multivalorado = ?', [teamId, id_multivalorado]);

            const [team] = await pool.query('SELECT nm_name FROM tb_teams WHERE id_teams = ?', [teamId]);
            await bot.telegram.editMessageText(chatId, messageId, null, `✅ Adversário atualizado para: ${security.escapeHtml(team[0].nm_name)}`, {
                reply_markup: { inline_keyboard: [[{ text: "🔙 Voltar ao Menu", callback_data: "admin_agenda" }]] }
            });
            return true;

        } catch (error) {
            console.error('Erro ao atualizar adversário:', error);
            await bot.telegram.editMessageText(chatId, messageId, null, `❌ Erro ao atualizar adversário: ${security.escapeHtml(error.message)}`, {
                reply_markup: { inline_keyboard: [[{ text: "🔙 Voltar", callback_data: `select_match_update_${matchId}` }]] }
            });
            return true;
        }
    }

     // Atualização de torneio segue a mesma lógica, com filtro por times vinculados
    if (data.startsWith('update_match_tournament_')) {
        const matchId = security.validateId(data.replace('update_match_tournament_', ''));
        if (!matchId) return false;

        try {
            const [matchData] = await pool.query(`
                SELECT mv.id_teams
                FROM tb_matches m
                INNER JOIN tb_multivalorado mv ON m.id_multivalorado = mv.id_multivalorado
                WHERE m.id_matches = ?
            `, [matchId]);

            if (matchData.length === 0) throw new Error('Partida não encontrada');

            const teamId = matchData[0].id_teams;

            const [validTournaments] = await pool.query(`
                SELECT t.id_tournaments, t.nm_name
                FROM tb_tournaments t
                INNER JOIN tb_multivalorado mv ON mv.id_tournaments = t.id_tournaments
                WHERE mv.id_teams = ?
                GROUP BY t.id_tournaments, t.nm_name
            `, [teamId]);

            if (validTournaments.length === 0) {
                return await bot.telegram.answerCbQuery(callbackQuery.id, {
                    text: "❌ Este time não está vinculado a nenhum outro torneio"
                });
            }

            const tournamentButtons = validTournaments.map(tournament => ({
                text: security.escapeHtml(tournament.nm_name),
                callback_data: `select_new_tournament_${matchId}_${tournament.id_tournaments}`
            }));

            const chunkedButtons = chunkArray(tournamentButtons, 2);
            chunkedButtons.push([{ text: "❌ Cancelar", callback_data: `select_match_update_${matchId}` }]);

            await bot.telegram.editMessageText(chatId, messageId, null, '🏆 Selecione o NOVO torneio disponível para esse adversário:', {
                reply_markup: { inline_keyboard: chunkedButtons }
            });

            return true;

        } catch (error) {
            console.error('Erro ao carregar torneios filtrados:', error);
            await bot.telegram.editMessageText(chatId, messageId, null, `❌ Erro ao carregar torneios: ${security.escapeHtml(error.message)}`, {
                reply_markup: {
                    inline_keyboard: [[{ text: "🔙 Voltar", callback_data: `select_match_update_${matchId}` }]]
                }
            });
            return true;
        }
    }

    // Atualiza torneio no banco de dados
    if (data.startsWith('select_new_tournament_')) {
        const parts = data.split('_');
        const matchId = security.validateId(parts[3]);
        const tournamentId = security.validateId(parts[4]);
        if (!matchId || !tournamentId) return false;

        try {
            const [match] = await pool.query(
                'SELECT id_multivalorado FROM tb_matches WHERE id_matches = ?',
                [matchId]
            );
            if (match.length === 0) throw new Error('Partida não encontrada');

            const id_multivalorado = match[0].id_multivalorado;

            await pool.query(
                'UPDATE tb_multivalorado SET id_tournaments = ? WHERE id_multivalorado = ?',
                [tournamentId, id_multivalorado]
            );

            const [tournament] = await pool.query(
                'SELECT nm_name FROM tb_tournaments WHERE id_tournaments = ?',
                [tournamentId]
            );

            await bot.telegram.editMessageText(chatId, messageId, null, `✅ Torneio atualizado para: ${security.escapeHtml(tournament[0].nm_name)}`, {
                reply_markup: { inline_keyboard: [[{ text: "🔙 Voltar ao Menu", callback_data: "admin_agenda" }]] }
            });

            return true;

        } catch (error) {
            console.error('Erro ao atualizar torneio:', error);
            await bot.telegram.editMessageText(chatId, messageId, null, `❌ Erro ao atualizar torneio: ${security.escapeHtml(error.message)}`, {
                reply_markup: { inline_keyboard: [[{ text: "🔙 Voltar", callback_data: `select_match_update_${matchId}` }]] }
            });
            return true;
        }
    }

    return false;
}

module.exports = { handleUpdatePartida };
