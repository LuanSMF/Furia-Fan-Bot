const { showMainMenu, showAdminPanel, showAdminAgendaMenu } = require('./menu');
const auth = require('../admin/auth');
const security = require('../admin/security');
const handleAoVivoMensagem = require('./momento');
const {verificarAceiteTermos,verificarCodigoEmail } = require ('./cadastro')

const {
    pool,
    findOrCreateMultivalorado,
    insertMatch,
    addTournament,
    addTeam,
    updateMatchField,
    updateTournament,
    updateTeam
} = require('../banco/database');

//Handler principal para mensagens de texto recebidas pelo bot
function handleMessage(bot) {
    bot.on('message', async (ctx) => {
        // Filtra mensagens inválidas ou comandos
        const msg = ctx.message;
        if (!msg || msg.text?.startsWith('/')) return;

        const chatId = msg.chat.id;
        const userId = msg.from.id;
        // Verificação de termos e condições
        const interceptado = await verificarAceiteTermos(bot, ctx, userId, chatId);
        if (interceptado) return;

        // Processamento de mensagens AO VIVO
        const userState = bot.context.userStates[userId];
        const aoVivoTratado = await handleAoVivoMensagem(bot, ctx);
        if (aoVivoTratado) return;

        // Lógica principal baseada no estado do usuário
        try {
            const text = msg.text?.trim();
            switch (userState?.step) {
                // cadastro  de nome e suas  validações de tamanho
                case 'awaiting_full_name': {
                    const nome = text.trim();
                    if (!nome || nome.length < 5) {
                        await ctx.telegram.sendMessage(chatId, '❌ Nome muito curto. Digite seu nome completo (mínimo 5 caracteres).');
                        return;
                    }
                
                    // Aqui você pode armazenar no banco ou salvar temporariamente
                    bot.context.userStates[userId].nomeCompleto = nome;
                    bot.context.userStates[userId].step = 'cadastro_completo'; // ou próximo passo
                
                    await ctx.telegram.sendMessage(chatId, `✅ Nome salvo: ${security.escapeHtml(nome)}\n\nCadastro completo. Bem-vindo ao FURIA Fan Bot!`);
                    delete bot.context.userStates[userId];
                    return showMainMenu(bot, chatId, nome, userId);
                }case 'awaiting_email_code': {
                    const verificouCodigo = await verificarCodigoEmail(bot, chatId, userId, text);
                    if (verificouCodigo) return;
                    break;
                }                                  
                case 'awaiting_match_datetime': {
                    const teamId = security.validateId(userState.teamId);
                    const tournamentId = security.validateId(userState.tournamentId);
                    const id_formato = userState.id_formato;
                    const status = `1`; 
                    const tempo = true;

                    if (!teamId || !tournamentId) {
                        throw new Error('⚠️ Dados incompletos ou inválidos da partida. Inicie novamente.');
                    }
                    // Validações de data/hora
                    const datetimeRegex = /^(0[1-9]|[12][0-9]|3[01])\/(0[1-9]|1[0-2])\/((?:19|20)\d\d)\s([01][0-9]|2[0-3]):([0-5][0-9])$/;

                    const match = text.match(datetimeRegex);
                    if (!match) throw new Error('❌Formato inválido. Use DD/MM/AAAA HH:MM ❌');

                    const [_, day, month, year, hour, minute] = match;
                    const dateObj = new Date(`${year}-${month}-${day}T${hour}:${minute}:00`);

                    // Verificação de data válida
                    if (isNaN(dateObj.getTime()) || dateObj.getDate() !== parseInt(day)) {
                        throw new Error('❌ A data inserida é inválida. Verifique se o dia realmente existe no mês informado (ex: 31/04 não é válido).');
                    }

                    const agora = new Date();
                    agora.setSeconds(0, 0); // Zera segundos e milissegundos
                    
                    if (dateObj < agora) {
                      throw new Error('❌ Não é possível agendar partidas no passado ❌');
                    }

                    const dt_match = `${year}-${month}-${day}`;
                    const dt_time = `${hour}:${minute}:00`;

                    const [teamRows] = await pool.query(
                        'SELECT nm_name FROM tb_teams WHERE id_teams = ?',
                        [teamId]
                    );
                    const [tournamentRows] = await pool.query(
                        'SELECT nm_name FROM tb_tournaments WHERE id_tournaments = ?',
                        [tournamentId]
                    );

                    if (!teamRows?.length || !tournamentRows?.length) {
                        throw new Error('Time ou torneio não encontrado no banco');
                    }

                    // Persistência no banco de dados
                    const id_multivalorado = await findOrCreateMultivalorado(teamId, tournamentId);
                    await insertMatch(id_multivalorado,id_formato,status, dt_match, dt_time,tempo);
                    delete bot.context.userStates[userId];

                    const formatoTexto = userState.id_formato === 1 ? 'MD1' :
                     userState.id_formato === 2 ? 'MD3' :
                     userState.id_formato === 3 ? 'MD5' : 'Desconhecido';
                     
                     // Feedback detalhado ao usuário
                     return ctx.telegram.sendMessage(
                        chatId,
                        `✅ Partida agendada!\n\n` +
                        `📅 ${day}/${month}/${year}\n\n` +
                        `🏆 ${tournamentRows[0].nm_name}\n` +
                        `⏰ ${hour}:${minute}\n` +
                        `🎮 Furia vs ${teamRows[0].nm_name}\n` +
                        `📌 Tipo: ${formatoTexto}\n\n` +
                        `🔥 <i>Bora pra cima, Furia!</i>`,
                        { parse_mode: 'HTML' }
                    );
                }

                case 'awaiting_tournament_name': {
                    const sanitized = security.sanitizeName(text);
                    if (!sanitized || sanitized.length < 3) {
                        throw new Error('Nome inválido (mínimo 3 caracteres)');
                    }

                    const newId = await addTournament(sanitized);
                    delete bot.context.userStates[userId];
                    await ctx.telegram.sendMessage(chatId, `✅ Competição Adicionada!\n\n🏆 ${security.escapeHtml(sanitized)}`);
                    return showAdminPanel(bot, chatId);
                }

                case 'awaiting_team_name': {
                    const sanitized = security.sanitizeName(text);
                    if (!sanitized || sanitized.length < 3) {
                        throw new Error('❌ Nome inválido (mínimo 3 caracteres) ❌');
                    }

                    const tournamentId = security.validateId(userState.tournamentId);
                    if (!tournamentId) {
                        throw new Error('❌ Torneio inválido ❌');
                    }

                    const { teamId } = await addTeam(sanitized, tournamentId);
                    const [tournament] = await pool.query(
                        'SELECT nm_name FROM tb_tournaments WHERE id_tournaments = ?',
                        [tournamentId]
                    );

                    delete bot.context.userStates[userId];
                    await ctx.telegram.sendMessage(
                        chatId,
                        `✅ TIME ADICIONADO!\n\n` +
                        `🏆 ${security.escapeHtml(tournament[0]?.nm_name || 'Desconhecido')}\n` +
                        `👥 ${security.escapeHtml(sanitized)}`
                    );
                    return showAdminPanel(bot, chatId);
                }

                case 'updating_match_date': {
                    const validatedDate = security.validateDate(text);
                    if (!validatedDate) {
                        throw new Error('❌ Formato inválido. Use DD/MM/AAAA ❌');
                    }

                    const now = new Date();
                    now.setHours(0, 0, 0, 0);
                    if (validatedDate < now) {
                        throw new Error('❌ A data não pode ser no passado ❌');
                    }

                    const year = validatedDate.getFullYear();
                    const month = String(validatedDate.getMonth() + 1).padStart(2, '0');
                    const day = String(validatedDate.getDate()).padStart(2, '0');
                    const formattedDate = `${year}-${month}-${day}`;

                    const matchId = security.validateId(userState.matchId);
                    if (!matchId) {
                        throw new Error('❌ ID da partida inválido ❌');
                    }

                    const wasUpdated = await updateMatchField(matchId, 'dt_match', formattedDate);
                    if (!wasUpdated) throw new Error('❌ Falha ao atualizar ❌');

                    delete bot.context.userStates[userId];
                    await ctx.telegram.sendMessage(chatId, '✅ Data atualizada com sucesso!');
                    return showAdminAgendaMenu(bot, chatId);
                }

                case 'updating_match_time': {
                    const validatedTime = security.validateTime(text);
                    if (!validatedTime) {
                        throw new Error('❌ Formato inválido. Use HH:MM ❌');
                    }

                    const matchId = security.validateId(userState.matchId);
                    if (!matchId) {
                        throw new Error('❌ ID da partida inválido ❌');
                    }

                    const wasUpdated = await updateMatchField(matchId, 'dt_time', validatedTime + ':00');
                    if (!wasUpdated) throw new Error('❌ Falha ao atualizar o horário ❌');

                    delete bot.context.userStates[userId];
                    await ctx.telegram.sendMessage(chatId, '✅ Horário da partida atualizado!');
                    return showAdminAgendaMenu(bot, chatId);
                }

                case 'updating_tournament_name': {
                    const sanitized = security.sanitizeName(text);
                    if (!sanitized || sanitized.length < 3) {
                        throw new Error('❌ Nome inválido (mínimo 3 caracteres) ❌');
                    }

                    const tournamentId = security.validateId(userState.tournamentId);
                    if (!tournamentId) {
                        throw new Error('❌ ID do torneio inválido ❌');
                    }

                    const wasUpdated = await updateTournament(tournamentId, sanitized);
                    if (!wasUpdated) throw new Error('❌ Falha ao atualizar ❌');

                    delete bot.context.userStates[userId];
                    await ctx.telegram.sendMessage(chatId, `✅ Competição Atualizada:\n\n🏆 ${security.escapeHtml(sanitized)}`);
                    return showAdminAgendaMenu(bot, chatId);
                }

                case 'updating_team_name': {
                    const sanitized = security.sanitizeName(text);
                    if (!sanitized || sanitized.length < 3) {
                        throw new Error('❌ Nome inválido (mínimo 3 caracteres) ❌');
                    }

                    if (sanitized.toLowerCase() === 'furia') {
                        throw new Error('❌ Não é permitido usar o nome "Furia ❌');
                    }

                    const teamId = security.validateId(userState.teamId);
                    if (!teamId) {
                        throw new Error('❌ ID do time inválido ❌');
                    }

                    const wasUpdated = await updateTeam(teamId, sanitized);
                    if (!wasUpdated) throw new Error('❌ Falha ao atualizar ❌');

                    delete bot.context.userStates[userId];
                    await ctx.telegram.sendMessage(chatId, `✅ Time atualizado para: ${security.escapeHtml(sanitized)}`);
                    return showAdminAgendaMenu(bot, chatId);
                }
                
                default: {
                    const stepAtual = bot.context.userStates[userId]?.step;
                
                    // Se o usuário estiver no meio do cadastro
                    if (stepAtual && stepAtual !== 'completed') {
                        console.warn(`⛔ Menu bloqueado para ${userId} - Etapa atual: ${stepAtual}`);
                        // Redireciona para continuar o cadastro automaticamente
                        await verificarAceiteTermos(bot, ctx, userId, chatId);
                        return;
                    }
                
                    // Caso contrário, mostra o menu normalmente
                    return await showMainMenu(bot, chatId, security.escapeHtml(msg.from.first_name), userId);
                }
            }
        } catch (error) {
            let userMessage = error.message;

             // Tratamento especial para erros de banco de dados
            if (userMessage.includes("Incorrect date value")) {
                userMessage = "❌ A data inserida é inválida. Verifique se o dia realmente existe no mês informado (ex: 31/04 não é válido).";
            }

            await ctx.telegram.sendMessage(chatId, security.escapeHtml(userMessage));
        }
    });
}

module.exports = {
    handleMessage
};
