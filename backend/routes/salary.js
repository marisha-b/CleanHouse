const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// Получить статистику зарплаты сотрудника
router.get('/worker/:workerId', async (req, res) => {
    try {
        const { workerId } = req.params;
        
        const result = await pool.query(`
            SELECT 
                COALESCE(SUM(s.actual_hours * w.hourly_rate), 0) as total_earnings,
                COALESCE(SUM(s.actual_hours), 0) as total_hours,
                COUNT(DISTINCT s.order_id) as orders_count,
                COALESCE(w.hourly_rate, 500) as hourly_rate
            FROM shifts s
            JOIN workers w ON w.user_id = s.worker_id
            WHERE s.worker_id = $1 AND s.status = 'completed'
            GROUP BY w.hourly_rate
        `, [workerId]);
        
        if (result.rows.length === 0) {
            res.json({ total_earnings: 0, total_hours: 0, orders_count: 0, hourly_rate: 500 });
        } else {
            res.json(result.rows[0]);
        }
    } catch (err) {
        console.error('Ошибка в /worker/:workerId:', err);
        res.status(500).json({ error: err.message });
    }
});

// Получить детализацию часов сотрудника
router.get('/worker/:workerId/details', async (req, res) => {
    try {
        const { workerId } = req.params;
        const { startDate, endDate } = req.query;
        
        let query = `
            SELECT 
                s.id as shift_id,
                s.shift_date,
                s.actual_hours,
                w.hourly_rate,
                (s.actual_hours * w.hourly_rate) as earnings,
                o.address,
                o.id as order_id
            FROM shifts s
            JOIN workers w ON w.user_id = s.worker_id
            LEFT JOIN orders o ON o.id = s.order_id
            WHERE s.worker_id = $1 AND s.status = 'completed'
        `;
        let params = [workerId];
        
        if (startDate && endDate) {
            query += ` AND s.shift_date BETWEEN $2 AND $3`;
            params.push(startDate, endDate);
        }
        
        query += ` ORDER BY s.shift_date DESC`;
        
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Ошибка в /worker/:workerId/details:', err);
        res.status(500).json({ error: err.message });
    }
});

// Получить зарплату менеджера (оклад)
router.get('/manager/:managerId', async (req, res) => {
    try {
        const { managerId } = req.params;
        
        const result = await pool.query(`
            SELECT COALESCE(m.monthly_salary, 50000) as monthly_salary, 
                   COALESCE(m.bonus, 0) as bonus, 
                   u.full_name
            FROM users u
            LEFT JOIN managers m ON m.user_id = u.id
            WHERE u.id = $1 AND u.role = 'manager'
        `, [managerId]);
        
        res.json(result.rows[0] || { monthly_salary: 50000, bonus: 0, full_name: 'Менеджер' });
    } catch (err) {
        console.error('Ошибка в /manager/:managerId:', err);
        res.status(500).json({ error: err.message });
    }
});

// Получить зарплату менеджера за период (с учётом рабочих дней)
router.get('/manager/:managerId/period', async (req, res) => {
    try {
        const { managerId } = req.params;
        const { startDate, endDate } = req.query;
        
        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'Укажите период' });
        }
        
        const managerResult = await pool.query(`
            SELECT COALESCE(m.monthly_salary, 50000) as monthly_salary, 
                   COALESCE(m.bonus, 0) as bonus, 
                   u.full_name
            FROM users u
            LEFT JOIN managers m ON m.user_id = u.id
            WHERE u.id = $1 AND u.role = 'manager'
        `, [managerId]);
        
        const monthlySalary = parseFloat(managerResult.rows[0]?.monthly_salary) || 50000;
        const bonus = parseFloat(managerResult.rows[0]?.bonus) || 0;
        const fullName = managerResult.rows[0]?.full_name || 'Менеджер';
        
        const start = new Date(startDate);
        const end = new Date(endDate);
        let workDays = 0;
        let current = new Date(start);
        
        while (current <= end) {
            const dayOfWeek = current.getDay();
            if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                workDays++;
            }
            current.setDate(current.getDate() + 1);
        }
        
        const standardDays = 22;
        const dailyRate = monthlySalary / standardDays;
        const salaryForPeriod = dailyRate * workDays;
        const totalSalary = salaryForPeriod + bonus;
        const tax = Math.round(totalSalary * 0.13);
        const netSalary = totalSalary - tax;
        
        res.json({
            manager: { full_name: fullName },
            period: { startDate, endDate, workDays, standardDays },
            monthly_salary: Math.round(monthlySalary),
            bonus: Math.round(bonus),
            salary_for_period: Math.round(salaryForPeriod),
            total_salary: Math.round(totalSalary),
            tax: tax,
            net_salary: Math.round(netSalary),
            daily_rate: Math.round(dailyRate)
        });
    } catch (err) {
        console.error('Ошибка в /manager/:managerId/period:', err);
        res.status(500).json({ error: err.message });
    }
});

