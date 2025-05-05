const { showMainMenu } = require('../menu');
const { pool } = require('../../banco/database');
const { jogosDisponiveis,criarTecladoJogos } = require('../cadastro');

//Handler: Botões durante a seleção de jogos no cadastro
async function handleBotaoCadastro(bot, chatId, messageId, userId, data, callbackQuery) {
  const estado = bot.context.userStates[userId];
  // Verifica se o usuário está na etapa de seleção de jogos
  if (!estado || estado.step !== 'awaiting_game_selection') return false;

  // Evita timeout no botão
  await bot.telegram.answerCbQuery(callbackQuery.id).catch(() => {});

  // Compatibilidade: aceita tanto "toggle_" quanto "alternar_jogo_"
  if (data.startsWith('toggle_') || data.startsWith('alternar_jogo_')) {
     // Extrai a chave do jogo a partir do callback_data
    const jogoKey = data.replace(/^toggle_|^alternar_jogo_/, '');
    estado.jogos = estado.jogos || [];

     // Adiciona ou remove o jogo da lista do usuário
    if (estado.jogos.includes(jogoKey)) {
      estado.jogos = estado.jogos.filter(j => j !== jogoKey);
    } else {
      estado.jogos.push(jogoKey);
    }

    // Atualiza o teclado com as novas seleções
    try {
      await bot.telegram.editMessageReplyMarkup(
        chatId,
        messageId,
        null,
        criarTecladoJogos(estado.jogos)
      );
    } catch (error) {
      console.error('Erro ao atualizar teclado:', error);
    }

    return true;
  }

  // ================================================
  // Ação: Finalizar cadastro após escolha dos jogos
  // ================================================

  if (data === 'finalizar_cadastro') {
      // Impede finalizar se nenhum jogo estiver selecionado
    if (!estado.jogos || estado.jogos.length === 0) {
      await bot.telegram.sendMessage(chatId, '⚠️ Selecione ao menos um jogo antes de concluir.');
      return true;
    }

    try {
      // Remove todos os jogos antigos do usuário
      await pool.query('DELETE FROM tb_jogo_usuario WHERE id_usuario = ?', [userId]);

      // Insere os jogos selecionados
      for (const chave of estado.jogos) {
        const jogo = jogosDisponiveis[chave];
        if (jogo) {
          await pool.query(
            'INSERT INTO tb_jogo_usuario (id_usuario, id_jogos) VALUES (?, ?)',
            [userId, jogo.id]
          );
        }
      }

      // Marca termos como aceitos ao final do cadastro
      await pool.query('UPDATE tb_usuario SET ds_cadastro_step = ? WHERE id_usuario = ?', [
        'completed',
        userId
      ]);

    } catch (err) {
      console.error('❌ Erro ao salvar jogos:', err);
      await bot.telegram.sendMessage(chatId, '❌ Erro ao salvar seus jogos. Tente novamente.');
      return true;
    }

    delete bot.context.userStates[userId];

    await bot.telegram.sendMessage(
      chatId,
      `🔥 Cadastro completo! Obrigado por escolher a FURIA! 🐆🖤`
    );

    // Exibe o menu principal do bot
    await showMainMenu(bot, chatId, '', userId);
    return true;
  }

  return false;
}


module.exports = handleBotaoCadastro;