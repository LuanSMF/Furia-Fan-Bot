const { conectarMongo } = require('../banco/database_mongo');
const { pool } = require('../banco/database');
const security = require('../admin/security');
const auth = require('../admin/auth');
const { handleAdminAoVivo, encerrarSessaoAoVivo } = require('./botao/botao_momento');

//Envia um evento (texto, link, foto ou vídeo) para todos os espectadores da transmissão ao vivo.
async function enviarEventoAoVivoParaEspectadores(bot, evento) {
    if (!bot.context?.spectators?.size) return;

    for (const userId of bot.context.spectators) {
        try {
            switch (evento.tipo) {
                case 'texto':
                    await bot.telegram.sendMessage(userId, `🎯 ${evento.texto}`);
                    break;
                case 'link':
                    await bot.telegram.sendMessage(userId, `🔗 ${evento.url}`);
                    break;
                case 'foto':
                    if (!evento.file_id) {
                        await bot.telegram.sendMessage(userId, `❌ Erro: file_id ausente para a foto`);
                    } else {
                        await bot.telegram.sendPhoto(userId, evento.file_id, {
                            caption: evento.legenda || 'Foto ao vivo'
                        });
                    }
                    break;
                case 'video':
                    await bot.telegram.sendVideo(userId, evento.file_id, {
                        caption: evento.legenda || undefined
                    });
                    break;
            }
        } catch (e) {
            console.warn(`❌ Erro ao enviar evento para ${userId}:`, e.message);
        }
    }
}

/**
 * Manipula mensagens relacionadas a partidas ao vivo, incluindo:
 * - Alteração do nome do mapa
 * - Registro de MVP (Melhor Jogador)
 * - Envio de eventos (texto, mídia, links) para espectadores
 */
