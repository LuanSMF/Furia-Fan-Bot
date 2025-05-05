const mysql = require('mysql2');

module.exports = {
    // Sanitiza strings para nomes
    sanitizeName: (name) => {
        if (!name || typeof name !== 'string') return null;
        return name.trim().substring(0, 100); // Limita a 100 caracteres
    },

    // Valida IDs numéricos
    validateId: (id) => {
        const num = parseInt(id, 10);
        return isNaN(num) ? null : num;
    },

    // Sanitiza para queries SQL
    escapeSql: (value) => {
        return mysql.escape(value);
    },

    // Valida formato de data
    validateDate: (dateStr) => {
        const regex = /^(0[1-9]|[12][0-9]|3[01])\/(0[1-9]|1[0-2])\/((19|20)\d\d)$/;
        if (!regex.test(dateStr)) return null;
        
        const [day, month, year] = dateStr.split('/');
        const date = new Date(`${year}-${month}-${day}`);
        return isNaN(date.getTime()) ? null : date;
    },

    // Valida formato de hora
    validateTime: (timeStr) => {
        const regex = /^([01][0-9]|2[0-3]):([0-5][0-9])$/;
        return regex.test(timeStr) ? timeStr : null;
    },

    // Escape HTML para prevenir XSS
    escapeHtml: (unsafe) => {
        if (!unsafe) return '';
        return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    },

    // Valida se é um número inteiro positivo
    validatePositiveNumber: (num) => {
        const n = parseInt(num, 10);
        return isNaN(n) || n <= 0 ? null : n;
    }
};

