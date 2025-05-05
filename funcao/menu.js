const auth = require('../admin/auth');
const { getTournamentsFromDB, getAllMatches, pool } = require('../banco/database');
const { chunkArray } = require('../utils/utils');
const security = require('../admin/security');

/**
 * Exibe o menu principal do bot com opções personalizadas baseadas no usuário
 */
async function showMainMenu(bot, chatId, firstName = '', userId = null) {
// Validação de segurança do ID do usuário
  const safeUserId = security.validateId(userId);
  const isAdmin = auth.authenticateWithUserId(safeUserId);

  const inline_keyboard = [];
  console.log('🔍 global.partidaAoVivo:', global.partidaAoVivo);

  // Verifica se há partida AO VIVO
  const espectadores = bot.context?.spectators || new Set();
  const userNaSessao = espectadores.has(safeUserId);

  // Se houver partida AO VIVO, mostra opção específica
  if (global.partidaAoVivo && global.matchAoVivoId) {
    if (userNaSessao) {
      inline_keyboard.push([{ text: '❌ Sair da Sessão AO VIVO', callback_data: 'sair_sessao' }]);
    } else {
      inline_keyboard.push([{ text: '📺 AO VIVO', callback_data: 'ao_vivo_ver' }]);
    }
  }

  // Menus principais para qualquer usuário
  inline_keyboard.push(
    [{ text: "🎮 Próximos Jogos", callback_data: "show_matches" }],
    [{ text: '📊 Partidas', callback_data: 'show_past_matches' }],
    [{ text: "🧠 Curiosidades", callback_data: "show_facts" }],
    [{ text: "🛍️ Visitar Loja", url: "https://www.furia.gg/produtos" }]
  );

  // Painel administrativo (somente se admin)
  if (isAdmin) {
    inline_keyboard.push([{ text: "🔐 Painel Admin", callback_data: "admin_panel" }]);
  }
 // Personalização com nome do usuário
  let nomeUsuario = 'Furioso';

  try {
    const [rows] = await pool.query(
      'SELECT nm_usuario FROM tb_usuario WHERE id_usuario = ?',
      [safeUserId]
    );

    if (rows.length > 0 && typeof rows[0].nm_usuario === 'string') {
      nomeUsuario = rows[0].nm_usuario.trim();
    } else if (firstName && typeof firstName === 'string') {
      nomeUsuario = firstName.trim();
    }
  } catch (err) {
    console.warn(`⚠️ Falha ao buscar nome do usuário ${safeUserId}:`, err.message);
  }

  // Formatação segura do nome
  const nomeParcial = nomeUsuario.trim().split(/\s+/).slice(0, 2).join(' ');
  const safeName = security.escapeHtml(nomeParcial || 'Furioso');
  const welcomeMessage = ` Salve, ${safeName}! 👊🔥\n\n🔥 O que você quer ver hoje Furioso?`;

  await bot.telegram.sendMessage(chatId, welcomeMessage, {
    reply_markup: { inline_keyboard },
    parse_mode: 'HTML'
  });

  return true;
}

//Mostra menu de filtros para partidas
function showMatchFiltersMenu(bot, chatId) {
    const menuOptions = {
        reply_markup: {
            inline_keyboard: [
                [{ text: '🎯 Sem Filtro', callback_data: 'show_all_matches' }],
                [{ text: "🏆 Filtrar por Torneio", callback_data: "show_tournaments" }],
                [{ text: "📅 Filtrar por Data", callback_data: "show_dates" }],
                [{ text: "🔙 Voltar ao Menu", callback_data: "main_menu" }]
            ]
        }
    };

    bot.telegram.sendMessage(chatId, "Escolha como deseja filtrar as partidas:", menuOptions).catch(console.error);
}

//Mostra lista de torneios para filtro
async function showTournamentsMenu(bot, chatId) {
    try {
        const tournaments = await getTournamentsFromDB();
        const tournamentButtons = tournaments.map(tournament => ({
            text: security.escapeHtml(tournament.nm_name),
            callback_data: `filter_tournament_${tournament.id_tournaments}`
        }));

        const chunkedButtons = chunkArray(tournamentButtons, 2);
        chunkedButtons.push([{ text: "🔙 Voltar", callback_data: "show_match_filters" }]);

        await bot.telegram.sendMessage(chatId, "Escolha um torneio:", {
            reply_markup: { inline_keyboard: chunkedButtons }
        });
    } catch (error) {
        console.error("Erro ao mostrar torneios:", error);
        await bot.telegram.sendMessage(chatId, "⚠️ Não foi possível carregar os torneios.");
    }
}

// Mostra menu de datas para filtro de partidas
async function showDatesMenu(bot, chatId) {
    try {
        const matches = await getAllMatches();

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Filtra e formata datas futuras
        const futureDates = matches
            .filter(match => {
                if (!match.dt_match) return false;
                const matchDate = new Date(match.dt_match);
                return !isNaN(matchDate) && matchDate >= today;
            })
            .map(match => {
                const date = new Date(match.dt_match);
                return date.toISOString().split('T')[0]; // YYYY-MM-DD
            })
            .filter((date, index, self) => self.indexOf(date) === index)
            .sort();

        const dateOptions = [
            { text: "⏳ Hoje", callback_data: "filter_date_today" },
            { text: "⏳ Amanhã", callback_data: "filter_date_tomorrow" }
        ];

        // Adiciona datas específicas
        futureDates.forEach(dateStr => {
            const [yyyy, mm, dd] = dateStr.split('-');
            const formatted = `${dd}/${mm}/${yyyy}`;

            dateOptions.push({
                text: `📅 ${formatted}`,
                callback_data: `filter_date_${security.escapeHtml(dateStr)}`
            });
        });

        const chunkedButtons = chunkArray(dateOptions, 2);
        chunkedButtons.push([{ text: "🔙 Voltar", callback_data: "show_match_filters" }]);

        await bot.telegram.sendMessage(chatId, "📅 Escolha uma data:", {
            reply_markup: { inline_keyboard: chunkedButtons }
        });

    } catch (error) {
        console.error("Erro ao mostrar datas:", error);
        await bot.telegram.sendMessage(chatId, "⚠️ Não foi possível carregar as datas.");
    }
}

