const { verificarAceiteTermos } = require('../funcao/cadastro'); // ajuste o caminho conforme a estrutura

module.exports = function registrarStart(bot) {
    console.log("📥 Handler de /start carregado");
  bot.start(async (ctx) => {
    const userId = ctx.from.id;
    const chatId = ctx.chat.id;
    console.log("📩 /start recebido de", userId);

    try {
      const termosProcessados = await verificarAceiteTermos(bot, ctx, userId, chatId);
      if (termosProcessados) return;

      await bot.telegram.sendMessage(chatId, `👋 Olá *${ctx.from.first_name || ''}*! Seja bem-vindo(a) de volta ao *FURIA Fan Bot*! 🐆🖤`, {
        parse_mode: 'Markdown'
      });

    } catch (err) {
      console.error('❌ Erro no /start:', err);
      await ctx.reply('❌ Erro ao iniciar o bot. Tente novamente mais tarde.');
    }
  });
}
