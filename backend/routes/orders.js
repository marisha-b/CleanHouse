const express = require('express');
const router = express.Router();
const pool = require('../config/database');

function calculateEndTime(startTime, hours) {
    const [hour, minute] = startTime.split(':').map(Number);
    const endHour = hour + hours;
    return `${String(endHour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

// Функция для очистки кэша после изменений
function clearOrdersCache(clientId, orderId = null) {
    if (global.appCache) {
        global.appCache.del('/api/orders/new-orders');
        global.appCache.del('/api/orders/all-orders');
        
        if (clientId) {
            global.appCache.del(`/api/orders/client-id/${clientId}`);
        }
        
        if (orderId) {
            global.appCache.del(`/api/orders/details/${orderId}`);
        }
        
    }
}

// Создать заказ
router.post('/', async (req, res) => {
    try {
        const { client_id, client_name, client_phone, client_email, address, order_date, time_slot, comment, services, total_price, payment_method } = req.body;
        
        let userId = client_id;
        
        if (!userId) {
            const existingUser = await pool.query('SELECT id FROM users WHERE phone = $1', [client_phone]);
            if (existingUser.rows.length > 0) {
                userId = existingUser.rows[0].id;
            } else {
                const newUser = await pool.query(
                    'INSERT INTO users (phone, full_name, email, role, created_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING id',
                    [client_phone, client_name, client_email || null, 'client']
                );
                userId = newUser.rows[0].id;
            }
        }
        
        const start_time = time_slot || '09:00';
        const payMethod = payment_method || 'cash';
        
        const order = await pool.query(
            `INSERT INTO orders (client_id, address, order_date, time_slot, comment, total_price, payment_method, payment_status, status, created_at) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()) RETURNING id`,
            [userId, address, order_date, start_time, comment, total_price, payMethod, 'pending', 'new']
        );
        
        const orderId = order.rows[0].id;
        
        for (const service of services) {
            await pool.query(
                'INSERT INTO order_services (order_id, service_id, service_name, quantity, price) VALUES ($1, $2, $3, $4, $5)',
                [orderId, service.service_id || null, service.name, 1, service.price]
            );
        }
        
        clearOrdersCache(userId, orderId);
        
        res.json({ success: true, order_id: orderId });
    } catch (err) {
        console.error('Ошибка создания заказа:', err);
        res.status(500).json({ error: 'Ошибка создания заказа' });
    }
});

// Получить заказы клиента по ID
router.get('/client-id/:clientId', async (req, res) => {
    try {
        const { clientId } = req.params;
        
        const result = await pool.query(`
            SELECT o.*, 
                   array_agg(DISTINCT os.service_name) as services,
                   array_agg(DISTINCT os.price) as service_prices,
                   COALESCE(r.rating, 0) as user_rating,
                   COALESCE(r.comment, '') as user_comment,
                   COALESCE(r.admin_reply, '') as admin_reply,
                   r.id as review_id
            FROM orders o
            LEFT JOIN order_services os ON o.id = os.order_id
            LEFT JOIN reviews r ON r.order_id = o.id AND r.client_id = $1
            WHERE o.client_id = $1
            GROUP BY o.id, r.id, r.rating, r.comment, r.admin_reply
            ORDER BY o.created_at DESC
        `, [clientId]);
        
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка загрузки заказов' });
    }
});

// Получить НОВЫЕ заказы
router.get('/new-orders', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT o.*, u.full_name as client_name, u.phone as client_phone, u.email as client_email
            FROM orders o
            JOIN users u ON o.client_id = u.id
            WHERE o.status = 'new'
            ORDER BY o.created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Получить ВСЕ заказы
router.get('/all-orders', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT o.*, 
                   u.full_name as client_name, 
                   u.phone as client_phone,
                   COALESCE(array_agg(DISTINCT w.full_name) FILTER (WHERE w.full_name IS NOT NULL), '{}') as workers,
                   COALESCE(array_agg(DISTINCT s.id) FILTER (WHERE s.id IS NOT NULL), '{}') as shift_ids
            FROM orders o
            JOIN users u ON o.client_id = u.id
            LEFT JOIN shifts s ON s.order_id = o.id
            LEFT JOIN users w ON s.worker_id = w.id
            GROUP BY o.id, u.full_name, u.phone
            ORDER BY o.created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Назначить сотрудника на заказ
router.post('/assign-worker', async (req, res) => {
    try {
        const { order_id, worker_id } = req.body;
        
        const orderInfo = await pool.query(
            'SELECT order_date, time_slot, client_id FROM orders WHERE id = $1',
            [order_id]
        );
        
        if (orderInfo.rows.length === 0) {
            return res.status(404).json({ error: 'Заказ не найден' });
        }
        
        const orderDate = orderInfo.rows[0].order_date;
        const startTime = orderInfo.rows[0].time_slot || '09:00';
        const endTime = calculateEndTime(startTime, 3);
        const clientId = orderInfo.rows[0].client_id;
        
        const existing = await pool.query(
            'SELECT id FROM shifts WHERE order_id = $1 AND worker_id = $2',
            [order_id, worker_id]
        );
        
        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'Сотрудник уже назначен на этот заказ' });
        }
        
        const result = await pool.query(
            `INSERT INTO shifts (worker_id, order_id, shift_date, start_time, end_time, description, status, actual_hours) 
             VALUES ($1, $2, $3, $4, $5, $6, 'scheduled', $7) 
             RETURNING *`,
            [worker_id, order_id, orderDate, startTime, endTime, `Заказ #${order_id}`, 3]
        );
        
        await pool.query('UPDATE orders SET status = $1 WHERE id = $2', ['in_progress', order_id]);
        
        clearOrdersCache(clientId, order_id);
        
        res.json({ success: true, shift: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Получить детали заказа
router.get('/details/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        
        const services = await pool.query(`
            SELECT service_name, price, quantity
            FROM order_services
            WHERE order_id = $1
        `, [orderId]);
        
        const workers = await pool.query(`
            SELECT DISTINCT u.id, u.full_name, s.shift_date, s.start_time, s.end_time, s.status, s.id as shift_id
            FROM shifts s
            JOIN users u ON s.worker_id = u.id
            WHERE s.order_id = $1
        `, [orderId]);
        
        const reports = await pool.query(`
            SELECT r.*, u.full_name as worker_name, s.shift_date
            FROM reports r
            JOIN shifts s ON r.shift_id = s.id
            JOIN users u ON s.worker_id = u.id
            WHERE s.order_id = $1
            ORDER BY r.submitted_at DESC
        `, [orderId]);
        
        const orderStatus = await pool.query('SELECT status, payment_method, payment_status FROM orders WHERE id = $1', [orderId]);
        
        res.json({
            services: services.rows,
            workers: workers.rows,
            reports: reports.rows,
            status: orderStatus.rows[0]?.status || 'new',
            payment_method: orderStatus.rows[0]?.payment_method || 'cash',
            payment_status: orderStatus.rows[0]?.payment_status || 'pending'
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка загрузки деталей' });
    }
});

// Поставить оценку сотруднику
router.post('/review', async (req, res) => {
    try {
        const { order_id, client_id, worker_id, rating, comment } = req.body;
        
        const existingReview = await pool.query(
            'SELECT id FROM reviews WHERE order_id = $1 AND client_id = $2',
            [order_id, client_id]
        );
        
        if (existingReview.rows.length > 0) {
            const result = await pool.query(
                'UPDATE reviews SET rating = $1, comment = $2, updated_at = NOW() WHERE order_id = $3 AND client_id = $4 RETURNING *',
                [rating, comment, order_id, client_id]
            );
            return res.json(result.rows[0]);
        }
        
        const result = await pool.query(
            'INSERT INTO reviews (order_id, client_id, rating, comment, created_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING *',
            [order_id, client_id, rating, comment]
        );
        
        if (worker_id) {
            const workerRating = await pool.query(
                'SELECT AVG(rating) as avg_rating FROM reviews WHERE order_id IN (SELECT id FROM orders WHERE id IN (SELECT order_id FROM shifts WHERE worker_id = $1))',
                [worker_id]
            );
            const newRating = workerRating.rows[0].avg_rating || 0;
            await pool.query('UPDATE workers SET rating = $1 WHERE user_id = $2', [newRating, worker_id]);
        }
        
        if (global.appCache) {
            global.appCache.del(`/api/reviews`);
            global.appCache.del(`/api/reviews/worker/${worker_id}`);
            global.appCache.del(`/api/orders/details/${order_id}`);
        }
        
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Обновить статус оплаты заказа
router.post('/payment-status', async (req, res) => {
    try {
        const { order_id, payment_status } = req.body;
        
        const result = await pool.query(
            'SELECT client_id FROM orders WHERE id = $1',
            [order_id]
        );
        const clientId = result.rows[0]?.client_id;
        
        await pool.query(
            'UPDATE orders SET payment_status = $1 WHERE id = $2',
            [payment_status, order_id]
        );
        
        clearOrdersCache(clientId, order_id);
        
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