//Mostra menu principal de administração

function showAdminPanel(bot, chatId) {
    const menuOptions = {
        reply_markup: {
            inline_keyboard: [
                [{ text: "📅 Administrar Agenda", callback_data: "admin_agenda" }],
                [{ text: '📺 Administrar AO VIVO', callback_data: 'ao_vivo_painel' }],
                [{ text: "🔙 Voltar ao Menu", callback_data: "main_menu" }]
            ]
        }
    };

    bot.telegram.sendMessage(chatId, "🔧 Painel de Administração:", menuOptions).catch(console.error);
}

// Mostra submenu de administração de agenda
async function showAdminAgendaMenu(bot, chatId) {
    try {
        const tournaments = await getTournamentsFromDB();
        const [teams] = await pool.query('SELECT id_teams FROM tb_teams WHERE nm_name != "FURIA"');

        const hasTournaments = tournaments.length > 0;
        const hasTeams = teams.length > 0;

        const inline_keyboard = [];

        if (hasTournaments && hasTeams) {
            inline_keyboard.push([{ text: "🎮 Administrar Partidas", callback_data: "manage_matches" }]);
        }

        inline_keyboard.push([{ text: "🏆 Administrar Competições", callback_data: "manage_tournaments" }]);

        if (hasTournaments) {
            inline_keyboard.push([{ text: "👥 Administrar Times", callback_data: "manage_teams" }]);
        }

        inline_keyboard.push([{ text: "🔙 Voltar ao Painel Admin", callback_data: "admin_panel" }]);

        await bot.telegram.sendMessage(chatId, "🔧 Administrar Agenda:", {
            reply_markup: { inline_keyboard }
        });

    } catch (error) {
        console.error('❌ Erro ao montar menu de agenda:', error);
        await bot.telegram.sendMessage(chatId, '❌ Não foi possível montar o menu de administração da agenda.');
    }
}

// menu de controle das  partidas
async function showManageMatchesMenu(bot, chatId) {
    try {
        const matches = await getAllMatches();

        const inline_keyboard = [
            [{ text: "➕ Adicionar Partida", callback_data: "add_match" }]
        ];

        if (matches.length > 0) {
            inline_keyboard.push([{ text: "🔄 Atualizar Partida", callback_data: "update_match" }]);
            inline_keyboard.push([{ text: "➖ Remover Partida", callback_data: "remove_match" }]);
        }

        inline_keyboard.push([{ text: "🔙 Voltar", callback_data: "admin_agenda" }]);

        await bot.telegram.sendMessage(chatId, "🎮 Gerenciar Partidas:", {
            reply_markup: { inline_keyboard }
        });

    } catch (error) {
        console.error("Erro ao carregar partidas:", error);
        await bot.telegram.sendMessage(chatId, "❌ Erro ao carregar partidas.");
    }
}

// menu de controle das  competições
async function showManageTournamentsMenu(bot, chatId) {
    try {
        const tournaments = await getTournamentsFromDB();

        const inline_keyboard = [
            [{ text: "🏅 Adicionar Competição", callback_data: "add_tournament" }]
        ];

        if (tournaments.length > 0) {
            inline_keyboard.push([{ text: "🔄 Atualizar Competição", callback_data: "update_tournament" }]);
            inline_keyboard.push([{ text: "🗑️ Remover Competição", callback_data: "remove_tournament" }]);
        }

        inline_keyboard.push([{ text: "🔙 Voltar", callback_data: "admin_agenda" }]);

        await bot.telegram.sendMessage(chatId, "🏆 Gerenciar Competições:", {
            reply_markup: { inline_keyboard }
        });

    } catch (error) {
        console.error("❌ Erro ao carregar competições:", error);
        await bot.telegram.sendMessage(chatId, "❌ Não foi possível carregar as competições.");
    }
}

// menu de controle dos times
async function showManageTeamsMenu(bot, chatId) {
    try {
        const [teams] = await pool.query('SELECT id_teams FROM tb_teams WHERE nm_name != "FURIA"');

        const inline_keyboard = [
            [{ text: "➕ Adicionar Time", callback_data: "add_team" }]
        ];

        if (teams.length > 0) {
            inline_keyboard.push([{ text: "🔄 Atualizar Time", callback_data: "update_team" }]);
            inline_keyboard.push([{ text: "❌ Remover Time", callback_data: "remove_team" }]);
        }

        inline_keyboard.push([{ text: "🔙 Voltar", callback_data: "admin_agenda" }]);

        await bot.telegram.sendMessage(chatId, "👥 Gerenciar Times:", {
            reply_markup: { inline_keyboard }
        });

    } catch (error) {
        console.error("❌ Erro ao carregar times:", error);
        await bot.telegram.sendMessage(chatId, "❌ Não foi possível carregar os times.");
    }
}

module.exports = {
    showMainMenu,
    showMatchFiltersMenu,
    showTournamentsMenu,
    showDatesMenu,
    showAdminPanel,
    showAdminAgendaMenu,
    showManageMatchesMenu,
    showManageTournamentsMenu,
    showManageTeamsMenu
};
