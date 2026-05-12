const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// Получить все отзывы
router.get('/', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM reviews ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        console.error('Ошибка получения отзывов:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Получить отзывы клиента по ID клиента
router.get('/client/:clientId', async (req, res) => {
    try {
        const { clientId } = req.params;
        const result = await pool.query(
            'SELECT * FROM reviews WHERE client_id = $1 ORDER BY created_at DESC',
            [clientId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Ошибка получения отзывов клиента:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Получить отзывы на работу сотрудника
router.get('/worker/:workerId', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT r.*, o.address
            FROM reviews r
            JOIN orders o ON r.order_id = o.id
            JOIN shifts s ON s.order_id = o.id
            WHERE s.worker_id = $1
            ORDER BY r.created_at DESC
        `, [req.params.workerId]);
        res.json(result.rows);
    } catch (err) {
        console.error('Ошибка получения отзывов сотрудника:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Проверить, есть ли уже отзыв от клиента на заказ
router.get('/check', async (req, res) => {
    try {
        const { order_id, client_id } = req.query;
        
        if (!order_id || !client_id) {
            return res.json(null);
        }
        
        const result = await pool.query(
            'SELECT * FROM reviews WHERE order_id = $1 AND client_id = $2',
            [order_id, client_id]
        );
        
        if (result.rows.length > 0) {
            res.json(result.rows[0]);
        } else {
            res.json(null);
        }
    } catch (err) {
        console.error('Ошибка проверки отзыва:', err);
        res.status(500).json({ error: err.message });
    }
});

// Добавить отзыв
router.post('/', async (req, res) => {
    try {
        const { order_id, client_id, rating, comment } = req.body;
        
        // Проверяем, не существует ли уже отзыв
        const existing = await pool.query(
            'SELECT id FROM reviews WHERE order_id = $1 AND client_id = $2',
            [order_id, client_id]
        );
        
        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'Отзыв уже существует' });
        }
        
        const result = await pool.query(
            'INSERT INTO reviews (order_id, client_id, rating, comment, created_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING *',
            [order_id, client_id, rating, comment]
        );
        
        // Обновляем рейтинг сотрудника
        // Находим worker_id через shifts
        const workerResult = await pool.query(`
            SELECT DISTINCT s.worker_id 
            FROM shifts s 
            WHERE s.order_id = $1
        `, [order_id]);
        
        if (workerResult.rows.length > 0) {
            const workerId = workerResult.rows[0].worker_id;
            
            // Вычисляем средний рейтинг сотрудника
            const avgRatingResult = await pool.query(`
                SELECT AVG(r.rating) as avg_rating
                FROM reviews r
                JOIN orders o ON r.order_id = o.id
                JOIN shifts s ON s.order_id = o.id
                WHERE s.worker_id = $1
            `, [workerId]);
            
            const newRating = parseFloat(avgRatingResult.rows[0].avg_rating) || 0;
            
            await pool.query(
                'UPDATE workers SET rating = $1 WHERE user_id = $2',
                [newRating, workerId]
            );
        }
        
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Ошибка добавления отзыва:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Добавить/обновить ответ администратора
router.put('/:id/reply', async (req, res) => {
    try {
        const { id } = req.params;
        const { admin_reply } = req.body;
        
        const result = await pool.query(
            'UPDATE reviews SET admin_reply = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
            [admin_reply, id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Отзыв не найден' });
        }
        
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Ошибка добавления ответа:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Удалить отзыв
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await pool.query('DELETE FROM reviews WHERE id = $1 RETURNING *', [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Отзыв не найден' });
        }
        
        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка удаления отзыва:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Тренд отзывов за 30 дней (линейный график)
router.get('/trend', async (req, res) => {
    try {
        // Получаем все отзывы за последние 30 дней
        const result = await pool.query(`
            SELECT 
                DATE(created_at) as date,
                COALESCE(AVG(rating), 0) as avg_rating,
                COUNT(*) as count
            FROM reviews
            WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
            GROUP BY DATE(created_at)
            ORDER BY date ASC
        `);
        
        // Создаем массив всех дней за последние 30 дней
        const last30Days = [];
        for (let i = 29; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            last30Days.push({ date: dateStr, avg_rating: 0, count: 0 });
        }
        
        // Заполняем данные из базы
        for (const day of last30Days) {
            const found = result.rows.find(r => r.date.toISOString().split('T')[0] === day.date);
            if (found) {
                day.avg_rating = parseFloat(found.avg_rating) || 0;
                day.count = parseInt(found.count) || 0;
            }
        }
        
        res.json(last30Days);
    } catch (err) {
        console.error('Ошибка получения тренда отзывов:', err);
        // Возвращаем пустой массив, чтобы график не ломался
        const emptyData = [];
        for (let i = 29; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            emptyData.push({ date: dateStr, avg_rating: 0, count: 0 });
        }
        res.json(emptyData);
    }
});

module.exports = router;