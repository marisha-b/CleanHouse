const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// Количество сотрудников
router.get('/stats/workers-count', async (req, res) => {
    try {
        const result = await pool.query("SELECT COUNT(*) FROM users WHERE role = 'worker'");
        res.json({ count: parseInt(result.rows[0].count) });
    } catch (err) {
        console.error('Ошибка подсчёта сотрудников:', err);
        res.json({ count: 0 });
    }
});

// Средний рейтинг
router.get('/stats/avg-rating', async (req, res) => {
    try {
        const result = await pool.query("SELECT COALESCE(AVG(rating), 0) as avg FROM workers WHERE rating IS NOT NULL");
        res.json({ avg: parseFloat(result.rows[0].avg) });
    } catch (err) {
        console.error('Ошибка среднего рейтинга:', err);
        res.json({ avg: 0 });
    }
});

// Количество смен на текущей неделе (ПН-ВС) - САМЫЙ ПРОСТОЙ И НАДЁЖНЫЙ
router.get('/stats/weekly-shifts', async (req, res) => {
    try {
        // Просто считаем все смены, у которых дата в этой неделе
        // Используем EXTRACT(WEEK) - это самый надёжный способ в PostgreSQL
        const result = await pool.query(`
            SELECT COUNT(*) as count 
            FROM shifts 
            WHERE EXTRACT(WEEK FROM shift_date) = EXTRACT(WEEK FROM CURRENT_DATE)
              AND EXTRACT(YEAR FROM shift_date) = EXTRACT(YEAR FROM CURRENT_DATE)
        `);
        
        const shiftsCount = parseInt(result.rows[0].count);
        console.log('Смен на текущей неделе (по номеру недели):', shiftsCount);
        
        res.json({ count: shiftsCount });
    } catch (err) {
        console.error('Ошибка подсчёта смен:', err);
        res.json({ count: 0 });
    }
});

// Выручка за месяц
router.get('/stats/month-revenue', async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT COALESCE(SUM(total_price), 0) as total FROM orders WHERE status = 'completed' AND created_at >= date_trunc('month', CURRENT_DATE)"
        );
        res.json({ total: parseInt(result.rows[0].total) });
    } catch (err) {
        console.error('Ошибка выручки:', err);
        res.json({ total: 0 });
    }
});

// Рейтинг сотрудников
router.get('/stats/workers-rating', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT u.id, u.full_name, COALESCE(w.rating, 0) as rating, COUNT(DISTINCT o.id) as orders_count
            FROM users u
            LEFT JOIN workers w ON w.user_id = u.id
            LEFT JOIN shifts s ON s.worker_id = u.id
            LEFT JOIN orders o ON o.id = s.order_id
            WHERE u.role = 'worker'
            GROUP BY u.id, w.rating
            ORDER BY rating DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('Ошибка рейтинга сотрудников:', err);
        res.json([]);
    }
});

// Популярность услуг
router.get('/stats/popular-services', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                COALESCE(s.name, os.service_name) as name,
                COUNT(os.id) as count
            FROM order_services os
            LEFT JOIN services s ON os.service_id = s.id
            GROUP BY s.name, os.service_name
            ORDER BY count DESC
            LIMIT 5
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('Ошибка получения популярности услуг:', err);
        res.json([]);
    }
});

// Последние отчёты
router.get('/stats/recent-reports', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT r.id, r.shift_id, u.full_name as worker_name, s.shift_date, o.address
            FROM reports r
            JOIN shifts s ON r.shift_id = s.id
            JOIN users u ON s.worker_id = u.id
            LEFT JOIN orders o ON s.order_id = o.id
            ORDER BY r.submitted_at DESC
            LIMIT 10
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('Ошибка получения отчётов:', err);
        res.json([]);
    }
});

module.exports = router;