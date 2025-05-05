const { showMainMenu } = require('./menu'); 
const { pool } = require('../banco/database');
const { enviarCodigoPorEmail } = require('../comandos/email');
// Constantes para status dos termos
const TERMOS_ACEITOS = true;
const TERMOS_RECUSADOS = false;

//lista de jogos disponveis para seleção
const jogosDisponiveis = {
  counter_strike_2: { nome: 'Counter-Strike 2', id: 1 },
  valorant: { nome: 'Valorant', id: 2 },
  league_of_legends: { nome: 'League of Legends', id: 3 },
  apex_legends: { nome: 'Apex Legends', id: 4 },
  rainbow_six_siege: { nome: 'Rainbow Six Siege', id: 5 },
  rocket_league: { nome: 'Rocket League', id: 6 },
  kings_league: { nome: 'Kings League', id: 7 },
  pubg: { nome: 'PUBG', id: 8 }
};

// Valida se um nome completo atende aos requisitos
  function validarNomeCompleto(nome) {
    if (!nome || typeof nome !== 'string') return false;
    const nomeLimpo = nome.trim();
    if (nomeLimpo.length < 5 || nomeLimpo.length > 100) return false;
    const regex = /^[A-Za-zÀ-ÿ\s'-]+$/;
    const partes = nomeLimpo.split(/\s+/);
    return regex.test(nomeLimpo) && partes.length >= 2 && partes.every(p => p.length >= 2);
  }
  
  //Valida o formato de um e-mail
  function validarEmailFormatado(email) {
    if (!email || typeof email !== 'string' || email.length > 150) return false;
    const regexEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regexEmail.test(email.trim());
  }
  
  //Gera um código numérico de 6 dígitos para verificação
  function gerarCodigo() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }
  
  //Cria teclado inline para opções de código de e-mail
  function gerarTecladoCodigoEmail() {
    return {
      inline_keyboard: [[
        { text: '🔄 Reenviar Código', callback_data: 'reenviar_codigo' },
        { text: '✏️ Alterar E-mail', callback_data: 'alterar_email' }
      ]]
    };
  }
  
  //Envia mensagem solicitando o código de verificação por e-mail
  async function enviarMensagemCodigoEmail(bot, chatId, texto = '📩 Um código foi enviado para seu e-mail. Por favor, digite-o aqui:') {
    await bot.telegram.sendMessage(chatId, texto, {
      reply_markup: gerarTecladoCodigoEmail()
    });
  }

  //Atualiza o estado do usuário durante a verificação por e-mail
  function atualizarEstadoEmailCode(bot, userId, email, codigo) {
    bot.context.userStates[userId] = {
      step: 'awaiting_email_code',
      email,
      codigoEmail: codigo,
      tentativas: 0
    };
  }
  
  //Trata a solicitação de alteração de e-mail
  async function tratarCallbackAlterarEmail(bot, chatId, userId, callbackQuery) {
    const estado = bot.context.userStates[userId];
    if (!estado || estado.step !== 'awaiting_email_code') return false;
    bot.context.userStates[userId] = { step: 'awaiting_email', nome: estado.nome };
    if (callbackQuery?.message?.message_id) {
      await bot.telegram.deleteMessage(chatId, callbackQuery.message.message_id).catch(() => {});
    }
    await bot.telegram.sendMessage(chatId, '✉️ Digite seu novo e-mail para reenviarmos o código:');
    return true;
  }
  
  //Trata a solicitação de reenvio de código por e-mail
  async function tratarCallbackReenviarCodigo(bot, chatId, userId, callbackQuery) {
    const estado = bot.context.userStates[userId];
    if (!estado || estado.step !== 'awaiting_email_code' || !estado.email) return false;
    const novoCodigo = gerarCodigo();
    const reenviado = await enviarCodigoPorEmail(estado.email, novoCodigo);
    if (!reenviado) {
      await bot.telegram.sendMessage(chatId, '❌ Erro ao reenviar o código.');
      return true;
    }
    estado.codigoEmail = novoCodigo;
    estado.tentativas = 0;
    await bot.telegram.editMessageText(chatId, callbackQuery.message.message_id, null,
      '📩 Um novo código foi enviado. Digite-o aqui:', {
        reply_markup: gerarTecladoCodigoEmail()
      }).catch(() => {});
    return true;
  }
  
  //faz as chamadas se o email  é valido  e envia o email
  async function validarEmailReal(bot, chatId, userId, email) {
    const emailFormatado = email.trim().toLowerCase();
    if (!validarEmailFormatado(emailFormatado)) {
      await bot.telegram.sendMessage(chatId, '❌ E-mail inválido. Envie um e-mail no formato correto.');
      return false;
    }

     // Verifica se o e-mail já está em uso por outro usuário
  try {
    const [rows] = await pool.query(
      'SELECT id_usuario FROM tb_usuario WHERE ds_email = ? AND id_usuario != ?',
      [emailFormatado, userId]
    );

    if (rows.length > 0) {
      await bot.telegram.sendMessage(chatId, '⚠️ Este e-mail já está sendo utilizado por outro usuário. Por favor, informe um e-mail diferente.');
      return false;
    }
  } catch (err) {
    console.error('❌ Erro ao verificar duplicidade de e-mail:', err);
    await bot.telegram.sendMessage(chatId, '❌ Erro ao verificar o e-mail. Tente novamente mais tarde.');
    return false;
  }
  
    const codigo = gerarCodigo();
    const enviado = await enviarCodigoPorEmail(emailFormatado, codigo);
    if (!enviado) {
      await bot.telegram.sendMessage(chatId, '❌ Falha ao enviar e-mail. Verifique o endereço e tente novamente.');
      return false;
    }
    atualizarEstadoEmailCode(bot, userId, emailFormatado, codigo);
    await enviarMensagemCodigoEmail(bot, chatId);
    return true;
  }
  
  //compara o codigo recebido com  o enviado
  async function verificarCodigoEmail(bot, chatId, userId, textoDigitado) {
    const estado = bot.context.userStates[userId];
    if (!estado || estado.step !== 'awaiting_email_code') return false;
    const codigoDigitado = textoDigitado.trim();
    if (codigoDigitado !== estado.codigoEmail) {
      await bot.telegram.sendMessage(chatId, '❌ Código incorreto. Verifique seu e-mail e tente novamente.', {
        reply_markup: gerarTecladoCodigoEmail()
      });
      return true;
    }
    try {
      await pool.query('UPDATE tb_usuario SET ds_email = ?, ds_cadastro_step = ? WHERE id_usuario = ?',
        [estado.email, 'awaiting_game_selection', userId]);
      bot.context.userStates[userId] = { step: 'awaiting_game_selection', jogos: [] };
      await bot.telegram.sendMessage(chatId, '✅ E-mail verificado com sucesso! Selecione seus jogos:', {
        reply_markup: criarTecladoJogos([])
      });
      return true;
    } catch (err) {
      console.error('❌ Erro ao salvar e-mail no banco:', err);
      await bot.telegram.sendMessage(chatId, '❌ Erro ao verificar e-mail. Tente novamente mais tarde.');
      return true;
    }
  }
  
  
  
