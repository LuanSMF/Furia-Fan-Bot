const { pool, getAllMatches } = require('../banco/database');
const { formatDate } = require('../utils/utils');
const security = require('../admin/security');

// ===========================
// Função: Filtrar partidas por torneio
// ===========================
async function filterByTournament(bot, chatId, rawTournamentId, messageId = null) {
    try {
         // Valida o ID do torneio recebido
        const tournamentId = security.validateId(rawTournamentId);
        if (!tournamentId) {
            throw new Error('ID do torneio inválido');
        }
        // Busca o nome do torneio no banco
        const [tournament] = await pool.query(
            'SELECT nm_name FROM tb_tournaments WHERE id_tournaments = ?',
            [tournamentId]
        );

        if (!tournament || tournament.length === 0) {
            throw new Error('Torneio não encontrado');
        }

        const tournamentName = tournament[0].nm_name;

         // Busca todas as partidas e filtra apenas as do torneio selecionado
        const matches = await getAllMatches();

        const filteredMatches = matches.filter(match =>
            match.tournament_name === tournamentName
        );

         // Caso nenhuma partida seja encontrada para o torneio
        if (filteredMatches.length === 0) {
            const msg = `📅 Nenhuma partida encontrada para o torneio ${security.escapeHtml(tournamentName)}.`;
            const options = {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "🔙 Voltar", callback_data: "show_tournaments" }],
                        [{ text: "🏠 Menu Principal", callback_data: "main_menu" }]
                    ]
                }
            };

            return messageId
                ? bot.telegram.editMessageText(chatId, messageId, null, msg, options)
                : bot.telegram.sendMessage(chatId, msg, options);
        }

        // Ordena as partidas por data e horário
        filteredMatches.sort((a, b) => {
            return new Date(a.dt_match) - new Date(b.dt_match) ||
                   (a.dt_time || '00:00:00').localeCompare(b.dt_time || '00:00:00');
        });

        // Agrupa partidas por data formatada
        const matchesByDate = {};
        filteredMatches.forEach(match => {
            const dateFormatted = formatDate(match.dt_match);
            if (!matchesByDate[dateFormatted]) matchesByDate[dateFormatted] = [];
            matchesByDate[dateFormatted].push(match);
        });

        // Monta a mensagem final com estrutura agrupada por data
        let msg = `🔥 Partidas da Furia - ${security.escapeHtml(tournamentName)} 🔥\n\n`;

        for (const [date, dateMatches] of Object.entries(matchesByDate)) {
            msg += `📅 ${date}\n\n`;
            dateMatches.forEach(match => {
                const team = security.escapeHtml(match.team_name || 'Adversário não especificado');
                msg += `🎮 Furia vs ${team}\n`;
                if (match.dt_time) {
                    const [hh, mm] = match.dt_time.split(':');
                    msg += `⏰ ${hh}:${mm}\n`;
                }
                msg += '\n';
            });
        }

        msg += '🔥<i> O topo é o nosso destino! </i> 👑';

        const options = {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🔙 Voltar", callback_data: "show_tournaments" }],
                    [{ text: "🏠 Menu Principal", callback_data: "main_menu" }]
                ]
            }
        };

        // Envia ou edita a mensagem no Telegram
        return messageId
            ? bot.telegram.editMessageText(chatId, messageId, null, msg, options)
            : bot.telegram.sendMessage(chatId, msg, options);

    } catch (error) {
        console.error('Erro ao filtrar por torneio:', error);
        const errMsg = '⚠️ Ocorreu um erro ao filtrar as partidas por torneio.';
        const options = {
            reply_markup: {
                inline_keyboard: [[{ text: "🔙 Voltar", callback_data: "show_tournaments" }]]
            }
        };
        return messageId
            ? bot.telegram.editMessageText(chatId, messageId, null, errMsg, options)
            : bot.telegram.sendMessage(chatId, errMsg, options);
    }
}


// ===========================
// Função: Mostrar todas as partidas da Furia
// ===========================
async function showAllMatches(bot, chatId, messageId = null) {
    try {
        const matches = await getAllMatches();

        if (!matches || matches.length === 0) {
            const msg = "📅 Nenhuma partida agendada no momento. Volte mais tarde!";
            return messageId
                ? bot.telegram.editMessageText(chatId, messageId, null, msg)
                : bot.telegram.sendMessage(chatId, msg);
        }

        // Agrupa partidas por data
        const matchesByDate = {};
        matches.forEach(match => {
            const date = formatDate(match.dt_match);
            if (!matchesByDate[date]) matchesByDate[date] = [];
            matchesByDate[date].push(match);
        });

        let message = "🔥 Todas as Partidas da Furia 🔥\n\n";

         // Organiza por data e por torneio
        for (const [date, dateMatches] of Object.entries(matchesByDate)) {
            message += `📅 ${date}\n\n`;

            const matchesByTournament = {};
            dateMatches.forEach(match => {
                const tournament = security.escapeHtml(match.tournament_name || 'Outros Torneios');
                if (!matchesByTournament[tournament]) matchesByTournament[tournament] = [];
                matchesByTournament[tournament].push(match);
            });

            // Ordena os nomes dos torneios alfabeticamente
            const sortedTournaments = Object.keys(matchesByTournament).sort();
            for (const tournament of sortedTournaments) {
                message += `🏆 ${tournament}\n`;
                matchesByTournament[tournament].forEach(match => {
                    const team = security.escapeHtml(match.team_name || 'Adversário não especificado');
                    message += `🎮 Furia vs ${team}\n`;
                    if (match.dt_time) message += `⏰ ${match.dt_time}\n`;
                    message += '\n';
                });
            }
            message += '🔥<i> Bora pra cima, Furia!</i> 🔥';
        }

        const options = {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🔙 Voltar", callback_data: "show_match_filters" }],
                    [{ text: "🏠 Menu Principal", callback_data: "main_menu" }]
                ]
            },
            parse_mode: 'HTML'
        };

         // Envia ou edita a mensagem no Telegram
        return messageId
            ? bot.telegram.editMessageText(chatId, messageId, null, message, options)
            : bot.telegram.sendMessage(chatId, message, options);

    } catch (error) {
        console.error("Erro ao mostrar partidas:", error);
        const msg = "⚠️ Ocorreu um erro ao carregar as partidas. Tente novamente mais tarde.";
        return messageId
            ? bot.telegram.editMessageText(chatId, messageId, null, msg)
            : bot.telegram.sendMessage(chatId, msg);
    }
}

module.exports = {
    filterByTournament,
    showAllMatches
};
