// frontend/js/cache.js - модуль для кэширования запросов

class ApiCache {
    constructor() {
        this.cache = new Map();
        this.ttl = 5 * 60 * 1000; // 5 минут по умолчанию
    }

    // Генерация ключа кэша
    getKey(url, params = null) {
        if (params) {
            return `${url}|${JSON.stringify(params)}`;
        }
        return url;
    }

    // Сохранение в кэш
    set(key, data, ttl = this.ttl) {
        const expireAt = Date.now() + ttl;
        this.cache.set(key, { data, expireAt });
    }

    // Получение из кэша
    get(key) {
        const item = this.cache.get(key);
        if (!item) return null;
        
        if (Date.now() > item.expireAt) {
            this.cache.delete(key);
            return null;
        }
        
        return item.data;
    }

    // Очистка кэша
    clear() {
        this.cache.clear();
        console.log('🧹 Кэш API очищен');
    }

    // Очистка кэша по URL
    clearByUrl(url) {
        for (const key of this.cache.keys()) {
            if (key.startsWith(url)) {
                this.cache.delete(key);
            }
        }
    }

    // Кэширующий fetch
    async fetch(url, options = {}) {
        const isGetRequest = !options.method || options.method === 'GET';
        const cacheKey = this.getKey(url, options.body);
        
        // Для GET запросов пробуем получить из кэша
        if (isGetRequest) {
            const cached = this.get(cacheKey);
            if (cached) {
                console.log(`📦 Cache HIT: ${url}`);
                return cached;
            }
        }
        
        // Выполняем запрос
        console.log(`🌐 Cache MISS: ${url}`);
        const response = await fetch(url, options);
        const data = await response.json();
        
        // Для успешных GET запросов сохраняем в кэш
        if (isGetRequest && response.ok) {
            this.set(cacheKey, data);
        }
        
        // Для POST/PUT/DELETE запросов очищаем связанные кэши
        if (!isGetRequest) {
            this.clearByUrl(url.split('?')[0]);
        }
        
        return { response, data };
    }
}

// Создаём глобальный экземпляр
window.apiCache = new ApiCache();

// Обёртка для fetch с кэшированием
window.cachedFetch = async (url, options = {}) => {
    const result = await window.apiCache.fetch(url, options);
    
    // Для совместимости с обычным fetch
    if (result.response) {
        return {
            ok: result.response.ok,
            status: result.response.status,
            json: async () => result.data,
            text: async () => JSON.stringify(result.data),
            data: result.data
        };
    }
    
    // Если данные из кэша
    return {
        ok: true,
        status: 200,
        json: async () => result,
        text: async () => JSON.stringify(result),
        data: result
    };
};