// cria  uma espécie de checkbox para o usuario selecionar seus jogos
function criarTecladoJogos(selecionados = []) {
  console.log('🎮 Gerando teclado de jogos:', selecionados);
  const teclado = Object.entries(jogosDisponiveis).map(([chave, { nome }]) => {
    const marcado = selecionados.includes(chave) ? '☑️ ' : '⬜ ';
    return [{
      text: `${marcado}${nome}`,
      callback_data: `alternar_jogo_${chave}`,
    }];
  });

  teclado.push([
    {
      text: '✅ Concluir Cadastro',
      callback_data: 'finalizar_cadastro'
    }
  ]);

  return { inline_keyboard: teclado };
}
  
//cuida de todo o cadastro
async function verificarAceiteTermos(bot, contexto, userId, chatId, callbackData = '') {
    try {
      const [usuarioRows] = await pool.query(
        'SELECT ds_cadastro_step, nm_usuario FROM tb_usuario WHERE id_usuario = ?',
        [userId]
      );
      
      const usuario = usuarioRows[0];
      const estado = bot.context.userStates[userId] || {};
      const step = estado.step || usuario?.ds_cadastro_step;
  
      // Se não existe, cria com passo inicial
      if (!usuario) {
        await pool.query(
          'INSERT INTO tb_usuario (id_usuario, ds_cadastro_step) VALUES (?, ?)',
          [userId, 'awaiting_terms']
        );
      }
  
      // Processar aceite dos termos
      if (callbackData === 'aceitar_termos') {
        await pool.query(
          'UPDATE tb_usuario SET ds_cadastro_step = ? WHERE id_usuario = ?',
          ['awaiting_name', userId]
        );
  
        bot.context.userStates[userId] = { step: 'awaiting_name' };
  
        if (contexto.callbackQuery?.message?.message_id) {
          await bot.telegram.deleteMessage(chatId, contexto.callbackQuery.message.message_id).catch(console.error);
        }
  
        await bot.telegram.sendMessage(
          chatId,
          `✅ Termos aceitos!\n\n👊🔥 Seja bem-vindo(a) ao *FURIA Fan Bot*! Agora você faz parte da nossa alcateia! 🐆🖤\n\n👤 Envie agora seu nome completo:`,
          { parse_mode: 'Markdown' }
        );
        return true;
      }
  
      // Recusar termos
      if (callbackData === 'recusar_termos') {
        await pool.query(
          'UPDATE tb_usuario SET ds_cadastro_step = ? WHERE id_usuario = ?',
          ['rejected', userId]
        );
  
        await bot.telegram.sendMessage(
          chatId,
          '⚠️ Você recusou os termos. Não é possível utilizar o bot sem aceitá-los.'
        );
        return true;
      }
  
      bot.context.userStates[userId] = { ...estado, step };
  
      // Nome
      if (step === 'awaiting_name' && contexto.message?.text) {
        const nome = contexto.message.text.trim();
        if (!validarNomeCompleto(nome)) {
          await bot.telegram.sendMessage(chatId, '❌ Nome inválido. Envie um nome completo válido.');
          return true;
        }
  
        await pool.query(
          'UPDATE tb_usuario SET nm_usuario = ?, ds_cadastro_step = ? WHERE id_usuario = ?',
          [nome, 'awaiting_email', userId]
        );
  
        bot.context.userStates[userId] = { step: 'awaiting_email', nome };
        await bot.telegram.sendMessage(chatId, '📧 Agora envie seu e-mail:');
        return true;
      }
  
      // Email
      if (step === 'awaiting_email' && contexto.message?.text) {
        const email = contexto.message.text.trim();
        const validado = await validarEmailReal(bot, chatId, userId, email);
        if (!validado) return true;
        return true; // já aguarda código
      }
      
  
      // Mostrar termos
      if (!step || step === 'awaiting_terms' || step === 'rejected'){
        await bot.telegram.sendMessage(
          chatId,
          `📜 <b>Termos de Uso</b>\n\nAo usar este bot, você concorda com a coleta de dados para personalização da sua experiência com a FURIA.\n\nClique abaixo para continuar.`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: "✅ Aceitar Termos", callback_data: 'aceitar_termos' }],
                [{ text: "❌ Recusar Termos", callback_data: 'recusar_termos' }]
              ]
            }
          }
        );
        return true;
      }
  
      return false;
    } catch (erro) {
      console.error('Erro no processo de cadastro:', erro);
      await bot.telegram.sendMessage(chatId, '❌ Erro inesperado. Tente novamente mais tarde.');
      return true;
    }
  }
  
  

module.exports = {
    verificarAceiteTermos,
    validarNomeCompleto,
    criarTecladoJogos,
    jogosDisponiveis,
    verificarCodigoEmail,
    tratarCallbackAlterarEmail,
    tratarCallbackReenviarCodigo,
    validarEmailReal
};
