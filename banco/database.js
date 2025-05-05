// database.js
require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Teste de conexão automático
pool.getConnection()
  .then(connection => {
    console.log('✅ Conexão com o banco estabelecida com sucesso');
    connection.release();
  })
  .catch(err => {
    console.error('❌ Erro ao conectar ao banco:', err.message);
    process.exit(1); // Encerra o processo se não conseguir conectar
  });

/**
 * Obtém todos os torneios do banco de dados
 * @returns {Promise<Array>} Lista de torneios
 */
async function getTournamentsFromDB() {
  try {
    const [rows] = await pool.query('SELECT id_tournaments, nm_name FROM tb_tournaments ORDER BY nm_name');
    return rows;
  } catch (error) {
    console.error('Erro ao buscar torneios:', error);
    throw error;
  }
}

/**
 * Obtém times associados a um torneio (exceto FURIA)
 * @param {number} tournamentId - ID do torneio
 * @returns {Promise<Array>} Lista de times
 */
async function getTeamsByTournamentFromDB(tournamentId) {
  try {
    const [rows] = await pool.query(
      `SELECT t.id_teams, t.nm_name 
       FROM tb_teams t
       INNER JOIN tb_multivalorado m ON t.id_teams = m.id_teams
       WHERE m.id_tournaments = ? AND t.nm_name != 'FURIA'
       ORDER BY t.nm_name`, 
      [tournamentId]
    );
    return rows;
  } catch (error) {
    console.error('Erro ao buscar times:', error);
    throw error;
  }
}

/**
 * Encontra ou cria uma relação multivalorada entre time e torneio
 * @param {number} teamId - ID do time
 * @param {number} tournamentId - ID do torneio
 * @returns {Promise<number>} ID da relação multivalorada
 */
async function findOrCreateMultivalorado(teamId, tournamentId) {
  try {
      // Verifica se os IDs existem nas tabelas referenciadas
      const [tournamentExists] = await pool.query(
          'SELECT 1 FROM tb_tournaments WHERE id_tournaments = ?', 
          [tournamentId]
      );
      
      const [teamExists] = await pool.query(
          'SELECT 1 FROM tb_teams WHERE id_teams = ?',
          [teamId]
      );

      if (!tournamentExists.length) {
          throw new Error(`Torneio com ID ${tournamentId} não encontrado`);
      }

      if (!teamExists.length) {
          throw new Error(`Time com ID ${teamId} não encontrado`);
      }

      // Verifica se a relação já existe
      const [existing] = await pool.query(
          'SELECT id_multivalorado FROM tb_multivalorado WHERE id_teams = ? AND id_tournaments = ?',
          [teamId, tournamentId]
      );

      if (existing.length > 0) {
          return existing[0].id_multivalorado;
      }

      // Cria a nova relação
      const [result] = await pool.query(
          'INSERT INTO tb_multivalorado (id_teams, id_tournaments) VALUES (?, ?)',
          [teamId, tournamentId]
      );

      return result.insertId;
  } catch (error) {
      console.error('Erro ao criar relação multivalorada:', error);
      throw new Error(`Falha ao criar relação: ${error.message}`);
  }
}

//Insere uma nova partida no banco
async function insertMatch(id_multivalorado, id_formato, id_status, dt_match, dt_time,tempo) {
  try {
    const [result] = await pool.query(
      `INSERT INTO tb_matches (
         id_multivalorado, id_formato, id_status, dt_match, dt_time,bl_tempo
       ) VALUES (?, ?, ?, ?, ?, ?)`,
      [id_multivalorado, id_formato, id_status, dt_match, dt_time,tempo]
    );
    return result.insertId;
  } catch (err) {
    console.error('❌ Erro ao inserir partida:', err.message);
    throw err;
  }
}

/**
 * Obtém partidas agendadas
 * @param {string} filter - Filtro opcional (today, tomorrow, etc)
 * @returns {Promise<Array>} Lista de partidas
 */
