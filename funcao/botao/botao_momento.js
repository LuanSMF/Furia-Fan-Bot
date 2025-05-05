const { conectarMongo } = require('../../banco/database_mongo');


// ===========================
// Gera o painel de controle para administradores na sessão AO VIVO
// ===========================
function gerarPainelInline() {
    return {
        inline_keyboard: [
            [
                { text: "➕ Ponto FURIA", callback_data: `placar_mapa_furia` },
                { text: "➕ Ponto Adversário", callback_data: `placar_mapa_oponente` }
            ],
            [{ text: "✅ Vitória no Mapa", callback_data: `vitoria_mapa` }],
            [{ text: "🏑 Encerrar Partida", callback_data: `encerrar_partida` }],
            [{ text: "✏️ Alterar Nome do Mapa", callback_data: `alterar_nome_mapa` }],
            [{ text: "🚪 Sair da Sessão AO VIVO", callback_data: `sair_sessao_ao_vivo` }]
        ]
    };
}

// ===========================
// Envia atualizações do placar para os espectadores da partida
// ===========================
async function enviarAtualizacaoParaEspectadores(bot, partida) {
    if (!bot.context?.spectators?.size) return;

    const mapaAtual = partida.mapas[partida.mapas.length - 1];
    const texto = `📺 AO VIVO\nFURIA ${partida.placar_geral.furia} x ${partida.placar_geral.oponente} ${partida.times.oponente.nome}\nMapa ${mapaAtual.numero} (${mapaAtual.nome || 'Indefinido'}): ${mapaAtual.placar.furia} x ${mapaAtual.placar.oponente}`;

    for (const userId of bot.context.spectators) {
        try {
            const isAdmin = bot.context.adminAoVivo?.[userId];
            const extra = isAdmin ? {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "🔄 Reabrir Painel", callback_data: "ao_vivo_painel" }]
                    ]
                }
            } : {};

            await bot.telegram.sendMessage(userId, texto, extra);
        } catch (e) {
            console.warn(`⚠️ Erro ao enviar update para espectador ${userId}:`, e.message);
        }
    }
}

// ===========================
// Inicializa o sistema de broadcast ao vivo
// ===========================
function iniciarBroadcastEspectadores(bot) {
    if (!bot.context.__broadcastIniciado) {
        bot.context.__broadcastIniciado = true;
        bot.context.spectators = bot.context.spectators || new Set();
        console.log('📡 Broadcast pronto para reações por evento.');
    }
}

const { pool } = require('../../banco/database'); // necessário para atualizar o MySQL

// ===========================
// Encerra a sessão ao vivo e salva dados
// ===========================
async function encerrarSessaoAoVivo(bot, chatId, colecao, partida, resultado) {
    // Atualiza o resultado final e o timestamp no MongoDB
    await colecao.updateOne(
        { id_partida: partida.id_partida },
        {
            $set: {
                ultima_atualizacao: new Date().toISOString(),
                resultado_final: resultado
            },
            $push: {
                logs_admin: {
                    acao: `partida encerrada manualmente com resultado: ${resultado}`,
                    user_id: 0, // ou passe o userId como argumento se quiser logar
                    timestamp: new Date().toISOString()
                }
            }
        }
    );

    // Atualiza o status da partida no banco relacional (id_status = 3 = finalizado)
    await pool.query(
        'UPDATE tb_matches SET id_status = 3 WHERE id_matches = ?',
        [partida.id_partida]
    );

    // Finaliza a sessão local
    global.partidaAoVivo = false;
    global.matchAoVivoId = null;

    // Limpa o contexto do bot
    if (bot.context.spectators) bot.context.spectators.clear();
    bot.context.adminAoVivo = {};
    bot.context.awaitingMVP = {};
    bot.context.userStates = {};
    bot.context._avisouPartidaAoVivo = false;

    // Notifica
    await bot.telegram.sendMessage(chatId, `🏑 Partida encerrada!\n\nResultado: ${resultado}`);
}


