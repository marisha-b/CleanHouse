const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();
const NodeCache = require('node-cache');

const app = express();
const PORT = process.env.PORT || 5000;

// Создаём кэш с временем жизни 5 минут (300 секунд)
const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

// Делаем кэш доступным для других модулей
global.appCache = cache;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Middleware для кэширования GET запросов
app.use('/api', (req, res, next) => {
    if (req.method === 'GET') {
        const cacheKey = req.originalUrl;
        const cachedData = cache.get(cacheKey);
        
        if (cachedData) {
            return res.json(cachedData);
        }
        
        const originalJson = res.json;
        res.json = function(data) {
            cache.set(cacheKey, data);
            originalJson.call(this, data);
        };
    }
    next();
});

// Настройка кэширования статических файлов
const staticOptions = {
    maxAge: '1d',
    immutable: true
};

app.use(express.static(path.join(__dirname, '../frontend'), staticOptions));
app.use(express.static(path.join(__dirname, '../frontend/components'), staticOptions));
app.use(express.static(path.join(__dirname, '../'), staticOptions));
app.use(express.static(path.join(__dirname, './'), staticOptions));

// МАРШРУТЫ API 
app.use('/api/services', require('./routes/services'));
app.use('/api/reviews', require('./routes/reviews'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/shifts', require('./routes/shifts'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/workers', require('./routes/workers'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/users', require('./routes/users'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/salary', require('./routes/salary'));

// Маршрут для очистки кэша
app.post('/api/cache/clear', async (req, res) => {
    cache.flushAll();
    res.json({ success: true, message: 'Кэш очищен' });
});

// ========== HTML СТРАНИЦЫ ==========
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.listen(PORT, () => {
    console.log(`Сервер запущен на http://localhost:${PORT}`);
});