module.exports = async function handleAoVivoMensagem(bot, ctx) {
    const chatId = ctx.chat.id;
    const userId = ctx.from.id;
    const text = ctx.message.text?.trim();

    //Verifica permissões eestado do usuário
    const isAdmin = auth.authenticateWithUserId(userId);
    const state = bot.context.userStates?.[userId];
    const isAwaitingMap = state?.step === 'ao_vivo_alterando_nome_mapa';
    const mapaNumero = state?.mapaNumero || 1;
    const isAwaitingMVP = bot.context.awaitingMVP?.[userId];
    const isAoVivoAtivo = bot.context.adminAoVivo?.[userId];

    //Se não estiver em nenhumestado relevante,ignora a mensagem
    if (!isAwaitingMap && !isAwaitingMVP && !isAoVivoAtivo) return false;

    // Busca a partida no MongoDB
    const db = await conectarMongo();
    const colecao = db.collection('partidas_ao_vivo');
    const partida = await colecao.findOne({ id_partida: global.matchAoVivoId });

    if (!partida) {
        await ctx.telegram.sendMessage(chatId, '❌ Partida ao vivo não encontrada ❌');
        return true;
    }

    // Verifica status no banco relacional (MySQL)
    const [rows] = await pool.query(
        'SELECT id_status FROM tb_matches WHERE id_matches = ? LIMIT 1',
        [partida.id_partida]
    );

    const partidaRelacional = rows[0];
    if (!partidaRelacional || partidaRelacional.id_status === 3) {
        await ctx.telegram.sendMessage(chatId, '⚠️ A partida já foi ENCERRADA. Nenhuma alteração é permitida.');
        return true;
    }

    const mapaAtual = partida.mapas[partida.mapas.length - 1];

     // Fluxo 1: Alteração do nome do mapa
    if (isAwaitingMap) {
        const novoNome = security.sanitizeName(text);
        if (!novoNome || novoNome.length < 3) {
            await ctx.telegram.sendMessage(chatId, '❌ Nome do mapa muito curto ou inválido ❌');
            return true;
        }

        const indexMapa = partida.mapas.findIndex(m => m.numero === mapaNumero);
        if (indexMapa === -1) {
            await ctx.telegram.sendMessage(chatId, "❌ Mapa não encontrado para alterar o nome.");
            return true;
        }

        partida.mapas[indexMapa].nome = novoNome;
        if (mapaNumero === 1) delete bot.context.userStates['aguardando_primeiro_mapa'];
        delete bot.context.userStates[userId];

        await colecao.updateOne(
            { id_partida: partida.id_partida },
            {
                $set: {
                    mapas: partida.mapas,
                    ultima_atualizacao: new Date().toISOString()
                },
                $push: {
                    logs_admin: {
                        acao: `alterou o nome do mapa ${mapaNumero} para '${novoNome}'`,
                        user_id: userId,
                        timestamp: new Date().toISOString()
                    }
                }
            }
        );

        await ctx.telegram.sendMessage(chatId, `✅ Nome do mapa atualizado para: <b>${security.escapeHtml(novoNome)}</b>`, {
            parse_mode: 'HTML'
        });

        await enviarEventoAoVivoParaEspectadores(bot, {
            tipo: 'texto',
            texto: `🗼 O nome do mapa ${mapaNumero} foi atualizado para: ${novoNome}`
        });

        await handleAdminAoVivo(bot, chatId, ctx.message.message_id, userId, isAdmin, 'ao_vivo_painel', {
            id: ctx.callbackQuery?.id || null
        });
        return true;
    }

    // Fluxo 2: Registro de MVP (Melhor Jogador)
    if (isAwaitingMVP) {
        const match = text.match(/^([A-Za-z0-9_]+)\s+(\d{1,3})\/(\d{1,3})$/);
        if (!match) {
            await ctx.telegram.sendMessage(chatId, '❌ Formato inválido. Use: Nome K/D (ex: KSCERATO 23/10)');
            return true;
        }

        const [, nome, killsStr, deathsStr] = match;
        const kills = parseInt(killsStr);
        const deaths = parseInt(deathsStr);
        const rating = deaths === 0 ? kills.toFixed(2) : (kills / deaths).toFixed(2);

        const partidaId = bot.context.awaitingMVP[userId]?.partidaId;
        const mapaNumero = bot.context.awaitingMVP[userId]?.mapaNumero;

        if (!partidaId || mapaNumero === undefined) {
            await ctx.telegram.sendMessage(chatId, "❌ Informações de contexto perdidas. Tente novamente.");
            return true;
        }

        const indexMapa = partida.mapas.findIndex(m => m.numero === mapaNumero);
        if (indexMapa === -1) {
            await ctx.telegram.sendMessage(chatId, "❌ Mapa não encontrado para registrar o MVP.");
            return true;
        }

        partida.mapas[indexMapa].mvp = { nome, kd: `${kills}/${deaths}`, rating };

        await colecao.updateOne(
            { id_partida: partidaId },
            {
                $set: {
                    mapas: partida.mapas,
                    ultima_atualizacao: new Date().toISOString()
                },
                $push: {
                    logs_admin: {
                        acao: `definiu MVP do mapa ${mapaNumero} como ${nome} (${kills}/${deaths}, rating ${rating})`,
                        user_id: userId,
                        timestamp: new Date().toISOString()
                    }
                }
            }
        );

        delete bot.context.awaitingMVP[userId];

        const mensagem = `⭐ MVP !\n\n👤 ${nome}\n🌫️ K/D: ${kills}/${deaths}\n📊 Rating: ${rating}`;
        await ctx.telegram.sendMessage(chatId, mensagem);
        await enviarEventoAoVivoParaEspectadores(bot, { tipo: 'texto', texto: mensagem });

        const totalMapas = { MD1: 1, MD3: 3, MD5: 5 }[partida.formato] || 1;
        const mapasJogador = partida.mapas.length;
        const totalFuria = partida.placar_geral.furia;
        const totalOponente = partida.placar_geral.oponente;

        if (mapasJogador >= totalMapas && totalFuria !== totalOponente) {
            const resultado = totalFuria > totalOponente ? 'Vitória da Furia' : 'Derrota da Furia';
            await encerrarSessaoAoVivo(bot, chatId, colecao, partida, resultado);
            return true;
        }

        if (mapasJogador < totalMapas) {
            const novoMapa = {
                numero: partida.mapas.length + 1,
                placar: { furia: 0, oponente: 0 },
                mvp: null,
                eventos: []
            };
            partida.mapas.push(novoMapa);
            await colecao.updateOne({ id_partida: partida.id_partida }, { $set: { mapas: partida.mapas } });
            bot.context.userStates[userId] = {
                step: 'ao_vivo_alterando_nome_mapa',
                mapaNumero: novoMapa.numero
            };
            await ctx.telegram.sendMessage(chatId, `✏️ Envie o nome do ${novoMapa.numero}º mapa (ex: Mirage, Nuke, Inferno):`);
        }
        return true;
    }

    // Fluxo 3: Envio de eventos ao vivo (texto, mídia, links)
    if (isAoVivoAtivo && isAdmin) {
        const evento = {
            user_id: userId,
            timestamp: new Date().toISOString()
        };

        if (ctx.message.photo?.length) {
            const photo = ctx.message.photo[ctx.message.photo.length - 1];
            evento.tipo = 'foto';
            evento.file_id = photo.file_id;
            evento.legenda = ctx.message.caption || null;
        } else if (ctx.message.video) {
            evento.tipo = 'video';
            evento.file_id = ctx.message.video.file_id;
            evento.legenda = ctx.message.caption || null;
        } else if (/^https?:\/\//i.test(text)) {
            evento.tipo = 'link';
            evento.url = text;
        } else {
            evento.tipo = 'texto';
            evento.texto = text;
        }

        mapaAtual.eventos.push(evento);

        await colecao.updateOne(
            { id_partida: partida.id_partida },
            {
                $set: {
                    mapas: partida.mapas,
                    ultima_atualizacao: new Date().toISOString()
                },
                $push: {
                    logs_admin: {
                        acao: `registrou evento tipo: ${evento.tipo}`,
                        user_id: userId,
                        timestamp: new Date().toISOString()
                    }
                }
            }
        );

        await ctx.telegram.sendMessage(chatId, `✅ Evento do tipo <b>${evento.tipo}</b> registrado.`, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [[{ text: '🔄 Reabrir Painel', callback_data: 'ao_vivo_painel' }]]
            }
        });

        await enviarEventoAoVivoParaEspectadores(bot, evento);
        return true;
    }

    return false;
};