// ===========================
// Handler principal dos botões da sessão ao vivo
// ===========================
async function handleAdminAoVivo(bot, chatId, messageId, userId, isAdmin, data, callbackQuery) {
    // Lista de comandos reconhecidos como parte da sessão AO VIVO
    const comandosAoVivo = [
        'ao_vivo_ver',
        'ao_vivo_painel',
        'placar_mapa_furia',
        'placar_mapa_oponente',
        'vitoria_mapa',
        'encerrar_partida',
        'alterar_nome_mapa',
        'sair_sessao',
        'sair_sessao_ao_vivo'
    ];

    const isComandoAoVivo = comandosAoVivo.some(cmd => data.startsWith(cmd));
    if (!isComandoAoVivo) return false;

    // A partir daqui, sabemos que é comando ao vivo
    bot.context.spectators = bot.context.spectators || new Set();
    bot.context.__broadcastIniciado = bot.context.__broadcastIniciado || false;

    const db = await conectarMongo();
    const colecao = db.collection('partidas_ao_vivo');
    const partida = await colecao.findOne({ id_partida: global.matchAoVivoId });

    if (!partida) {
        await bot.telegram.sendMessage(chatId, "⚠️ Nenhuma partida ao vivo encontrada.");
        return true;
    }

    const mapaAtual = partida.mapas[partida.mapas.length - 1];

    // Comando: usuário quer ver a sessão ao vivo
    if (data === 'ao_vivo_ver') {
        bot.context.spectators.add(userId);

        const texto = `📺 Sessão AO VIVO\n\n🌿 Placar Geral (${partida.formato}): FURIA ${partida.placar_geral.furia} 🆚 ${partida.placar_geral.oponente} ${partida.times.oponente.nome}\n\n🏝️ ${mapaAtual.numero}° Mapa  (${mapaAtual.nome || 'Nome não definido'}): FURIA ${mapaAtual.placar.furia} 🆚 ${mapaAtual.placar.oponente}`;
        await bot.telegram.sendMessage(chatId, texto);
        await bot.telegram.sendMessage(chatId, `👁️ Você receberá atualizações ao vivo. Carregando histórico de eventos...`);

        if (mapaAtual.eventos?.length > 0) {
            for (const evento of mapaAtual.eventos) {
                try {
                    if (evento.tipo === 'texto') {
                        await bot.telegram.sendMessage(chatId, `📝 ${evento.texto}`);
                    } else if (evento.tipo === 'link') {
                        await bot.telegram.sendMessage(chatId, `🔗 ${evento.url}`);
                    } else if (evento.tipo === 'foto') {
                        await bot.telegram.sendPhoto(chatId, evento.file_id, { caption: evento.legenda || undefined });
                    } else if (evento.tipo === 'video') {
                        await bot.telegram.sendVideo(chatId, evento.file_id, { caption: evento.legenda || undefined });
                    }
                } catch (e) {
                    console.warn(`❌ Erro ao enviar evento histórico para ${chatId}:`, e.message);
                }
            }
        } else {
            await bot.telegram.sendMessage(chatId, "📭 Nenhum evento registrado ainda para este mapa.");
        }

        return true;
    }

    // Comando: sair da sessão como espectador
    if (data === 'sair_sessao') {
        if (bot.context?.spectators?.has(userId)) {
            bot.context.spectators.delete(userId);
            await bot.telegram.answerCbQuery("✅ Você saiu da sessão ao vivo.");
            await bot.telegram.sendMessage(chatId, "🚪 Você saiu da sessão AO VIVO. Pode voltar quando quiser.");
        } else {
            await bot.telegram.answerCbQuery("⚠️ Você não estava em uma sessão ao vivo.");
        }

        // Retorna ao menu principal atualizado
        return showMainMenu(bot, chatId, ctx.from.first_name, userId);
    }

    // Comando: sair da sessão como admin
    if (data === 'sair_sessao_ao_vivo') {
        bot.context.spectators.delete(userId);
        delete bot.context.awaitingMVP?.[userId];
        delete bot.context.userStates?.[userId];
        bot.context.adminAoVivo && delete bot.context.adminAoVivo[userId];
        
        await bot.telegram.sendMessage(chatId, '🚪 Você saiu da sessão AO VIVO.');
        return true;
    }

    // Comando: apenas admins podem continuar
    if (!isAdmin) {
        await bot.telegram.answerCbQuery(callbackQuery.id, { text: "❌ Apenas administradores podem usar esse painel" });
        return true;
    }

    // === REABRIR PAINEL (painel inline com controles) ===
    if (data === 'ao_vivo_painel') {
        bot.context.adminAoVivo = bot.context.adminAoVivo || {};
        bot.context.adminAoVivo[userId] = true;

        const texto = `🌿 Placar Geral (${partida.formato}): FURIA ${partida.placar_geral.furia} 🆚 ${partida.placar_geral.oponente} ${partida.times.oponente.nome}\n\n🏝️ ${mapaAtual.numero}° Mapa (${mapaAtual.nome || 'Nome não definido'}): FURIA ${mapaAtual.placar.furia} 🆚 ${mapaAtual.placar.oponente}`;

        await bot.telegram.sendMessage(chatId, texto, {
            reply_markup: gerarPainelInline()
        });

        return true;
    }

     // Comando: placar
    if (data === 'placar_mapa_furia') {
        mapaAtual.placar.furia++;
        await enviarAtualizacaoParaEspectadores(bot, partida);
    } else if (data === 'placar_mapa_oponente') {
        mapaAtual.placar.oponente++;
        await enviarAtualizacaoParaEspectadores(bot, partida);
    }
    // Comando: declarar fim do mapa
    if (data === 'vitoria_mapa') {
        const vencedor = mapaAtual.placar.furia > mapaAtual.placar.oponente ? 'furia' :
                         mapaAtual.placar.oponente > mapaAtual.placar.furia ? 'oponente' : null;

    if (!['furia', 'oponente'].includes(vencedor)) {
        await bot.telegram.sendMessage(chatId, '⚠️ O mapa está empatado. Nenhum ponto será atribuído.');
        return true;
    }
        if (vencedor) {
            partida.placar_geral[vencedor]++;
            await colecao.updateOne(
                { id_partida: partida.id_partida },
                {
                    $set: {
                        placar_geral: partida.placar_geral,
                        mapas: partida.mapas,
                        ultima_atualizacao: new Date().toISOString()
                    },
                    $push: {
                        logs_admin: {
                            acao: `registrou vitória no mapa ${mapaAtual.numero} para ${vencedor}`,
                            user_id: userId,
                            timestamp: new Date().toISOString()
                        }
                    }
                }
            );
        } else {
            await bot.telegram.sendMessage(chatId, '⚠️ O mapa está empatado. Nenhum ponto será atribuído.');
        }

        bot.context.awaitingMVP = bot.context.awaitingMVP || {};
        bot.context.awaitingMVP[userId] = {
            partidaId: partida.id_partida,
            mapaNumero: mapaAtual.numero,
            vencedor
        };

        await enviarAtualizacaoParaEspectadores(bot, partida);
        await bot.telegram.sendMessage(chatId, "⭐ Envie o nome do MVP e seu K/D (ex: KSCERATO 23/10)");
        return true;
    }

     // Comando: encerrar a partida ao vivo
    if (data === 'encerrar_partida') {
        const totalFuria = partida.mapas.reduce((acc, m) => acc + (m.placar.furia > m.placar.oponente ? 1 : 0), 0);
        const totalOponente = partida.mapas.reduce((acc, m) => acc + (m.placar.oponente > m.placar.furia ? 1 : 0), 0);
    
        let resultado;
        if (totalFuria > totalOponente) resultado = 'Vitória da FURIA';
        else if (totalFuria < totalOponente) resultado = 'Derrota da FURIA';
        else resultado = 'Empate';
    
        await encerrarSessaoAoVivo(bot, chatId, colecao, partida, resultado);
        return true;
    }

    // Comando: alterar nome do mapa atual
    if (data === 'alterar_nome_mapa') {
        bot.context.userStates[userId] = {
            step: 'ao_vivo_alterando_nome_mapa'
        };

        await bot.telegram.sendMessage(chatId, "✏️ Envie o nome do mapa atual (ex: Mirage, Nuke, Inferno):");
        return true;
    }

    // Atualiza o Mongo com novo estado do mapa (pós comando qualquer)
    await colecao.updateOne(
        { id_partida: partida.id_partida },
        {
            $set: {
                mapas: partida.mapas,
                placar_geral: partida.placar_geral,
                ultima_atualizacao: new Date().toISOString()
            }
        }
    );

     // Atualiza mensagem inline após ação
    const texto = `🌿 Placar Geral (${partida.formato}): FURIA ${partida.placar_geral.furia} 🆚 ${partida.placar_geral.oponente} ${partida.times.oponente.nome}\n\n🏝️ ${mapaAtual.numero}° Mapa (${mapaAtual.nome || 'Nome não definido'}): FURIA ${mapaAtual.placar.furia} 🆚 ${mapaAtual.placar.oponente}`;

    await bot.telegram.editMessageText(chatId, messageId, null, texto, {
        reply_markup: gerarPainelInline()
    });

    return true;
}

module.exports = {
    iniciarBroadcastEspectadores,
    handleAdminAoVivo,
    enviarAtualizacaoParaEspectadores,
    encerrarSessaoAoVivo
};
