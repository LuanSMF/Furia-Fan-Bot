const { pool } = require('../banco/database');
const { conectarMongo } = require('../banco/database_mongo');

async function verificarPartidasAoVivo(bot) {
    // Função que verifica partidas ao vivo a cada 1 minuto
    try {
        const agora = new Date();

        // Busca partidas com status diferente de encerrado (3), com data de hoje e com controle de tempo ativado
        const [partidas] = await pool.query(`
            SELECT m.id_matches, m.dt_match, m.dt_time, m.id_status, m.id_formato, 
                   t.nm_name AS team_name, t.id_teams AS id_oponente
            FROM tb_matches m
            JOIN tb_multivalorado mv ON m.id_multivalorado = mv.id_multivalorado
            JOIN tb_teams t ON mv.id_teams = t.id_teams
            WHERE m.dt_match = CURDATE()
              AND m.bl_tempo = 1
              AND m.id_status != 3
        `);

        console.log(`🔍 ${partidas.length} partidas encontradas para hoje`);

        const db = await conectarMongo();
        const colecao = db.collection('partidas_ao_vivo');

        for (const partida of partidas) {
            // Formata data e hora da partida para comparar com o momento atual
            const dataISO = partida.dt_match.toISOString().split('T')[0];
            const hora = partida.dt_time instanceof Date
                ? partida.dt_time.toTimeString().slice(0, 8)
                : String(partida.dt_time).padEnd(8, ':00');

            const horaPartida = new Date(`${dataISO}T${hora}`);
            const diffMin = (horaPartida - agora) / 60000;

            console.log(`🕒 Agora: ${agora.toISOString()}`);
            console.log(`🕒 Partida: ${horaPartida.toISOString()}`);
            console.log(`📏 Diferença em minutos: ${diffMin}`);

            // Se a partida estiver a 1 minuto de iniciar ou em andamento até 200 minutos, inicia o modo ao vivo
            if (diffMin <= 1 && diffMin >= -200) {
                const partidaExistente = await colecao.findOne({ id_partida: partida.id_matches });
                const [statusRows] = await pool.query(
                    'SELECT id_status FROM tb_matches WHERE id_matches = ?',
                    [partida.id_matches]
                );

                const statusAtual = statusRows[0]?.id_status;

                console.log('🔍 Verificando partida:', partida.id_matches);
                console.log('Status no MySQL:', statusAtual);  
                console.log('Partida existente no MongoDB:', !!partidaExistente); 
                console.log('Condição matchAoVivoId:', global.matchAoVivoId === partida.id_matches);

                // Se a partida já estiver no Mongo ou com status ao vivo, ignora
                if (statusAtual === 2 || (partidaExistente && global.matchAoVivoId === partida.id_matches)) {
                    if (global.matchAoVivoId === partida.id_matches) {
                        console.log(`ℹ️ Partida #${partida.id_matches} já está ativa.`);
                        continue;
                    }

                    // Envia aviso se outra partida estiver ao vivo
                    if (!bot.context._avisouPartidaAoVivo) {
                        bot.context._avisouPartidaAoVivo = true;
                        if (bot?.context?.adminAoVivo) {
                            for (const adminId of Object.keys(bot.context.adminAoVivo)) {
                                await bot.telegram.sendMessage(adminId, "⚠️ Já existe uma partida AO VIVO em andamento. Encerre-a antes de iniciar outra.");
                            }
                        }
                    }
                    continue;
                }

                // Atualiza status da partida para ao vivo (2)
                if (statusAtual !== 2 && statusAtual !== 3) {
                    console.log(`Tentando atualizar status da partida #${partida.id_matches}`);
                    const [resultadoUpdate] = await pool.query(
                        'UPDATE tb_matches SET id_status = 2 WHERE id_matches = ?',
                        [partida.id_matches]
                    );
                    console.log(`📝 Linhas afetadas no UPDATE: ${resultadoUpdate.affectedRows}`);
                }

                // Cria documento no MongoDB representando o início da partida
                const formatos = { 1: 'MD1', 2: 'MD3', 3: 'MD5' };
                const formato = formatos[partida.id_formato] || 'MD1';

                const doc = {
                    id_partida: partida.id_matches,
                    formato,
                    mapa_atual: '',
                    mapas: [{
                        numero: 1,
                        nome: null,
                        placar: { furia: 0, oponente: 0 },
                        mvp: null,
                        eventos: []
                    }],
                    placar_geral: { furia: 0, oponente: 0 },
                    mvp_serie: null,
                    times: {
                        furia: { id: 0, nome: "FURIA" },
                        oponente: { id: partida.id_oponente, nome: partida.team_name }
                    },
                    logs_admin: [{
                        acao: "partida iniciada automaticamente",
                        user_id: 0,
                        timestamp: new Date().toISOString()
                    }],
                    ultima_atualizacao: new Date().toISOString()
                };

                await colecao.insertOne(doc);
                console.log(`🟢 Documento da partida #${partida.id_matches} criado no MongoDB`);

                global.partidaAoVivo = true;
                global.matchAoVivoId = partida.id_matches;
                console.log(`🔥 Modo AO VIVO ativado para a partida #${partida.id_matches}`);
            }
        }
    } catch (error) {
        console.error('❌ Erro ao verificar partidas ao vivo:', error);
    }
}

