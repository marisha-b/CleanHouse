// frontend/script.js - ОЧИЩЕННАЯ ВЕРСИЯ

// ======================== ОБЩИЕ ФУНКЦИИ ========================
async function loadComponent(elementId, componentPath) {
    try {
        const response = await fetch(componentPath);
        const html = await response.text();
        const element = document.getElementById(elementId);
        if (element) element.innerHTML = html;
    } catch (error) {
        console.error(`Ошибка загрузки ${componentPath}:`, error);
    }
}

// ======================== БУРГЕР-МЕНЮ ========================
function initBurgerMenu() {
    const burgerMenu = document.getElementById('burgerMenu');
    const navMenu = document.getElementById('navMenu');
    const menuOverlay = document.getElementById('menuOverlay');
    
    if (burgerMenu && navMenu) {
        burgerMenu.addEventListener('click', function() {
            burgerMenu.classList.toggle('active');
            navMenu.classList.toggle('active');
            if (menuOverlay) menuOverlay.classList.toggle('active');
            document.body.style.overflow = navMenu.classList.contains('active') ? 'hidden' : '';
        });
        
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', function() {
                burgerMenu.classList.remove('active');
                navMenu.classList.remove('active');
                if (menuOverlay) menuOverlay.classList.remove('active');
                document.body.style.overflow = '';
            });
        });
        
        if (menuOverlay) {
            menuOverlay.addEventListener('click', function() {
                burgerMenu.classList.remove('active');
                navMenu.classList.remove('active');
                menuOverlay.classList.remove('active');
                document.body.style.overflow = '';
            });
        }
    }
}

// ======================== ПЛАВНАЯ ПРОКРУТКА ========================
function initSmoothScroll() {
    const links = document.querySelectorAll('a[href^="#"]');
    
    links.forEach(link => {
        link.addEventListener('click', function(e) {
            const targetId = this.getAttribute('href');
            if (targetId === '#' || targetId === '') return;
            
            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                e.preventDefault();
                const headerHeight = document.querySelector('.navbar')?.offsetHeight || 80;
                const targetPosition = targetElement.getBoundingClientRect().top + window.pageYOffset - headerHeight - 20;
                window.scrollTo({ top: targetPosition, behavior: 'smooth' });
            }
        });
    });
}

// ======================== ЗАГРУЗКА УСЛУГ ========================
async function loadServices() {
    const container = document.getElementById('services-container');
    if (!container) return;
    
    try {
        const response = await fetch('/api/services');
        const services = await response.json();
        
        const categories = {
            apartment: { title: 'Уборка квартир', services: [] },
            house: { title: 'Уборка домов и коттеджей', services: [] },
            office: { title: 'Уборка офисов', services: [] },
            additional: { title: 'Дополнительные услуги', services: [] }
        };
        
        services.forEach(service => {
            if (categories[service.category]) categories[service.category].services.push(service);
        });
        
        container.innerHTML = '';
        for (const category of Object.values(categories)) {
            if (category.services.length === 0) continue;
            container.innerHTML += `
                <h3>${category.title}</h3>
                <div class="services__grid">
                    ${category.services.map(service => `
                        <div class="services__category">
                            <div class="services__category-content">
                                <h4>${escapeHtml(service.name)}</h4>
                                <p>${escapeHtml(service.description || 'Подробности уточняйте у менеджера')}</p>
                                <div class="service-price-info" style="margin-top: 12px; color: #8B7355; font-weight: 500;">от ${service.base_price} ₽</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        }
    } catch (error) {
        container.innerHTML = '<div class="loading">Ошибка загрузки услуг</div>';
    }
}

// ======================== ЗАГРУЗКА ОТЗЫВОВ ========================
let allReviews = [];
let autoScrollInterval;

