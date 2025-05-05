const {
    showAdminPanel,
    showAdminAgendaMenu,
    showManageMatchesMenu,
    showManageTournamentsMenu,
    showManageTeamsMenu
} = require('../menu');

const {
    pool,
    getTournamentsFromDB
} = require('../../banco/database');

const { mostrarPainelAoVivoAdmin, tratarCallbackAoVivo } = require('./botao_momento');
const { safeDelete } = require('../botao/botao_menu');

module.exports = async (bot, chatId, messageId, userId, isAdmin, data, callbackQuery) => {
    // ==================================
    // Opção: Painel Principal do Admin
    // ==================================
    if (data === 'admin_panel') {
        if (!isAdmin) {
            // Bloqueia acesso a quem não é admin
            await bot.telegram.answerCbQuery(callbackQuery.id, {
                text: "❌ Acesso restrito a administradores"
            }).catch(console.error);
            return true;
        }

        // Remove mensagem antiga e mostra o painel
        await safeDelete(bot, chatId, messageId);
        showAdminPanel(bot, chatId);
        return true;
    }

    // ==================================
    // Opção: Menu de Gerenciamento de Agenda
    // ==================================
    else if (data === 'admin_agenda') {
        if (!isAdmin) {
            await bot.telegram.answerCbQuery(callbackQuery.id, {
                text: "❌ Acesso restrito a administradores"
            }).catch(console.error);
            return true;
        }

        await safeDelete(bot, chatId, messageId);
        showAdminAgendaMenu(bot, chatId);
        return true;
    }

    // ==================================
    // Opção: Gerenciar Partidas
    // ==================================
    else if (data === 'manage_matches') {
        if (!isAdmin) {
            await bot.telegram.answerCbQuery(callbackQuery.id, {
                text: "❌ Acesso restrito a administradores"
            }).catch(console.error);
            return true;
        }

        await safeDelete(bot, chatId, messageId);
        await showManageMatchesMenu(bot, chatId);
        return true;
    }

    // ==================================
    // Opção: Gerenciar Torneios
    // ==================================
    else if (data === 'manage_tournaments') {
        if (!isAdmin) {
            await bot.telegram.answerCbQuery(callbackQuery.id, {
                text: "❌ Acesso restrito a administradores"
            }).catch(console.error);
            return true;
        }

        await safeDelete(bot, chatId, messageId);
        showManageTournamentsMenu(bot, chatId);
        return true;
    }

    // ==================================
    // Opção: Gerenciar Times
    // ==================================
    else if (data === 'manage_teams') {
        if (!isAdmin) {
            await bot.telegram.answerCbQuery(callbackQuery.id, {
                text: "❌ Acesso restrito a administradores"
            }).catch(console.error);
            return true;
        }

        await safeDelete(bot, chatId, messageId);
        showManageTeamsMenu(bot, chatId);
        return true;
    }

    // Nenhum botão tratado aqui
    return false;
};