function iniciarMonitorAoVivo(bot) {
    setInterval(() => verificarPartidasAoVivo(bot), 60000);
}

async function restaurarPartidaAoVivo() {
    try {
        const [rows] = await pool.query('SELECT id_matches FROM tb_matches WHERE id_status = 2 LIMIT 1');

        if (!rows.length) {
            global.partidaAoVivo = false;
            global.matchAoVivoId = null;
            console.log('ℹ️ Nenhuma partida ao vivo ativa no MySQL para restaurar.');
            return;
        }

        const idPartida = rows[0].id_matches;
        const db = await conectarMongo();
        const colecao = db.collection('partidas_ao_vivo');
        const partida = await colecao.findOne({ id_partida: idPartida });

        if (partida) {
            global.partidaAoVivo = true;
            global.matchAoVivoId = idPartida;
            console.log(`🔁 Sessão AO VIVO restaurada para a partida #${idPartida}`);
        } else {
            await pool.query('UPDATE tb_matches SET id_status = 3 WHERE id_matches = ?', [idPartida]);
            global.partidaAoVivo = false;
            global.matchAoVivoId = null;
            console.warn(`⚠️ Partida #${idPartida} com status AO VIVO não encontrada no MongoDB. Status corrigido para 3.`);
        }
    } catch (err) {
        console.error('❌ Erro ao restaurar sessão ao vivo:', err.message);
    }
}

async function exibirHistoricoPartida(bot, chatId, idPartida) {
    const [rows] = await pool.query(
        'SELECT id_matches, dt_match, dt_time, id_formato, id_status FROM tb_matches WHERE id_matches = ?',
        [idPartida]
    );
    const info = rows[0];

    const mongo = await conectarMongo();
    const colecao = mongo.collection('partidas_ao_vivo');
    const partida = await colecao.findOne({ id_partida: idPartida });

    if (!partida || !info || info.id_status !== 3) {
        return bot.telegram.sendMessage(chatId, "❌ Histórico indisponível para esta partida.");
    }

    await bot.telegram.sendMessage(chatId, `📜 Histórico da partida #${idPartida}\n🗓️ Data: ${info.dt_match.toISOString().split('T')[0]}\n🕒 Horário: ${info.dt_time}\n📌 Formato: ${partida.formato}\n🏁 Status: ENCERRADA`);

    for (const mapa of partida.mapas) {
        await bot.telegram.sendMessage(chatId, `🎯 Mapa ${mapa.numero} - ${mapa.nome || 'Sem nome definido'}`);
        for (const evento of mapa.eventos) {
            if (evento.tipo === 'texto') await bot.telegram.sendMessage(chatId, `📝 ${evento.texto}`);
            else if (evento.tipo === 'link') await bot.telegram.sendMessage(chatId, `🔗 ${evento.url}`);
            else if (evento.tipo === 'foto') await bot.telegram.sendPhoto(chatId, evento.file_id, { caption: evento.legenda || '' });
            else if (evento.tipo === 'video') await bot.telegram.sendVideo(chatId, evento.file_id, { caption: evento.legenda || '' });
        }
    }
}

