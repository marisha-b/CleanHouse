const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// Получить список всех сотрудников (worker) из БД
router.get('/list', async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT id, full_name, phone FROM users WHERE role = 'worker' ORDER BY id"
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Ошибка получения списка сотрудников:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Получить статистику сотрудника
router.get('/:id/stats', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Проверяем, есть ли запись в workers
        let workerRecord = await pool.query(
            'SELECT * FROM workers WHERE user_id = $1',
            [id]
        );
        
        // Если нет записи в workers, создаем
        if (workerRecord.rows.length === 0) {
            await pool.query(
                'INSERT INTO workers (user_id, rating, total_earnings, is_active) VALUES ($1, $2, $3, $4)',
                [id, 0, 0, true]
            );
            workerRecord = await pool.query(
                'SELECT * FROM workers WHERE user_id = $1',
                [id]
            );
        }
        
        // Получаем количество выполненных заказов
        const ordersResult = await pool.query(`
            SELECT COUNT(DISTINCT o.id) as orders_count
            FROM orders o
            JOIN shifts s ON s.order_id = o.id
            WHERE s.worker_id = $1 AND o.status = 'completed'
        `, [id]);
        
        const stats = {
            rating: parseFloat(workerRecord.rows[0].rating) || 0,
            total_earnings: parseFloat(workerRecord.rows[0].total_earnings) || 0,
            orders_count: parseInt(ordersResult.rows[0].orders_count) || 0
        };
        
        res.json(stats);
    } catch (err) {
        console.error('Ошибка получения статистики сотрудника:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

module.exports = router;