const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// Создать платёж (онлайн оплата - заглушка)
router.post('/create', async (req, res) => {
    try {
        const { order_id, amount, payment_method, card_number, card_holder, expiry_date, cvv } = req.body;
        
        // Простая валидация для заглушки
        if (!card_number || !card_holder || !expiry_date || !cvv) {
            return res.status(400).json({ error: 'Заполните все поля карты' });
        }
        
        // Простая проверка (заглушка)
        if (card_number.replace(/\s/g, '').length !== 16) {
            return res.status(400).json({ error: 'Неверный номер карты' });
        }
        
        if (cvv.length !== 3) {
            return res.status(400).json({ error: 'Неверный CVV код' });
        }
        
        // Проверяем, существует ли уже платёж
        const existing = await pool.query(
            'SELECT id FROM payments WHERE order_id = $1 AND status = $2',
            [order_id, 'completed']
        );
        
        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'Заказ уже оплачен' });
        }
        
        // Генерируем транзакцию
        const transactionId = 'TRX_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
        
        // Создаём платёж
        const result = await pool.query(
            `INSERT INTO payments (order_id, amount, payment_method, status, payment_date, transaction_id) 
             VALUES ($1, $2, $3, $4, NOW(), $5) 
             RETURNING *`,
            [order_id, amount, payment_method, 'completed', transactionId]
        );
        
        // Обновляем статус оплаты в заказе
        await pool.query(
            'UPDATE orders SET payment_status = $1, payment_method = $2 WHERE id = $3',
            ['paid_online', payment_method, order_id]
        );
        
        console.log(`💳 Оплата заказа #${order_id} на сумму ${amount} ₽, транзакция: ${transactionId}`);
        res.json({ success: true, payment: result.rows[0], transaction_id: transactionId });
    } catch (err) {
        console.error('Ошибка создания платежа:', err);
        res.status(500).json({ error: err.message });
    }
});

// Получить платёж по заказу
router.get('/order/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        const result = await pool.query(
            'SELECT * FROM payments WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1',
            [orderId]
        );
        res.json(result.rows[0] || null);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;