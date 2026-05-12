const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// Получить все услуги
router.get('/', async (req, res) => {
    const result = await pool.query('SELECT * FROM services WHERE is_active = true ORDER BY category, id');
    res.json(result.rows);
});

// Получить услугу по ID
router.get('/:id', async (req, res) => {
    const result = await pool.query('SELECT * FROM services WHERE id = $1', [req.params.id]);
    res.json(result.rows[0]);
});

// Добавить услугу
router.post('/', async (req, res) => {
    const { name, description, category, price_type, base_price, price_per_unit } = req.body;
    const result = await pool.query(
        'INSERT INTO services (name, description, category, price_type, base_price, price_per_unit, is_active) VALUES ($1, $2, $3, $4, $5, $6, true) RETURNING *',
        [name, description, category, price_type, base_price, price_per_unit]
    );
    res.json(result.rows[0]);
});

// Обновить услугу
router.put('/:id', async (req, res) => {
    const { name, description, category, price_type, base_price, price_per_unit } = req.body;
    const result = await pool.query(
        'UPDATE services SET name=$1, description=$2, category=$3, price_type=$4, base_price=$5, price_per_unit=$6 WHERE id=$7 RETURNING *',
        [name, description, category, price_type, base_price, price_per_unit, req.params.id]
    );
    res.json(result.rows[0]);
});

// Удалить услугу
router.delete('/:id', async (req, res) => {
    await pool.query('DELETE FROM services WHERE id = $1', [req.params.id]);
    res.json({ success: true });
});

module.exports = router;