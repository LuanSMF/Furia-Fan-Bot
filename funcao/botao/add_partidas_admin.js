const { 
    pool,
    getTeamsByTournamentFromDB,
    getTournamentsFromDB
} = require('../../banco/database');
const { chunkArray } = require('../../utils/utils');

// ===========================
// Manipulador principal para botões de adição de partidas
// ===========================
module.exports = async (bot, chatId, messageId, userId, isAdmin, data, callbackQuery) => {

    // Etapa 1: Início do cadastro de partida
    if (data === 'add_match') {
        if (!isAdmin) {
            // Restringe o acesso a administradores
            return await bot.telegram.answerCbQuery(callbackQuery.id, {
                text: "❌ Acesso não autorizado"
            });
        }
        
        try {
            // Busca todos os torneios cadastrados
            const tournaments = await getTournamentsFromDB();
            
            if (tournaments.length === 0) {
                return await bot.telegram.answerCbQuery(callbackQuery.id, {
                    text: "❌ Nenhum torneio cadastrado"
                });
            }
            
             // Filtra apenas torneios que já têm times cadastrados
            const validTournaments = [];
            
            for (const tournament of tournaments) {
                const teams = await getTeamsByTournamentFromDB(tournament.id_tournaments);
                if (teams.length > 0) {
                    validTournaments.push(tournament);
                }
            }
            
            if (validTournaments.length === 0) {
                return await bot.telegram.answerCbQuery(callbackQuery.id, {
                    text: "❌ Nenhum torneio com times cadastrados"
                });
            }
            
            // Cria o teclado com torneios válidos
            const keyboard = validTournaments.map(t => [{
                text: t.nm_name,
                callback_data: `addmatch_tournament_${t.id_tournaments}`
            }]);
            
             // Adiciona botão de voltar
            keyboard.push([{ text: "🔙 Voltar", callback_data: "admin_panel" }]);
            
            // Envia mensagem de escolha de torneio
            return await bot.telegram.editMessageText(chatId, messageId, null, '🏆 Escolha o torneio:', {
                reply_markup: { inline_keyboard: keyboard }
            });
            
        } catch (error) {
            console.error("Erro ao listar torneios:", error);
            return await bot.telegram.answerCbQuery(callbackQuery.id, {
                text: "❌ Erro ao carregar torneios"
            });
        }
    }

    // ===========================
    // Etapa 2: Escolha do time adversário
    // ===========================
    else if (data.startsWith('addmatch_tournament_')) {
        const tournamentId = parseInt(data.replace('addmatch_tournament_', ''));
        
        if (isNaN(tournamentId)) {
            return await bot.telegram.answerCbQuery(callbackQuery.id, {
                text: "❌ ID do torneio inválido"
            });
        }
        
        try {
            const teams = await getTeamsByTournamentFromDB(tournamentId);
            
            if (teams.length === 0) {
                return await bot.telegram.answerCbQuery(callbackQuery.id, {
                    text: "❌ Nenhum time cadastrado para este torneio"
                });
            }
            
             // Gera botões com os times do torneio
            const keyboard = teams.map(t => [{
                text: t.nm_name,
                callback_data: `addmatch_team_${tournamentId}_${t.id_teams}`
            }]);
            
            keyboard.push(
                [{ text: "❌ Cancelar", callback_data: "main_menu" }],
                [{ text: "🔙 Voltar", callback_data: "add_match" }]
            );
            
            return await bot.telegram.editMessageText(chatId, messageId, null, '👥 Escolha o adversário:', {
                reply_markup: { inline_keyboard: keyboard }
            });
            
        } catch (error) {
            console.error("Erro ao listar times:", error);
            return await bot.telegram.answerCbQuery(callbackQuery.id, {
                text: "❌ Erro ao carregar times"
            });
        }
    }
    // ===========================
    // Etapa 3: Escolha do formato da partida (MD1, MD3, MD5)
    // ===========================
    else if (data.startsWith('addmatch_team_')) {
        const parts = data.split('_');
    
        // Verifica se o callback está no formato esperado
        if (parts.length !== 4) {
            return await bot.telegram.answerCbQuery(callbackQuery.id, {
                text: "❌ Formato inválido"
            });
        }
    
        const tournamentId = parseInt(parts[2]);
        const teamId = parseInt(parts[3]);
    
        if (isNaN(tournamentId) || isNaN(teamId)) {
            return await bot.telegram.answerCbQuery(callbackQuery.id, {
                text: "❌ IDs inválidos"
            });
        }
    
        // Salva no estado do usuário
        bot.context.userStates[userId] = {
            step: 'awaiting_match_format',
            tournamentId,
            teamId
        };
    
        // Mostra botões para escolher MD1 / MD3 / MD5
        const keyboard = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🎯 MD1", callback_data: "set_format_1" }],
                    [{ text: "🎯 MD3", callback_data: "set_format_2" }],
                    [{ text: "🎯 MD5", callback_data: "set_format_3" }],
                    [{ text: "🔙 Voltar", callback_data: "add_match" }]
                ]
            }
        };
    
        return await bot.telegram.editMessageText(chatId, messageId, null, '🎮 Escolha o formato da partida:', keyboard);
    }
    
    // ===========================
    // Etapa 4: Enviar data e hora da partida
    // ===========================
    else if (data.startsWith('set_format_')) {
        const id_formato = parseInt(data.replace('set_format_', ''));
    
        if (![1, 2, 3].includes(id_formato)) {
            return await bot.telegram.answerCbQuery(callbackQuery.id, {
                text: "❌ Formato inválido"
            });
        }

        const state = bot.context.userStates[userId];

        // Verifica se os dados anteriores estão completos
        if (!state || !state.tournamentId || !state.teamId) {
            return await bot.telegram.answerCbQuery(callbackQuery.id, {
                text: "❌ Dados incompletos. Comece novamente."
            });
        }
    
        // Atualiza o contexto do usuário com o formato
        bot.context.userStates[userId].id_formato = id_formato;
        bot.context.userStates[userId].step = 'awaiting_match_datetime';
    
        // Solicita envio da data e hora
        return await bot.telegram.editMessageText(chatId, messageId, null, '🗓️ Agora envie a data e hora (DD/MM/AAAA HH:MM):', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "❌ Cancelar", callback_data: "main_menu" }]
                ]
            }
        });
    }
       

    return false;
};
