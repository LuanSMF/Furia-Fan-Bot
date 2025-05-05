const auth = require('../admin/auth');
const security = require('../admin/security');
const { showAllMatches } = require('../funcao/auxiliar');
const {
  pool,
  getTournamentsFromDB,
  getTeamsByTournamentFromDB,
  findOrCreateMultivalorado,
  insertMatch
} = require('../banco/database');

// Busca partidas do banco
async function loadMatches() {
  try {
    const [matches] = await pool.query(`
      SELECT 
          m.id_matches,
          t_tournaments.nm_name AS tournament_name,
          t_teams.nm_name AS team_name,
          m.dt_match,
          m.dt_time,
          m.nm_resultf AS result_furia,
          m.nm_resultop AS result_opponent
      FROM tb_matches m
      JOIN tb_multivalorado mv ON m.id_multivalorado = mv.id_multivalorado
      JOIN tb_tournaments t_tournaments ON mv.id_tournaments = t_tournaments.id_tournaments
      JOIN tb_teams t_teams ON mv.id_teams = t_teams.id_teams
      ORDER BY m.dt_match, m.dt_time
    `);
    return matches;
  } catch (error) {
    console.error("Erro ao carregar partidas:", error);
    throw error;
  }
}

// Formata data e hora no padrão brasileiro (ex: 04/05/2025 às 18:00)
function formatMatchDate(dateString, timeString = null) {
  if (!dateString) return 'Data não definida';

  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Data inválida';

    const formattedDate = date.toLocaleDateString('pt-BR');

    if (timeString) {
      const time = new Date(`1970-01-01T${timeString}`);
      if (!isNaN(time.getTime())) {
        const formattedTime = time.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        return `${formattedDate} às ${formattedTime}`;
      }
    }

    return formattedDate;
  } catch (e) {
    console.error('Erro ao formatar data:', e);
    return 'Data inválida';
  }
}

// Retorna todas as datas (DISTINCT) de partidas futuras para filtros
async function loadFutureMatchesDates() {
  try {
    const [rows] = await pool.query(`
      SELECT DISTINCT DATE(dt_match) as match_date
      FROM tb_matches
      WHERE TIMESTAMP(dt_match, dt_time) >= NOW()
      ORDER BY dt_match ASC
    `);
    return rows.map(row => row.match_date);
  } catch (error) {
    console.error("Erro ao carregar datas futuras:", error);
    throw error;
  }
}

// Inicia o processo de adição de uma nova partida (apenas para admins)
async function handleAddMatch(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const isAdmin = auth.authenticateWithUserId(userId);

  if (!isAdmin) {
    return bot.telegram.sendMessage(chatId, '❌ Acesso restrito a administradores.');
  }

  try {
    bot.context.userStates[userId] = { step: 'select_tournament' };

    const tournaments = await getTournamentsFromDB();
    const inlineKeyboard = tournaments.map(t => [{
      text: security.escapeHtml(t.nm_name),
      callback_data: `tournament_${t.id_tournaments}`
    }]);

    return bot.telegram.sendMessage(chatId, '🏆 Escolha o torneio:', {
      reply_markup: { inline_keyboard: inlineKeyboard }
    });

  } catch (error) {
    console.error('Erro ao iniciar adição de partida:', error);
    return bot.telegram.sendMessage(chatId, '❌ Ocorreu um erro ao iniciar o processo.');
  }
}

// Mostra os times do torneio selecionado para que o admin escolha o adversário
async function processTeamSelection(bot, callbackQuery, rawTournamentId) {
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;
  const userId = callbackQuery.from.id;

  const tournamentId = security.validateId(rawTournamentId);
  if (!tournamentId) {
    return bot.telegram.sendMessage(chatId, '❌ Torneio inválido.');
  }

  try {
    bot.context.userStates[userId] = { step: 'select_team', tournamentId };

    const teams = await getTeamsByTournamentFromDB(tournamentId);
    if (teams.length === 0) {
      await bot.telegram.answerCbQuery(callbackQuery.id, { text: "Nenhum time encontrado para este torneio" });
      return bot.telegram.sendMessage(chatId, '❌ Nenhum time encontrado para este torneio.');
    }

    const inlineKeyboard = teams.map(t => [{
      text: security.escapeHtml(t.nm_name),
      callback_data: `team_${t.id_teams}`
    }]);

    return bot.telegram.editMessageText(chatId, messageId, null, '👥 Escolha o time adversário:', {
      reply_markup: { inline_keyboard: inlineKeyboard }
    });

  } catch (error) {
    console.error('Erro ao selecionar time:', error);
    await bot.telegram.answerCbQuery(callbackQuery.id, { text: "Erro ao selecionar time" });
    return bot.telegram.sendMessage(chatId, '❌ Ocorreu um erro ao selecionar o time.');
  }
}

// Após time e torneio definidos, agenda a partida com data e hora informados
async function processDateTime(bot, msg, state) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text.trim();

  try {
    const [datePart, timePart] = text.split(' ');

    if (!datePart || !timePart) {
      return bot.telegram.sendMessage(chatId, "⚠️ Formato inválido. Use DD/MM/AAAA HH:MM.");
    }

    const validDate = security.validateDate(datePart);
    const validTime = security.validateTime(timePart);
    if (!validDate || !validTime) {
      return bot.telegram.sendMessage(chatId, "⚠️ Data ou hora inválida. Use DD/MM/AAAA HH:MM.");
    }

    const now = new Date();
    if (validDate.getTime() < now.setHours(0, 0, 0, 0)) {
      return bot.telegram.sendMessage(chatId, '⚠️ Não é permitido agendar partidas no passado.');
    }

    const year = validDate.getFullYear();
    const month = String(validDate.getMonth() + 1).padStart(2, '0');
    const day = String(validDate.getDate()).padStart(2, '0');
    const dt_match = `${year}-${month}-${day}`;
    const dt_time = `${validTime}:00`;

    const teamId = security.validateId(state.teamId);
    const tournamentId = security.validateId(state.tournamentId);

    if (!teamId || !tournamentId) {
      return bot.telegram.sendMessage(chatId, '❌ Time ou torneio inválido.');
    }

    const id_multivalorado = await findOrCreateMultivalorado(teamId, tournamentId);
    await insertMatch(id_multivalorado, dt_match, dt_time);

    delete bot.context.userStates[userId];
    return bot.telegram.sendMessage(chatId, '✅ Partida adicionada com sucesso!');

  } catch (error) {
    console.error('Erro ao adicionar partida:', error);
    return bot.telegram.sendMessage(chatId, '❌ Ocorreu um erro ao adicionar a partida.');
  }
}



async function handleAgenda(bot, msg) {
  const chatId = msg.chat.id;
  const text = msg.text || '';
  const userId = msg.from.id;
  const isAdmin = auth.authenticateWithUserId(userId);

  return showAllMatches(bot, chatId, loadMatches);
}

module.exports = {
  handleAgenda,
  handleAddMatch,
  loadMatches: loadFutureMatchesDates,
  formatMatchDate,
  showAllMatches,
  processTeamSelection,
  processDateTime,
  loadFutureMatchesDates
};
