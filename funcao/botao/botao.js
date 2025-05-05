const auth = require('../../admin/auth');
const security = require('../../admin/security');

const adminCallbacks = require('./botao_admin');
const filterCallbacks = require('./botao_filtros');
const menuCallbacks = require('./botao_menu');
const tournamentCallbacks = require('./torneio_admin');
const teamCallbacks = require('./time_admin');
const addPartidasAdmin = require('./add_partidas_admin');
const { handleUpdatePartida } = require('./update_partidas_admin');
const { handleDeletePartida } = require('./delete_partidas_admin');
const { iniciarMonitorAoVivo } = require('../../comandos/partidas');
const { iniciarBroadcastEspectadores } = require('./botao_momento');
const { handleAdminAoVivo } = require('./botao_momento');
const { restaurarPartidaAoVivo } = require('../../comandos/partidas');
const { mostrarPartidasEncerradas } = require('../../comandos/partidas');
const handleCallbackPartidas = require('./botao_partidas');
const {
  verificarAceiteTermos,
  tratarCallbackAlterarEmail,
  tratarCallbackReenviarCodigo
} = require('../cadastro');
const handleBotaoCadastro = require('./botao_cadastro');

// Variáveis globais de controle de partidas ao vivo
global.partidaAoVivo = false;
global.matchAoVivoId = null;

// Valida se a instância do bot está correta
function isValidBotInstance(bot) {
  return bot && typeof bot.telegram?.sendMessage === 'function' && typeof bot.telegram?.answerCbQuery === 'function';
}

// Exporta função que registra os handlers de callback
module.exports = (bot) => {
  if (!isValidBotInstance(bot)) {
    console.error('❌ Instância do bot inválida!');
    return;
  }

  // Inicia recursos relacionados à transmissão ao vivo  
  iniciarBroadcastEspectadores(bot);
  iniciarMonitorAoVivo(bot);
  restaurarPartidaAoVivo();

  // ===========================
  // Listener para callback_query (botões)
  // ===========================
  bot.on('callback_query', async (ctx) => {
    const callbackQuery = ctx.callbackQuery;
    const chatId = callbackQuery?.message?.chat?.id;
    const messageId = callbackQuery?.message?.message_id;
    const data = callbackQuery?.data;
    console.log("🛰️ Callback recebido:", data);
    const userId = callbackQuery?.from?.id;
    const firstName = callbackQuery?.from?.first_name || '';

    const isAdmin = auth.authenticateWithUserId(userId);

    try {
      if (typeof data !== 'string' || !data.trim()) {
        throw new Error('Callback vazio ou malformado');
      }

      await bot.telegram.answerCbQuery(callbackQuery.id);

       // Verifica se o usuário está no fluxo de cadastro
      const interceptado = await verificarAceiteTermos(bot, ctx, userId, chatId, data);
      if (interceptado) return;

      // Ações de alteração de e-mail
      if (data === 'alterar_email') {
        await tratarCallbackAlterarEmail(bot, chatId, userId, callbackQuery);
        return;
      }
      // reenvio de código
      if (data === 'reenviar_codigo') {
        await tratarCallbackReenviarCodigo(bot, chatId, userId, callbackQuery);
        return;
      }

      if (data === 'show_past_matches') {
        await mostrarPartidasEncerradas(bot, chatId);
        return;
      }

      // Simula uma mensagem de texto para comandos que reutilizam fluxo de mensagens
      const simulatedMsg = {
        chat: { id: chatId },
        from: {
          id: userId,
          first_name: security.escapeHtml(firstName)
        },
        text: '',
        message_id: messageId
      };

      // Encaminha a execução para o manipulador adequado com base no prefixo do callback
      const handled =
        await handleUpdatePartida(bot, chatId, messageId, userId, isAdmin, data, callbackQuery) ||
        await adminCallbacks(bot, chatId, messageId, userId, isAdmin, data, callbackQuery) ||
        await filterCallbacks(bot, chatId, messageId, userId, isAdmin, data, callbackQuery, simulatedMsg) ||
        await menuCallbacks(bot, chatId, messageId, userId, isAdmin, data, callbackQuery) ||
        await tournamentCallbacks(bot, chatId, messageId, userId, isAdmin, data, callbackQuery) ||
        await teamCallbacks(bot, chatId, messageId, userId, isAdmin, data, callbackQuery) ||
        await addPartidasAdmin(bot, chatId, messageId, userId, isAdmin, data, callbackQuery) ||
        await handleDeletePartida(bot, chatId, messageId, userId, isAdmin, data, callbackQuery) ||
        await handleCallbackPartidas(bot, chatId, messageId, userId, isAdmin, data, callbackQuery) ||
        await handleBotaoCadastro(bot, chatId, messageId, userId, data, callbackQuery) ||
        await handleAdminAoVivo(bot, chatId, messageId, userId, isAdmin, data, callbackQuery);

      // Caso o callback não tenha sido tratado por nenhum módulo
      if (!handled) {
        console.warn(`Callback não tratado: ${data}`);
        await bot.telegram.answerCbQuery(callbackQuery.id, {
          text: "⚠️ Ação não reconhecida"
        });
      }
    } catch (error) {
      console.error('Erro no callback:', error);
      await bot.telegram.answerCbQuery(callbackQuery.id, {
        text: "⚠️ Erro ao processar a requisição"
      });
    }
  });
};
