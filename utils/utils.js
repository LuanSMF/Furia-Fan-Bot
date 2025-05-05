// utils.js
//Formata uma string de data para o padrão brasileiro (DD/MM/AAAA).
function formatDate(dateString) {
  // Se a string estiver vazia ou undefined, retorna mensagem padrão
  if (!dateString) return 'Data não definida';

  // Converte a string para um objeto Date
  const date = new Date(dateString);

  // Verifica se a data é inválida
  return isNaN(date.getTime()) 
    ? 'Data inválida' 
    // Formata a data no padrão brasileiro (DD/MM/AAAA)
    : date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
}

//formata a hora em por ex:14:30
function formatTime(timeString) {
  if (!timeString) return '';
  
  const parts = timeString.split(':');
  const hour = parts[0]?.padStart(2, '0');
  const minute = parts[1]?.padStart(2, '0');

  if (!hour || !minute || isNaN(hour) || isNaN(minute)) {
      return 'Horário inválido';
  }

  return `${hour}:${minute}`;
}

//Divide um array em subarrays (chunks) de tamanho fixo.
function chunkArray(array, size) {
  const chunked = [];
  for (let i = 0; i < array.length; i += size) {
      chunked.push(array.slice(i, i + size));
  }
  return chunked;
}

module.exports = { formatDate,chunkArray, formatTime};