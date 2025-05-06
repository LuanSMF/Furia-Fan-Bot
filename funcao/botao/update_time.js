const { pool, getTournamentsFromDB } = require('../../banco/database');
const security = require('../../admin/security');

module.exports = async function handleUpdateTime(bot, chatId, messageId, userId, data, callbackQuery) {
   // === CASO 1: Seleção de time para atualização ===
  if (data.startsWith('select_team_update_')) {
    const teamId = security.validateId(data.replace('select_team_update_', ''));
    if (!teamId) {
      await bot.telegram.answerCbQuery(callbackQuery.id, { text: "❌ ID inválido" });
      return true;
    }

    // Armazena temporariamente o ID do time no contexto do usuário
    bot.context.userStates[userId] = { teamId };

    try {
      // Verifica se o time está vinculado a algum torneio
      const [linkedTournaments] = await pool.query(
        'SELECT 1 FROM tb_multivalorado WHERE id_teams = ?',
        [teamId]
      );

      const hasTournaments = linkedTournaments.length > 0;

       // Cria o menu de opções para o time
      const inline_keyboard = [
        [{ text: '✏️ Alterar Nome', callback_data: `edit_team_name_${teamId}` }],
        [{ text: '➕ Adicionar Campeonato', callback_data: `add_team_tournament_${teamId}` }]
      ];

      // Só mostra a opção de remover campeonato se houver vínculo
      if (hasTournaments) {
        inline_keyboard[1].push({ text: '➖ Remover Campeonato', callback_data: `remove_team_tournament_${teamId}` });
      }

      inline_keyboard.push([{ text: "🔙 Voltar", callback_data: "update_team" }]);

      // Exibe as opções ao admin
      await bot.telegram.editMessageText(chatId, messageId, null, 'O que você deseja atualizar nesse time?', {
        reply_markup: { inline_keyboard }
      });

      return true;
    } catch (err) {
      console.error('Erro ao verificar vinculações:', err);
      await bot.telegram.sendMessage(chatId, '❌ Erro ao carregar opções do time.');
      return true;
    }
  }

  // === CASO 2: Alterar o nome do time ===
  else if (data.startsWith('edit_team_name_')) {
    const teamId = security.validateId(data.replace('edit_team_name_', ''));
    if (!teamId) {
      await bot.telegram.answerCbQuery(callbackQuery.id, { text: "❌ ID inválido" });
      return true;
    }

     // Define o próximo passo da atualização
    bot.context.userStates[userId] = {
      step: 'updating_team_name',
      teamId
    };

    // Solicita o novo nome do time
    await bot.telegram.editMessageText(chatId, messageId, null, '✏️ Digite o NOVO nome para este time:', {
      reply_markup: { inline_keyboard: [[{ text: "❌ Cancelar", callback_data: "update_team" }]] }
    });
    return true;
  }

  // === CASO 3: Adicionar um torneio ao time ===
  else if (data.startsWith('add_team_tournament_')) {
    const teamId = security.validateId(data.replace('add_team_tournament_', ''));
    if (!teamId) {
      await bot.telegram.answerCbQuery(callbackQuery.id, { text: "❌ ID inválido" });
      return true;
    }

    // Busca os torneios já vinculados ao time
    try {
      const [alreadyLinked] = await pool.query(
        'SELECT id_tournaments FROM tb_multivalorado WHERE id_teams = ?', [teamId]
      );
      const linkedIds = alreadyLinked.map(row => row.id_tournaments);

      // Busca todos os torneios cadastrados
      const allTournaments = await getTournamentsFromDB();

      // Filtra os que ainda não estão vinculados ao time
      const available = allTournaments.filter(t => !linkedIds.includes(t.id_tournaments));

      if (available.length === 0) {
        await bot.telegram.sendMessage(chatId, '✅ Este time já está inscrito em todos os campeonatos.');
        return true;
      }

      // Cria os botões para adicionar torneios
      const buttons = available.map(tournament => [{
        text: `➕ ${security.escapeHtml(tournament.nm_name)}`,
        callback_data: `confirm_add_tournament_${teamId}_${tournament.id_tournaments}`
      }]);

      buttons.push([{ text: "🔙 Voltar", callback_data: "update_team" }]);

      await bot.telegram.sendMessage(chatId, 'Escolha o campeonato para adicionar ao time:', {
        reply_markup: { inline_keyboard: buttons }
      });
      return true;

    } catch (err) {
      console.error('Erro ao listar campeonatos disponíveis:', err);
      await bot.telegram.sendMessage(chatId, '❌ Erro ao carregar campeonatos.');
      return true;
    }
  }

  // === CASO 4: Remover torneio vinculado ao time ===
  else if (data.startsWith('remove_team_tournament_')) {
    const teamId = security.validateId(data.replace('remove_team_tournament_', ''));
    if (!teamId) {
      await bot.telegram.answerCbQuery(callbackQuery.id, { text: "❌ ID inválido" });
      return true;
    }

    try {
      // Busca os torneios vinculados ao time
      const [rows] = await pool.query(`
        SELECT mv.id_tournaments, t.nm_name
        FROM tb_multivalorado mv
        JOIN tb_tournaments t ON mv.id_tournaments = t.id_tournaments
        WHERE mv.id_teams = ?
      `, [teamId]);

      if (rows.length === 0) {
        await bot.telegram.sendMessage(chatId, '❌ Este time não está vinculado a nenhum campeonato.');
        return true;
      }

      // Cria botões para remover cada campeonato
      const buttons = rows.map(row => [{
        text: `🗑️ ${security.escapeHtml(row.nm_name)}`,
        callback_data: `confirm_remove_tournament_${teamId}_${row.id_tournaments}`
      }]);

      buttons.push([{ text: "🔙 Voltar", callback_data: "update_team" }]);

      await bot.telegram.sendMessage(chatId, 'Escolha o campeonato para remover do time:', {
        reply_markup: { inline_keyboard: buttons }
      });
      return true;

    } catch (err) {
      console.error('Erro ao carregar campeonatos vinculados:', err);
      await bot.telegram.sendMessage(chatId, '❌ Erro ao buscar campeonatos vinculados.');
      return true;
    }
  }

  // === CASO 5: Confirma a adição de um campeonato ===
  else if (data.startsWith('confirm_add_tournament_')) {
    const [ , teamIdStr, tournamentIdStr ] = data.split('_').slice(-3);
    const teamId = security.validateId(teamIdStr);
    const tournamentId = security.validateId(tournamentIdStr);

    if (!teamId || !tournamentId) {
      await bot.telegram.answerCbQuery(callbackQuery.id, { text: "❌ IDs inválidos" });
      return true;
    }

    try {
      // Verifica se o vínculo já existe
      const [check] = await pool.query(
        'SELECT 1 FROM tb_multivalorado WHERE id_teams = ? AND id_tournaments = ?',
        [teamId, tournamentId]
      );
      if (check.length > 0) {
        await bot.telegram.answerCbQuery(callbackQuery.id, { text: "✅ Já está inscrito" });
        return true;
      }

       // Insere vínculo no banco
      await pool.query(
        'INSERT INTO tb_multivalorado (id_teams, id_tournaments) VALUES (?, ?)',
        [teamId, tournamentId]
      );

      await bot.telegram.answerCbQuery(callbackQuery.id, { text: "✅ Campeonato adicionado" });
      await bot.telegram.sendMessage(chatId, '✅ Campeonato adicionado com sucesso!');
      return true;

    } catch (error) {
      console.error('Erro ao adicionar campeonato:', error);
      await bot.telegram.sendMessage(chatId, '❌ Erro ao adicionar campeonato.');
      return true;
    }
  }

   // === CASO 6: Confirma a remoção de um campeonato ===
  else if (data.startsWith('confirm_remove_tournament_')) {
    const [ , teamIdStr, tournamentIdStr ] = data.split('_').slice(-3);
    const teamId = security.validateId(teamIdStr);
    const tournamentId = security.validateId(tournamentIdStr);

    if (!teamId || !tournamentId) {
      await bot.telegram.answerCbQuery(callbackQuery.id, { text: "❌ IDs inválidos" });
      return true;
    }

    try {
      // Remove vínculo do banco de dados
      const [result] = await pool.query(
        'DELETE FROM tb_multivalorado WHERE id_teams = ? AND id_tournaments = ?',
        [teamId, tournamentId]
      );
    
      if (result.affectedRows === 0) {
        await bot.telegram.answerCbQuery(callbackQuery.id, {
          text: "❌ Relação não encontrada"
        });
      } else {
        await bot.telegram.answerCbQuery(callbackQuery.id, {
          text: "🗑️ Campeonato removido"
        });
        await bot.telegram.sendMessage(chatId, '🗑️ Campeonato removido com sucesso!');
      }
      return true;
    
    } catch (error) {
      console.error('Erro ao remover campeonato:', error);
    
      if (error.code === 'ER_ROW_IS_REFERENCED_2') {
        await bot.telegram.answerCbQuery(callbackQuery.id, {
          text: "❌ Não foi possível remover: há partidas vinculadas a esse campeonato."
        });
        await bot.telegram.sendMessage(chatId, '❌ Remoção bloqueada. Apague as partidas antes de excluir esse campeonato.');
      } else {
        await bot.telegram.answerCbQuery(callbackQuery.id, {
          text: "❌ Erro inesperado ao remover"
        });
        await bot.telegram.sendMessage(chatId, '❌ Ocorreu um erro inesperado ao tentar remover o campeonato.');
      }
    
      return true;
    }
  };
}