async function getScheduledMatches(filter = null) {
  try {
    let query = `
      SELECT m.id_matches, t.nm_name as team_name, tour.nm_name as tournament_name,
             DATE_FORMAT(m.dt_match, '%d/%m/%Y') as match_date,
             DATE_FORMAT(m.dt_time, '%H:%i') as match_time
      FROM tb_matches m
      JOIN tb_multivalorado mv ON m.id_multivalorado = mv.id_multivalorado
      JOIN tb_teams t ON mv.id_teams = t.id_teams
      JOIN tb_tournaments tour ON mv.id_tournaments = tour.id_tournaments
    `;

    const params = [];
    
    if (filter === 'today') {
      query += ' WHERE m.dt_match = CURDATE()';
    } else if (filter === 'tomorrow') {
      query += ' WHERE m.dt_match = DATE_ADD(CURDATE(), INTERVAL 1 DAY)';
    }

    query += ' ORDER BY m.dt_match, m.dt_time';
    
    const [rows] = await pool.query(query, params);
    return rows;
  } catch (error) {
    console.error('Erro ao buscar partidas:', error);
    throw error;
  }
}

//Adiciona um torneio ao banco
async function addTournament(tournamentName) {
  try {
      const [result] = await pool.query(
          'INSERT INTO tb_tournaments (nm_name) VALUES (?)',
          [tournamentName]
      );
      return result.insertId;
  } catch (error) {
      console.error('Erro ao adicionar torneio:', error);
      throw error;
  }
}

//Adiciona um time ao banco e vincula a um torneio
async function addTeam(teamName, tournamentId) {
  let connection;
  try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      // 1. Verificar se o time já existe
      const [existingTeams] = await connection.query(
          'SELECT id_teams FROM tb_teams WHERE nm_name = ?',
          [teamName]
      );

      let teamId;
      
      // 2. Se o time não existir, inserir na tb_teams
      if (existingTeams.length === 0) {
          const [teamResult] = await connection.query(
              'INSERT INTO tb_teams (nm_name) VALUES (?)',
              [teamName]
          );
          teamId = teamResult.insertId;
      } else {
          teamId = existingTeams[0].id_teams;
      }

      // 3. Verificar se o relacionamento já existe
      const [existingRelations] = await connection.query(
          'SELECT id_multivalorado FROM tb_multivalorado WHERE id_teams = ? AND id_tournaments = ?',
          [teamId, tournamentId]
      );

      if (existingRelations.length > 0) {
          throw new Error('Este time já está vinculado a este torneio');
      }

      // 4. Criar o relacionamento na tabela multivalorada
      const [multivaloradoResult] = await connection.query(
          'INSERT INTO tb_multivalorado (id_teams, id_tournaments) VALUES (?, ?)',
          [teamId, tournamentId]
      );

      await connection.commit();
      
      return {
          teamId: teamId,
          multivaloradoId: multivaloradoResult.insertId,
          isNewTeam: existingTeams.length === 0
      };

  } catch (error) {
      if (connection) await connection.rollback();
      console.error('Erro ao adicionar time:', error);
      
      if (error.code === 'ER_DUP_ENTRY') {
          throw new Error('Este time já está vinculado a este torneio');
      } else {
          throw error;
      }
  } finally {
      if (connection) connection.release();
  }
}

// Retorna todas as partidas cadastradas
async function getAllMatches() {
  try {
      const [rows] = await pool.query(`
          SELECT m.id_matches,m.id_status, t.nm_name as team_name, tour.nm_name as tournament_name, 
                 m.dt_match, m.dt_time
          FROM tb_matches m
          JOIN tb_multivalorado mv ON m.id_multivalorado = mv.id_multivalorado
          JOIN tb_teams t ON mv.id_teams = t.id_teams
          JOIN tb_tournaments tour ON mv.id_tournaments = tour.id_tournaments
          ORDER BY m.dt_match, m.dt_time
      `);
      return rows;
  } catch (error) {
      console.error('Erro ao buscar partidas:', error);
      throw error;
  }
}

async function removeMatch(matchId) {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Remove do MySQL
    const [result] = await connection.query(
      'DELETE FROM tb_matches WHERE id_matches = ?',
      [matchId]
    );

    // Remove do MongoDB apenas se o match foi removido do MySQL
    if (result.affectedRows > 0) {
      const mongo = await conectarMongo();
      await mongo.collection('partidas_ao_vivo').deleteOne({ id_partida: matchId });
    }

    await connection.commit();
    return result.affectedRows > 0;
  } catch (error) {
    if (connection) await connection.rollback();
    console.error('Erro ao remover partida:', error);
    throw error;
  } finally {
    if (connection) connection.release();
  }
}

