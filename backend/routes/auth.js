const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========

function formatPhone(phone) {
    if (!phone) return phone;
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 11 && digits.startsWith('7')) {
        return '+' + digits;
    }
    return phone;
}

function validateName(name) {
    if (!name || typeof name !== 'string') return false;
    const trimmed = name.trim();
    const nameRegex = /^[A-Za-zА-Яа-яЁё\s\-]{2,50}$/;
    return nameRegex.test(trimmed);
}

function validatePhone(phone) {
    if (!phone || typeof phone !== 'string') return false;
    const digits = phone.replace(/\D/g, '');
    if (digits.length !== 11) return false;
    if (!digits.startsWith('7')) return false;
    return true;
}

function validateEmail(email) {
    if (!email || email.trim() === '') return true;
    if (typeof email !== 'string') return false;
    const emailRegex = /^[^\s@]+@([^\s@.,]+\.)+[^\s@.,]{2,}$/;
    return emailRegex.test(email.trim());
}

function validatePassword(password) {
    if (!password || typeof password !== 'string') return false;
    const trimmed = password.trim();
    return trimmed.length >= 4 && trimmed.length <= 50;
}

// ========== ВХОД ДЛЯ СОТРУДНИКОВ ==========
router.post('/worker-login', async (req, res) => {
    try {
        const { role, phone, password } = req.body;
        
        console.log('🔐 Вход сотрудника:', { role, phone, password: '***' });
        
        if (!role || !password) {
            return res.status(400).json({ error: 'Заполните все поля' });
        }
        
        let query = '';
        let params = [];
        
        if (role === 'admin') {
            query = `SELECT id, phone, email, full_name, role, password_hash FROM users WHERE role = 'admin'`;
            params = [];
        } else if (role === 'manager') {
            query = `SELECT id, phone, email, full_name, role, password_hash FROM users WHERE role = 'manager'`;
            params = [];
        } else if (role === 'worker') {
            if (!phone) return res.status(400).json({ error: 'Телефон сотрудника обязателен' });
            // Ищем по точному совпадению телефона (без форматирования)
            query = `SELECT id, phone, email, full_name, role, password_hash FROM users WHERE role = 'worker' AND phone = $1`;
            params = [phone];
        } else {
            return res.status(400).json({ error: 'Неверная роль' });
        }
        
        const result = await pool.query(query, params);
        
        console.log(`📊 Найдено пользователей: ${result.rows.length}`);
        
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Пользователь не найден' });
        }
        
        // Проверяем пароль для каждого найденного пользователя
        let user = null;
        for (const u of result.rows) {
            console.log(`Проверка пароля для: ${u.full_name}, сохранённый пароль: "${u.password_hash}", введённый: "${password}"`);
            if (u.password_hash === password) {
                user = u;
                break;
            }
        }
        
        if (!user) {
            return res.status(401).json({ error: 'Неверный пароль' });
        }
        
        if (role === 'worker') {
            const workerCheck = await pool.query('SELECT * FROM workers WHERE user_id = $1', [user.id]);
            if (workerCheck.rows.length === 0) {
                await pool.query('INSERT INTO workers (user_id, rating, total_earnings, is_active) VALUES ($1, $2, $3, $4)', [user.id, 0, 0, true]);
            }
        }
        
        console.log(`✅ Успешный вход: ${user.full_name} (${user.role})`);
        
        res.json({ 
            success: true, 
            user: {
                id: user.id,
                name: user.full_name,
                phone: user.phone,
                email: user.email,
                role: user.role
            }
        });
    } catch (err) {
        console.error('❌ Ошибка входа сотрудника:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ========== ВХОД ДЛЯ КЛИЕНТОВ ==========
router.post('/client-login', async (req, res) => {
    try {
        let { phone, password } = req.body;
        
        console.log('🔐 Вход клиента:', { phone, password: '***' });
        
        if (!phone || !phone.trim()) {
            return res.status(400).json({ error: 'Введите телефон' });
        }
        
        if (!password || !password.trim()) {
            return res.status(400).json({ error: 'Введите пароль' });
        }
        
        const formattedPhone = formatPhone(phone);
        
        const result = await pool.query(
            `SELECT id, phone, email, full_name, role, created_at 
             FROM users 
             WHERE role = $1 AND phone = $2 AND password_hash = $3`,
            ['client', formattedPhone, password]
        );
        
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Неверный телефон или пароль' });
        }
        
        const user = result.rows[0];
        console.log(`✅ Успешный вход клиента: ${user.full_name} (${user.phone})`);
        
        res.json({ 
            success: true, 
            user: {
                id: user.id,
                name: user.full_name,
                full_name: user.full_name,
                phone: user.phone,
                email: user.email,
                role: user.role,
                created_at: user.created_at
            }
        });
    } catch (err) {
        console.error('❌ Ошибка входа клиента:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ========== РЕГИСТРАЦИЯ КЛИЕНТА ==========
router.post('/client-register', async (req, res) => {
    try {
        let { full_name, phone, email, password } = req.body;
        
        console.log('📝 Регистрация клиента:', { full_name, phone, email });
        
        // Проверка имени
        if (!full_name || full_name.trim().length < 2) {
            return res.status(400).json({ error: 'Введите корректное имя (минимум 2 символа)' });
        }
        
        // Проверка телефона
        const digits = phone.replace(/\D/g, '');
        if (digits.length !== 11) {
            return res.status(400).json({ error: 'Телефон должен содержать 11 цифр' });
        }
        if (!digits.startsWith('7')) {
            return res.status(400).json({ error: 'Телефон должен начинаться с 7' });
        }
        
        // Проверка пароля
        if (!password || password.length < 4) {
            return res.status(400).json({ error: 'Пароль должен быть не менее 4 символов' });
        }
        
        // Форматируем телефон
        const formattedPhone = formatPhone(phone);
        
        // Проверяем существование пользователя
        const existing = await pool.query('SELECT id FROM users WHERE phone = $1', [formattedPhone]);
        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'Пользователь с таким телефоном уже существует' });
        }
        
        // Проверяем email если указан
        let cleanEmail = null;
        if (email && email.trim() !== '') {
            cleanEmail = email.trim().toLowerCase();
            const existingEmail = await pool.query('SELECT id FROM users WHERE email = $1', [cleanEmail]);
            if (existingEmail.rows.length > 0) {
                return res.status(400).json({ error: 'Пользователь с таким email уже существует' });
            }
        }
        
        // Создаём пользователя
        const result = await pool.query(
            `INSERT INTO users (full_name, phone, email, password_hash, role, created_at) 
             VALUES ($1, $2, $3, $4, $5, NOW()) 
             RETURNING id, full_name, phone, email, role, created_at`,
            [full_name.trim(), formattedPhone, cleanEmail, password, 'client']
        );
        
        const user = result.rows[0];
        console.log('✅ Клиент зарегистрирован:', user);
        
        res.json({ 
            success: true, 
            user: {
                id: user.id,
                name: user.full_name,
                full_name: user.full_name,
                phone: user.phone,
                email: user.email,
                role: user.role,
                created_at: user.created_at
            }
        });
    } catch (err) {
        console.error('❌ Ошибка регистрации клиента:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ========== ПОЛУЧИТЬ ДАННЫЕ КЛИЕНТА ПО ID ==========
router.get('/client/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(
            'SELECT id, phone, email, full_name, role, created_at FROM users WHERE id = $1 AND role = $2', 
            [id, 'client']
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Клиент не найден' });
        }
        
        const user = result.rows[0];
        res.json({
            id: user.id,
            name: user.full_name,
            full_name: user.full_name,
            phone: user.phone,
            email: user.email,
            role: user.role,
            created_at: user.created_at
        });
    } catch (err) {
        console.error('❌ Ошибка получения клиента:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

module.exports = router;