// banco/database_mongo.js
require('dotenv').config();
const { MongoClient } = require('mongodb');

const uri = process.env.MONGO_URI;
const client = new MongoClient(uri);

async function conectarMongo() {
  try {
      await client.connect();
      console.log('✅ Conectado ao MongoDB');

    // Retorna o banco padrão configurado na URI ou defina diretamente:
    return client.db('furia_fanbot'); // ou client.db('db_furiafan')
  } catch (err) {
    console.error('❌ Erro ao conectar ao MongoDB:', err.message);
    process.exit(1);
  }
}

module.exports = { conectarMongo };