// Remove um torneio e todas as referências ligadas a ele
async function removeTournament(tournamentId) {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Primeiro remove as partidas relacionadas
    await connection.query(
      `DELETE m FROM tb_matches m
       JOIN tb_multivalorado mv ON m.id_multivalorado = mv.id_multivalorado
       WHERE mv.id_tournaments = ?`,
      [tournamentId]
    );

    // Depois remove as relações times-torneio
    await connection.query(
      'DELETE FROM tb_multivalorado WHERE id_tournaments = ?',
      [tournamentId]
    );

    // Finalmente remove o torneio
    const [result] = await connection.query(
      'DELETE FROM tb_tournaments WHERE id_tournaments = ?',
      [tournamentId]
    );

    await connection.commit();
    return result.affectedRows > 0;
  } catch (error) {
    if (connection) await connection.rollback();
    console.error('Erro ao remover torneio:', error);
    throw error;
  } finally {
    if (connection) connection.release();
  }
}

//Remove um time e todas as suas dependências
async function removeTeam(teamId) {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // 1. Remove todas as partidas relacionadas a este time
    await connection.query(
      `DELETE m FROM tb_matches m
       JOIN tb_multivalorado mv ON m.id_multivalorado = mv.id_multivalorado
       WHERE mv.id_teams = ?`,
      [teamId]
    );

    // 2. Remove todas as relações do time com torneios
    await connection.query(
      'DELETE FROM tb_multivalorado WHERE id_teams = ?',
      [teamId]
    );

    // 3. Remove o time da tabela principal
    const [result] = await connection.query(
      'DELETE FROM tb_teams WHERE id_teams = ?',
      [teamId]
    );

    await connection.commit();
    return result.affectedRows > 0;
  } catch (error) {
    if (connection) await connection.rollback();
    console.error('Erro ao remover time:', error);
    throw error;
  } finally {
    if (connection) connection.release();
  }
}

//Registra uma ação administrativa
async function logAdminAction(userId, action, details = null) {
  try {
    await pool.query(
      'INSERT INTO admin_logs (user_id, action, details) VALUES (?, ?, ?)',
      [userId, action, details ? JSON.stringify(details) : null]
    );
  } catch (error) {
    console.error('Erro ao registrar ação administrativa:', error);
  }
}

//Atualiza um campo específico de uma partida
async function updateMatchField(matchId, field, newValue) {
  try {
      const validFields = ['dt_match', 'dt_time', 'id_multivalorado'];
      if (!validFields.includes(field)) {
          throw new Error('Campo inválido para atualização');
      }
      
      const [result] = await pool.query(
          `UPDATE tb_matches SET ${field} = ? WHERE id_matches = ?`,
          [newValue, matchId]
      );
      
      return result.affectedRows > 0;
  } catch (error) {
      console.error('Erro ao atualizar partida:', error);
      throw error;
  }
}

//Atualiza o nome de um torneio
async function updateTournament(tournamentId, newName) {
  try {
      const [result] = await pool.query(
          'UPDATE tb_tournaments SET nm_name = ? WHERE id_tournaments = ?',
          [newName, tournamentId]
      );
      return result.affectedRows > 0;
  } catch (error) {
      console.error('Erro ao atualizar competição:', error);
      throw error;
  }
}

//Atualiza o nome de um time, exceto se for FURIA(Furia nao é salvo no banco pois é um nome constante,sempre  será  ela X alguem)
async function updateTeam(teamId, newName) {
  try {
      // Verifica se o time é a FURIA (não deve ser renomeado)
      const [currentTeam] = await pool.query(
          'SELECT nm_name FROM tb_teams WHERE id_teams = ?',
          [teamId]
      );
      
      if (currentTeam[0].nm_name === 'FURIA') {
          throw new Error('Não é permitido renomear a FURIA');
      }

      const [result] = await pool.query(
          'UPDATE tb_teams SET nm_name = ? WHERE id_teams = ?',
          [newName, teamId]
      );
      return result.affectedRows > 0;
  } catch (error) {
      console.error('Erro ao atualizar time:', error);
      throw error;
  }
}

// Exporta todas as funções e o pool
module.exports = {
  pool,
  getTournamentsFromDB,
  getTeamsByTournamentFromDB,
  findOrCreateMultivalorado,
  insertMatch,
  getScheduledMatches,
  addTournament,
  addTeam,
  removeMatch,
  getAllMatches,
  removeTournament,
  removeTeam,
  updateMatchField ,
  updateTournament,
  updateTeam,
  logAdminAction
};