async function mostrarPartidasEncerradas(bot, chatId) {
    const [partidas] = await pool.query(`
        SELECT m.id_matches, m.dt_match, m.id_formato, t.nm_name AS adversario
        FROM tb_matches m
        JOIN tb_multivalorado mv ON m.id_multivalorado = mv.id_multivalorado
        JOIN tb_teams t ON mv.id_teams = t.id_teams
        WHERE m.id_status = 3
        ORDER BY m.dt_match DESC
        LIMIT 5
    `);

    if (!partidas.length) {
        return bot.telegram.sendMessage(chatId, '📭 Nenhuma partida encerrada encontrada.');
    }

    for (const partida of partidas) {
        const texto = `🗓️ ${partida.dt_match.toISOString().split('T')[0]} | 🆚 Furia vs ${partida.adversario}\n📌 Formato: ${['', 'MD1', 'MD3', 'MD5'][partida.id_formato] || 'Desconhecido'}`;
        await bot.telegram.sendMessage(chatId, texto, {
            reply_markup: {
                inline_keyboard: [[
                    { text: '📄 Ver Resumo', callback_data: `ver_resumo_${partida.id_matches}` },
                    { text: '🧾 Ver Tudo que Rolou', callback_data: `ver_eventos_${partida.id_matches}` }
                ]]
            }
        });
    }
}

async function exibirResumoPartida(bot, chatId, idPartida) {
    const [rows] = await pool.query(
        'SELECT id_matches, dt_match, dt_time, id_formato, id_status FROM tb_matches WHERE id_matches = ?',
        [idPartida]
    );
    const info = rows[0];
    const mongo = await conectarMongo();
    const colecao = mongo.collection('partidas_ao_vivo');
    const partida = await colecao.findOne({ id_partida: idPartida });

    if (!partida || !info || info.id_status !== 3) {
        return bot.telegram.sendMessage(chatId, "❌ Resumo indisponível para esta partida.");
    }

    const nomeOponente = partida.times?.oponente?.nome || 'Adversário';
    const formato = partida.formato || 'Desconhecido';
    const pf = partida.placar_geral.furia;
    const po = partida.placar_geral.oponente;
    const resultado = pf > po ? '🏆 FURIA venceu a série!' : pf < po ? `🏆 ${nomeOponente} venceu a série!` : '🤝 Empate na série!';

    let texto = `📋 <b>Resumo da Partida</b>\n`;
    texto += `🆚 Furia vs ${nomeOponente}\n`;
    texto += `📅 ${info.dt_match.toISOString().split('T')[0]} às ${info.dt_time}\n`;
    texto += `📌 Formato: ${formato}\n\n`;
    texto += `🏁 <b>Placar Final:</b> Furia ${pf} x ${po} ${nomeOponente}\n${resultado}\n\n`;

    for (const mapa of partida.mapas) {
        const nome = mapa.nome || 'Indefinido';
        const mpf = mapa.placar?.furia ?? 0;
        const mpo = mapa.placar?.oponente ?? 0;
        const vencedor = mpf > mpo ? '🖤 Furia venceu o mapa' : mpo > mpf ? `🏴‍☠️ ${nomeOponente} venceu o mapa` : '🏳️ Empate no mapa';
        texto += `🎯 <b>Mapa ${mapa.numero}</b> - ${nome}\n`;
        texto += `🔢 Placar: Furia ${mpf} x ${mpo} ${nomeOponente}\n`;
        texto += `🏅 ${vencedor}\n`;
        texto += mapa.mvp ? `⭐ MVP: ${mapa.mvp.nome} (${mapa.mvp.kd}, Rating ${mapa.mvp.rating})\n` : `⭐ MVP: Não definido\n`;
        texto += `\n`;
    }

    await bot.telegram.sendMessage(chatId, texto, { parse_mode: 'HTML' });
}

module.exports = {
    iniciarMonitorAoVivo,
    verificarPartidasAoVivo,
    restaurarPartidaAoVivo,
    exibirHistoricoPartida,
    mostrarPartidasEncerradas,
    exibirResumoPartida
};
