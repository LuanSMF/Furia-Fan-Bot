const { getAllMatches } = require('../../banco/database');
const { handleAgenda } = require('../../comandos/agenda');
const { filterByTournament } = require('../auxiliar');
const security = require('../../admin/security');
const { formatDate, formatTime } = require('../../utils/utils');

// ===========================
// Manipulador de botões de filtro de partidas
// ===========================
module.exports = async (bot, chatId, messageId, userId, isAdmin, data, callbackQuery, simulatedMsg) => {
    try {
        // Filtro: Nenhum filtro (mostrar tudo)
        if (data === 'filter_none') {
            simulatedMsg.text = '/agenda';
            await handleAgenda(bot, simulatedMsg);
            return true;
        }
        // Filtro: Somente partidas ao vivo
        else if (data === 'filter_live') {
            simulatedMsg.text = '/filter live';
            await handleAgenda(bot, simulatedMsg);
            return true;
        }
        // Filtro: Por torneio
        else if (data.startsWith('filter_tournament_')) {
            const rawId = data.replace('filter_tournament_', '');
            const tournamentId = security.validateId(rawId);
            if (!tournamentId) {
                throw new Error('ID de torneio inválido');
            }

            const result = await filterByTournament(bot, chatId, tournamentId, messageId);
            return result !== false;
        }
        // Filtro: Por data
        else if (data.startsWith('filter_date_')) {
            const dateFilter = data.replace('filter_date_', '');

             // Obtém todas as partidas
            const matches = await getAllMatches();
            let filteredMatches = [];
            let filterTitle = "";

             // Define o dia atual
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // Filtro: Hoje
            if (dateFilter === 'today') {
                const tomorrow = new Date(today);
                tomorrow.setDate(tomorrow.getDate() + 1);

                filteredMatches = matches.filter(match => {
                    if (!match.dt_match) return false;
                    const matchDate = new Date(match.dt_match);
                    return matchDate >= today && matchDate < tomorrow;
                });
                filterTitle = "Hoje";
            }

            // Filtro: Amanhã
            else if (dateFilter === 'tomorrow') {
                const tomorrow = new Date(today);
                tomorrow.setDate(tomorrow.getDate() + 1);
                const dayAfterTomorrow = new Date(tomorrow);
                dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);

                filteredMatches = matches.filter(match => {
                    if (!match.dt_match) return false;
                    const matchDate = new Date(match.dt_match);
                    return matchDate >= tomorrow && matchDate < dayAfterTomorrow;
                });
                filterTitle = "Amanhã";
            }

            // Filtro: Data exata no formato YYYY-MM-DD
            else {
                const validDate = /^\d{4}-\d{2}-\d{2}$/.test(dateFilter) ? new Date(dateFilter) : null;
                if (!validDate || isNaN(validDate.getTime())) {
                    throw new Error('Data inválida');
                }

                filteredMatches = matches.filter(match => {
                    if (!match.dt_match) return false;
                    const matchDate = new Date(match.dt_match);
                    return matchDate.toISOString().split('T')[0] === dateFilter;
                });

                filterTitle = validDate.toLocaleDateString('pt-BR', {
                    weekday: 'long',
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric'
                });
            }

            // Nenhuma partida encontrada para a data
            if (filteredMatches.length === 0) {
                const message = `📅 Nenhuma partida encontrada para ${filterTitle.toLowerCase()}.`;
                const options = {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: "🔙 Voltar", callback_data: "show_match_filters" }],
                            [{ text: "🏠 Menu Principal", callback_data: "main_menu" }]
                        ]
                    }
                };

                await bot.telegram.editMessageText(chatId, messageId, null, message, options);
                return true;
            }
            // Ordena as partidas pelo horário
            filteredMatches.sort((a, b) => {
                const timeA = a.dt_time || "00:00:00";
                const timeB = b.dt_time || "00:00:00";
                return timeA.localeCompare(timeB);
            });

            // Determina o rótulo da data formatada
            const dataFormatada = (dateFilter !== 'today' && dateFilter !== 'tomorrow')
                ? formatDate(dateFilter)
                : filterTitle;

                // Monta a mensagem de retorno com as partidas filtradas
            let message = `🔥 Partidas da Furia 🔥\n\n📅 ${dataFormatada}\n\n`;

            filteredMatches.forEach((match) => {
                const tournament = security.escapeHtml(match.tournament_name || 'Torneio não especificado');
                const team = security.escapeHtml(match.team_name || 'Adversário não especificado');
                const time = security.escapeHtml(match.dt_time || 'Horário não especificado');

                message += `🏆 ${tournament}\n`;
                message += `🎮 Furia vs ${team}\n`;
                message += `⏰ ${time}\n\n\n`;
            });

            message += `🔥 <i>Vamos com tudo, FURIA!</i> 👊`;

            const options = {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "🔙 Voltar", callback_data: "show_match_filters" }],
                        [{ text: "🏠 Menu Principal", callback_data: "main_menu" }]
                    ]
                }
            };

            await bot.telegram.editMessageText(chatId, messageId, null, message, options);
            return true;
        }
        // Fallback: nenhum filtro correspondente
        return false;
    } catch (error) {
        console.error('Erro em botao_filtros:', error);

         // Tenta editar a mensagem atual com erro
        try {
            await bot.telegram.editMessageText(chatId, messageId, null, "⚠️ Ocorreu um erro ao processar o filtro", {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "🔙 Voltar", callback_data: "show_match_filters" }]
                    ]
                }
            });
        } catch (editError) {
             // Se não puder editar, envia uma nova
            await bot.telegram.sendMessage(chatId, "⚠️ Ocorreu um erro ao processar o filtro");
        }
        return true;
    }
};