async function loadReviews() {
    const container = document.getElementById('reviewsContainer');
    if (!container) return;
    
    try {
        const response = await fetch('/api/reviews');
        allReviews = await response.json();
        
        if (allReviews.length === 0) {
            container.innerHTML = '<div class="loading">Нет отзывов</div>';
            return;
        }
        
        const avgRating = (allReviews.reduce((s, r) => s + r.rating, 0) / allReviews.length).toFixed(1);
        const ratingContainer = document.getElementById('reviews-rating');
        if (ratingContainer) {
            ratingContainer.innerHTML = `
                <div class="rating-average">${avgRating}</div>
                <div class="rating-stars">${renderStars(parseFloat(avgRating))}</div>
                <div class="rating-count">на основе ${allReviews.length} отзывов</div>
            `;
        }
        
        renderReviews();
        createDots();
        startAutoScroll();
    } catch (error) {
        container.innerHTML = '<div class="loading">Ошибка загрузки отзывов</div>';
    }
}

function renderReviews() {
    const container = document.getElementById('reviewsContainer');
    if (!container) return;
    container.innerHTML = allReviews.map(review => `
        <div class="review-card">
            <div class="review-content"><p>${escapeHtml(review.comment)}</p></div>
            <div class="review-footer">
                <span class="review-service">${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}</span>
                <span class="review-date">${new Date(review.created_at).toLocaleDateString()}</span>
            </div>
        </div>
    `).join('');
}

function createDots() {
    const dotsContainer = document.getElementById('reviewsDots');
    if (!dotsContainer) return;
    dotsContainer.innerHTML = '';
    for (let i = 0; i < allReviews.length; i++) {
        const dot = document.createElement('span');
        dot.className = 'dot' + (i === 0 ? ' active' : '');
        dot.onclick = () => goToReview(i);
        dotsContainer.appendChild(dot);
    }
}

function goToReview(index) {
    const container = document.getElementById('reviewsContainer');
    const cardWidth = document.querySelector('.review-card')?.offsetWidth + 30 || 500;
    container.scrollTo({ left: cardWidth * index, behavior: 'smooth' });
    updateDots();
    resetAutoScroll();
}

function updateDots() {
    const container = document.getElementById('reviewsContainer');
    const cardWidth = document.querySelector('.review-card')?.offsetWidth + 30 || 500;
    const index = Math.round(container.scrollLeft / cardWidth);
    document.querySelectorAll('.dot').forEach((dot, i) => dot.classList.toggle('active', i === index));
}

function nextReview() {
    const index = currentReviewIndex();
    if (index < allReviews.length - 1) goToReview(index + 1);
    else goToReview(0);
}

function prevReview() {
    const index = currentReviewIndex();
    if (index > 0) goToReview(index - 1);
    else goToReview(allReviews.length - 1);
}

function currentReviewIndex() {
    const container = document.getElementById('reviewsContainer');
    const cardWidth = document.querySelector('.review-card')?.offsetWidth + 30 || 500;
    return Math.round(container.scrollLeft / cardWidth);
}

function startAutoScroll() {
    autoScrollInterval = setInterval(nextReview, 5000);
}

function resetAutoScroll() {
    clearInterval(autoScrollInterval);
    startAutoScroll();
}

function renderStars(rating) {
    let stars = '';
    for (let i = 0; i < Math.floor(rating); i++) stars += '<span class="star filled">★</span>';
    if (rating % 1 >= 0.5) stars += '<span class="star half">★</span>';
    for (let i = stars.length; i < 5; i++) stars += '<span class="star">★</span>';
    return stars;
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
}

// ======================== ИНИЦИАЛИЗАЦИЯ ========================
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM загружен, инициализация script.js...');
    
    initBurgerMenu();
    initSmoothScroll();
    loadServices();
    loadReviews();
    
    document.getElementById('prevReview')?.addEventListener('click', () => { prevReview(); resetAutoScroll(); });
    document.getElementById('nextReview')?.addEventListener('click', () => { nextReview(); resetAutoScroll(); });
    document.getElementById('reviewsContainer')?.addEventListener('scroll', () => { updateDots(); resetAutoScroll(); });
    
    console.log('Инициализация script.js завершена');
});