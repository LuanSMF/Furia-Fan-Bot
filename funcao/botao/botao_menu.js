const {
    showMainMenu,
    showMatchFiltersMenu,
    showTournamentsMenu,
    showDatesMenu
} = require('../menu');

const { showAllMatches } = require('../auxiliar');
const security = require('../../admin/security');
const { mostrarDetalhesPartida, mostrarPartidasPassadas } = require('../../comandos/partidas');
const { mostrarPainelAoVivoAdmin, tratarCallbackAoVivo } = require('./botao_momento');
const { mostrarAoVivo } = require('../../comandos/partidas');

// Função segura para deletar mensagens
function safeDelete(bot, chatId, messageId) {
    return bot.telegram.deleteMessage(chatId, messageId).catch(err => {
        if (err?.response?.body?.description?.includes('message to delete not found')) {
            console.warn(`⚠️ Mensagem já apagada ou não encontrada: ${messageId}`);
        } else {
            console.error('❌ Erro ao deletar mensagem:', err.message);
        }
    });
}

// Função principal de tratamento de callbacks deste módulo
async function handleMenuCallbacks(bot, chatId, messageId, userId, isAdmin, data, callbackQuery) {
    try {
         // Botão: Voltar ao menu principal
        if (data === 'main_menu') {
            await safeDelete(bot, chatId, messageId);
            const safeName = security.escapeHtml(callbackQuery.from.first_name || '');
            await showMainMenu(bot, chatId, safeName, userId);
            return true;
        }

         // Botão: Acessar filtros de partidas
        if (data === 'show_matches' || data === 'show_match_filters') {
            await safeDelete(bot, chatId, messageId);
            await showMatchFiltersMenu(bot, chatId);
            return true;
        }

         // Botão: Ver todas as partidas
        if (data === 'show_all_matches') {
            await safeDelete(bot, chatId, messageId);
            await showAllMatches(bot, chatId);
            return true;
        }

         // Botão: Ver torneios
        if (data === 'show_tournaments') {
            await safeDelete(bot, chatId, messageId);
            await showTournamentsMenu(bot, chatId);
            return true;
        }

        // Botão: Ver por datas disponíveis
        if (data === 'show_dates') {
            await safeDelete(bot, chatId, messageId);
            await showDatesMenu(bot, chatId);
            return true;
        }

         // Botão: Curiosidades da FURIA
        if (data === 'show_facts') {
            await bot.telegram.sendMessage(
                chatId,
                '🧠 3 Curiosidades da Furia:\n\n' +
                '1️⃣ Primeiro time BR a usar camisas sociais em todos os jogos\n' +
                '2️⃣ Criadores do estilo "Furia Aggression"\n' +
                '3️⃣ KSCERATO eleito melhor player das Américas em 2022'
            );
            return true;
        }

        // Nenhuma ação tratada
        return false;
    } catch (error) {
        console.error('Erro no botao_menu:', error);
        return false;
    }
}

// Função principal de callbacks
module.exports = handleMenuCallbacks;
// Exporta safeDelete separadamente para uso em outros módulos
module.exports.safeDelete = safeDelete; 
