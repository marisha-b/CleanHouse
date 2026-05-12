const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// Вспомогательная функция для форматирования телефона
function formatPhone(phone) {
    if (!phone) return phone;
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 11 && digits.startsWith('7')) {
        return '+' + digits;
    }
    return phone;
}

// Получить только сотрудников (worker, manager, admin) - НЕ клиентов
router.get('/', async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT id, phone, full_name, role FROM users WHERE role IN ('worker', 'manager', 'admin') ORDER BY id"
        );
        console.log(`👥 Найдено сотрудников: ${result.rows.length}`);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Получить пользователя по ID
router.get('/:id', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, phone, full_name, role FROM users WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Добавить пользователя (только сотрудника)
router.post('/', async (req, res) => {
    try {
        const { full_name, phone, role, password } = req.body;
        
        console.log('📝 Добавление пользователя:', { full_name, phone, role, password: password ? '***' : 'ОТСУТСТВУЕТ' });
        
        // Проверяем, что все поля заполнены
        if (!full_name || full_name.trim() === '') {
            return res.status(400).json({ error: 'Введите имя' });
        }
        
        if (!phone || phone.trim() === '') {
            return res.status(400).json({ error: 'Введите телефон' });
        }
        
        if (!password || password.trim() === '') {
            return res.status(400).json({ error: 'Введите пароль' });
        }
        
        if (password.trim().length < 4) {
            return res.status(400).json({ error: 'Пароль должен быть не менее 4 символов' });
        }
        
        // Проверяем, что роль не 'client'
        if (role === 'client') {
            return res.status(400).json({ error: 'Нельзя добавлять клиентов через эту форму' });
        }
        
        // Проверяем допустимые роли
        if (!['worker', 'manager', 'admin'].includes(role)) {
            return res.status(400).json({ error: 'Неверная роль' });
        }
        
        // Форматируем телефон
        const formattedPhone = formatPhone(phone);
        
        // Проверяем, не существует ли уже такой телефон
        const existing = await pool.query('SELECT id FROM users WHERE phone = $1', [formattedPhone]);
        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'Пользователь с таким телефоном уже существует' });
        }
        
        // Добавляем пользователя
        const result = await pool.query(
            'INSERT INTO users (full_name, phone, password_hash, role, created_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING id, full_name, phone, role',
            [full_name.trim(), formattedPhone, password.trim(), role]
        );
        
        const newUser = result.rows[0];
        
        // Если это сотрудник (worker), создаём запись в таблице workers
        if (role === 'worker') {
            await pool.query(
                'INSERT INTO workers (user_id, rating, total_earnings, is_active) VALUES ($1, $2, $3, $4)',
                [newUser.id, 0, 0, true]
            );
            console.log(`✅ Сотрудник добавлен: ${newUser.full_name}`);
        } else {
            console.log(`✅ ${role === 'manager' ? 'Менеджер' : 'Администратор'} добавлен: ${newUser.full_name}`);
        }
        
        res.json(newUser);
    } catch (err) {
        console.error('❌ Ошибка добавления пользователя:', err);
        res.status(500).json({ error: err.message });
    }
});

// Обновить пользователя
router.put('/:id', async (req, res) => {
    try {
        const { full_name, phone, role, password } = req.body;
        const { id } = req.params;
        
        console.log('✏️ Обновление пользователя:', { id, full_name, phone, role, password: password ? '***' : 'не меняется' });
        
        // Не даём изменить роль на client
        if (role === 'client') {
            return res.status(400).json({ error: 'Нельзя изменить роль на клиента' });
        }
        
        // Получаем старую роль
        const oldUser = await pool.query('SELECT role FROM users WHERE id = $1', [id]);
        if (oldUser.rows.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        
        // Форматируем телефон если он передан
        const formattedPhone = phone ? formatPhone(phone) : null;
        
        if (password && password.trim() !== '') {
            // Обновляем с паролем
            await pool.query(
                'UPDATE users SET full_name=$1, phone=$2, password_hash=$3, role=$4 WHERE id=$5',
                [full_name, formattedPhone, password.trim(), role, id]
            );
        } else {
            // Обновляем без пароля
            await pool.query(
                'UPDATE users SET full_name=$1, phone=$2, role=$3 WHERE id=$4',
                [full_name, formattedPhone, role, id]
            );
        }
        
        // Если роль изменилась на worker, создаём запись в workers
        if (role === 'worker' && oldUser.rows[0]?.role !== 'worker') {
            await pool.query(
                'INSERT INTO workers (user_id, rating, total_earnings, is_active) VALUES ($1, $2, $3, $4) ON CONFLICT (user_id) DO NOTHING',
                [id, 0, 0, true]
            );
        }
        
        console.log(`✅ Пользователь ${id} обновлён`);
        res.json({ success: true });
    } catch (err) {
        console.error('❌ Ошибка обновления пользователя:', err);
        res.status(500).json({ error: err.message });
    }
});

// Удалить пользователя
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        console.log(`🗑️ Удаление пользователя: ${id}`);
        
        // Проверяем, что удаляем не клиента
        const userCheck = await pool.query('SELECT role FROM users WHERE id = $1', [id]);
        if (userCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        if (userCheck.rows[0].role === 'client') {
            return res.status(400).json({ error: 'Нельзя удалять клиентов' });
        }
        
        // Сначала удаляем запись из workers (если есть)
        await pool.query('DELETE FROM workers WHERE user_id = $1', [id]);
        // Потом удаляем пользователя
        await pool.query('DELETE FROM users WHERE id = $1', [id]);
        
        console.log(`✅ Пользователь ${id} удалён`);
        res.json({ success: true });
    } catch (err) {
        console.error('❌ Ошибка удаления пользователя:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;