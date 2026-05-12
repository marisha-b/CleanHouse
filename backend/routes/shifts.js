const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// Получить все смены
router.get('/', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT s.*, u.full_name as worker_name 
            FROM shifts s
            JOIN users u ON s.worker_id = u.id
            ORDER BY s.shift_date, s.start_time
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('Ошибка получения смен:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Получить смены конкретного сотрудника
router.get('/worker/:workerId', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT s.*, o.address, o.id as order_id
             FROM shifts s
             LEFT JOIN orders o ON s.order_id = o.id
             WHERE s.worker_id = $1 
             ORDER BY s.shift_date DESC, s.start_time`,
            [req.params.workerId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Ошибка получения смен сотрудника:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Добавить смену
router.post('/', async (req, res) => {
    try {
        let { worker_id, shift_date, start_time, end_time, description, order_id } = req.body;
        
        let normalizedDate = shift_date;
        if (shift_date) {
            if (shift_date.includes('T')) {
                normalizedDate = shift_date.split('T')[0];
            }
            const dateObj = new Date(shift_date);
            if (!isNaN(dateObj.getTime())) {
                normalizedDate = dateObj.getFullYear() + '-' + 
                               String(dateObj.getMonth() + 1).padStart(2, '0') + '-' + 
                               String(dateObj.getDate()).padStart(2, '0');
            }
        }
        
        const result = await pool.query(
            `INSERT INTO shifts (worker_id, shift_date, start_time, end_time, description, status, order_id) 
             VALUES ($1, $2, $3, $4, $5, 'scheduled', $6) 
             RETURNING *`,
            [worker_id, normalizedDate, start_time, end_time, description || 'Рабочая смена', order_id || null]
        );
        
        res.json({ success: true, shift: result.rows[0] });
    } catch (err) {
        console.error('Ошибка добавления смены:', err);
        res.status(500).json({ error: err.message });
    }
});

// Обновить смену
router.put('/:id', async (req, res) => {
    try {
        const { start_time, end_time, description, status } = req.body;
        const { id } = req.params;
        
        const result = await pool.query(
            `UPDATE shifts 
             SET start_time = COALESCE($1, start_time),
                 end_time = COALESCE($2, end_time),
                 description = COALESCE($3, description),
                 status = COALESCE($4, status)
             WHERE id = $5 
             RETURNING *`,
            [start_time, end_time, description, status, id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Смена не найдена' });
        }
        
        res.json({ success: true, shift: result.rows[0] });
    } catch (err) {
        console.error('Ошибка обновления смены:', err);
        res.status(500).json({ error: err.message });
    }
});

// Удалить смену
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await pool.query('DELETE FROM shifts WHERE id = $1 RETURNING *', [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Смена не найдена' });
        }
        
        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка удаления смены:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;