// Получить выручку компании за месяц (ИСПРАВЛЕННАЯ ВЕРСИЯ)
router.get('/company/revenue', async (req, res) => {
    try {
        const { month, year } = req.query;
        const currentYear = year || new Date().getFullYear();
        const currentMonth = month || new Date().getMonth() + 1;
        
        console.log(`📊 Расчёт выручки за ${currentMonth}.${currentYear}`);
        
        // Выручка от заказов (только выполненные)
        const ordersRevenue = await pool.query(`
            SELECT COALESCE(SUM(total_price), 0) as total
            FROM orders
            WHERE status = 'completed' 
              AND EXTRACT(YEAR FROM order_date) = $1
              AND EXTRACT(MONTH FROM order_date) = $2
        `, [currentYear, currentMonth]);
        
        const revenue = parseFloat(ordersRevenue.rows[0].total) || 0;

        
        // Зарплаты сотрудников (только за выполненные смены в указанном месяце)
        const workersSalary = await pool.query(`
            SELECT COALESCE(SUM(s.actual_hours * COALESCE(w.hourly_rate, 500)), 0) as total
            FROM shifts s
            JOIN workers w ON w.user_id = s.worker_id
            WHERE s.status = 'completed'
              AND EXTRACT(YEAR FROM s.shift_date) = $1
              AND EXTRACT(MONTH FROM s.shift_date) = $2
        `, [currentYear, currentMonth]);
        
        const workersExpense = parseFloat(workersSalary.rows[0].total) || 0;
   
        
        // Зарплаты менеджеров
        const managersSalary = await pool.query(`
            SELECT COALESCE(SUM(m.monthly_salary + COALESCE(m.bonus, 0)), 0) as total
            FROM managers m
            JOIN users u ON u.id = m.user_id
        `);
        
        const managersExpense = parseFloat(managersSalary.rows[0].total) || 0;

        
        const totalExpenses = workersExpense + managersExpense;
        const profit = revenue - totalExpenses;
        
  
        
        res.json({
            revenue: revenue,
            expenses: totalExpenses,
            profit: profit,
            workers_salary: workersExpense,
            managers_salary: managersExpense,
            month: currentMonth,
            year: currentYear
        });
    } catch (err) {
        console.error('Ошибка в /company/revenue:', err);
        res.status(500).json({ error: err.message });
    }
});

// Обновить ставку сотрудника
router.put('/worker/:workerId/rate', async (req, res) => {
    try {
        const { workerId } = req.params;
        const { hourly_rate } = req.body;
        
        await pool.query(
            'UPDATE workers SET hourly_rate = $1 WHERE user_id = $2',
            [hourly_rate, workerId]
        );
        
        if (global.appCache) {
            global.appCache.del(`/api/salary/worker/${workerId}`);
        }
        
        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка в /worker/:workerId/rate:', err);
        res.status(500).json({ error: err.message });
    }
});

// Обновить зарплату менеджера
router.put('/manager/:managerId/salary', async (req, res) => {
    try {
        const { managerId } = req.params;
        const { monthly_salary, bonus } = req.body;
        
        await pool.query(
            `INSERT INTO managers (user_id, monthly_salary, bonus, updated_at) 
             VALUES ($1, $2, $3, NOW()) 
             ON CONFLICT (user_id) 
             DO UPDATE SET monthly_salary = $2, bonus = $3, updated_at = NOW()`,
            [managerId, monthly_salary, bonus || 0]
        );
        
        if (global.appCache) {
            global.appCache.del(`/api/salary/manager/${managerId}`);
        }
        
        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка в /manager/:managerId/salary:', err);
        res.status(500).json({ error: err.message });
    }
});

// Сформировать расчётный лист сотрудника
router.get('/worker/:workerId/payslip', async (req, res) => {
    try {
        const { workerId } = req.params;
        const { startDate, endDate } = req.query;
        
        const details = await pool.query(`
            SELECT 
                s.id as shift_id,
                s.shift_date,
                s.actual_hours,
                w.hourly_rate,
                (s.actual_hours * w.hourly_rate) as earnings,
                o.address
            FROM shifts s
            JOIN workers w ON w.user_id = s.worker_id
            LEFT JOIN orders o ON o.id = s.order_id
            WHERE s.worker_id = $1 
              AND s.status = 'completed'
              AND s.shift_date BETWEEN $2 AND $3
            ORDER BY s.shift_date DESC
        `, [workerId, startDate, endDate]);
        
        const totals = await pool.query(`
            SELECT 
                COALESCE(SUM(s.actual_hours), 0) as total_hours,
                COALESCE(SUM(s.actual_hours * w.hourly_rate), 0) as total_earnings
            FROM shifts s
            JOIN workers w ON w.user_id = s.worker_id
            WHERE s.worker_id = $1 
              AND s.status = 'completed'
              AND s.shift_date BETWEEN $2 AND $3
        `, [workerId, startDate, endDate]);
        
        const userInfo = await pool.query(`
            SELECT full_name, phone FROM users WHERE id = $1
        `, [workerId]);
        
        res.json({
            worker: userInfo.rows[0],
            period: { startDate, endDate },
            details: details.rows,
            total_hours: totals.rows[0].total_hours || 0,
            total_earnings: totals.rows[0].total_earnings || 0
        });
    } catch (err) {
        console.error('Ошибка в /worker/:workerId/payslip:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
