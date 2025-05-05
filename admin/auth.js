const config = require('./config');
const sessions = {};

// Funções de autenticação
function isAuthenticated(chatId) {
    return sessions[chatId] && sessions[chatId].authenticated;
}

// Verifica se o userId está na lista de administradores permitidos (config.ADMIN_USER_IDS)
function authenticateWithUserId(userId) {
    return config.ADMIN_USER_IDS.includes(userId);
}

// Verifica se a sessão do chat ainda está válida
function checkAuth(chatId) {
    const session = sessions[chatId];  // Recupera a sessão associada ao chatId
    if (!session) return false; // Se não existir sessão, o usuário não está autenticado

    // Verifica se a sessão já expirou
    if (session.expiresAt < Date.now()) {
        logout(chatId); // Se expirou, faz logout limpando a sessão
        return false;  // Retorna falso pois a sessão não é mais válida
    }

    return true; // Sessão válida
}

module.exports = {
    isAuthenticated,
    authenticateWithUserId,
    checkAuth,
};
