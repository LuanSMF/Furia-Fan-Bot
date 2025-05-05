// ===========================
// Início e dependências
// ===========================
console.log("Iniciando Furia Fan Bot...");

// Framework principal do bot
const { Telegraf } = require('telegraf');

// Handlers e configurações principais
const { handleMessage } = require('./funcao/mensagem'); // Handler para mensagens
const auth = require('./admin/auth'); // Módulo de autenticação
const config = require('./admin/config'); // Configurações do bot
const { iniciarBroadcastEspectadores } = require('./funcao/botao/botao_momento'); // Função para transmissões ao vivo
const { conectarMongo } = require('./banco/database_mongo');  // Conexão com MongoDB
const {verificarAceiteTermos } = require('./funcao/cadastro');
require('dotenv').config(); // Carrega variáveis de ambiente

// Importação de funções de menu
const {
    showMainMenu,
    showAdminPanel,
} = require('./funcao/menu');

// ==============================================
// VERIFICAÇÃO DE CONFIGURAÇÃO
// ==============================================
const token = config.BOT_TOKEN;
if (!token) {
    console.error('❌ Token do bot não configurado!');
    process.exit(1); // Encerra o processo se não houver token
}

// ==============================================
// INICIALIZAÇÃO DO BOT
// ==============================================
const bot = new Telegraf(token); // Cria a instância do bot
bot.context.userStates = {}; // Objeto para armazenar estados dos usuários

const registrarStart = require('./comandos/start');
registrarStart(bot); 
handleMessage(bot);  // Registra handler para mensagens normais

// Registra handlers de botões
require('./funcao/botao/botao')(bot);


// ==============================================
// FUNÇÕES AUXILIARES
// ==============================================
/**
 * Restaura transmissões ao vivo ativas ao iniciar o bot
 */  
async function restaurarBroadcast(bot) {
    const db = await conectarMongo();
    const colecao = db.collection('partidas_ao_vivo');
    // Busca partida ativa no MongoDB
    const partida = await colecao.findOne({ status: 'ao_vivo' });

    if (partida) {
        global.matchAoVivoId = partida.id_partida;
        bot.context.spectators = new Set(); // Inicia conjunto de espectadores
        iniciarBroadcastEspectadores(bot); // Reinicia a transmissão
        console.log(`📡 Broadcast reativado automaticamente para a partida ${partida.id_partida}`);
    } else {
        console.log('ℹ️ Nenhuma partida ao vivo encontrada ao iniciar o bot.');
    }
}


// ===========================
// Inicialização E GERENCIAMENTO DO BOT
// ===========================
bot.launch()
    .then(() => {
        console.log('✅ Bot iniciado com Telegraf');
        restaurarBroadcast(bot); // Restaura broadcasts ativos
    })
    .catch((error) => {
        console.error('❌ Falha ao iniciar o bot:', error.message);
    });

// ===========================
// Tratamento de erros
// ===========================
bot.catch((err, ctx) => {
    console.error('Erro no bot:', err.message);
});

// Encerramento seguro com SIGINT (Ctrl+C)
process.once('SIGINT', () => {
    console.log('Encerrando bot...');
    bot.stop('SIGINT'); // Desliga o bot corretamente
    process.exit();  // Encerra o processo
}); 

// Encerramento seguro com SIGTERM
process.once('SIGTERM', () => {
    console.log('Encerrando bot...');
    bot.stop('SIGTERM'); // Desliga o bot corretamente
    process.exit(); // Encerra o processo
});
