const { MongoClient } = require('mongodb');

async function verPartidas() {
    const client = new MongoClient('mongodb://localhost:27017');
    await client.connect();
    const db = client.db('furiafan'); // substitua pelo nome real
    const partidas = await db.collection('partidas_ao_vivo').find().toArray();
    console.log(partidas);
    await client.close();
}

verPartidas();