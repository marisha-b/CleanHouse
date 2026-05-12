// components/loader.js
async function loadComponent(elementId, componentPath) {
    try {
        const response = await fetch(componentPath);
        const html = await response.text();
        const element = document.getElementById(elementId);
        if (element) {
            element.innerHTML = html;
            return true;
        }
        return false;
    } catch (error) {
        console.error(`Ошибка загрузки ${componentPath}:`, error);
        return false;
    }
}

async function loadAllComponents() {
    await loadComponent('navbar-placeholder', 'components/navbar.html');
    await loadComponent('footer-placeholder', 'components/footer.html');
    await loadComponent('client-modal-placeholder', 'components/client-login-modal.html');
    await loadComponent('modal-placeholder', 'components/worker-login-modal.html');
    
    setTimeout(() => {
        initBurgerMenu();
        initClientModal();
        initWorkerModal();
        initOrderButton();
        
        if (typeof window.updateClientAuthUI === 'function') {
            window.updateClientAuthUI();
        }
        if (typeof window.updateCabinetButton === 'function') {
            window.updateCabinetButton();
        }
    }, 500);
}

function initBurgerMenu() {
    const burger = document.getElementById('burgerMenu');
    const menu = document.getElementById('navMenu');
    if (burger && menu) {
        burger.onclick = () => {
            burger.classList.toggle('active');
            menu.classList.toggle('active');
        };
    }
}

// ===== КЛИЕНТСКАЯ МОДАЛКА =====
function initClientModal() {
    const modal = document.getElementById('clientModal');
    const closeBtn = document.getElementById('closeClientModal');
    const showRegister = document.getElementById('showRegisterBtn');
    const showLogin = document.getElementById('showLoginBtn');
    const loginForm = document.getElementById('clientLoginForm');
    const registerForm = document.getElementById('clientRegisterForm');
    const submitLogin = document.getElementById('submitClientLogin');
    const submitRegister = document.getElementById('submitRegister');
    
    if (!modal) return;
    
    if (closeBtn) closeBtn.onclick = () => modal.classList.remove('active');
    modal.onclick = (e) => { if (e.target === modal) modal.classList.remove('active'); };
    
    if (showRegister && loginForm && registerForm) {
        showRegister.onclick = (e) => {
            e.preventDefault();
            loginForm.style.display = 'none';
            registerForm.style.display = 'block';
            console.log('➡️ Переключено на регистрацию');
        };
    }
    
    if (showLogin && loginForm && registerForm) {
        showLogin.onclick = (e) => {
            e.preventDefault();
            registerForm.style.display = 'none';
            loginForm.style.display = 'block';
            console.log('⬅️ Переключено на вход');
        };
    }
    
    // Вход
    if (submitLogin) {
        submitLogin.onclick = async () => {
            const phone = document.getElementById('clientPhoneLogin')?.value.trim();
            const password = document.getElementById('clientPasswordLogin')?.value;
            const errorDiv = document.getElementById('loginError');
            
            if (!phone || !password) {
                if (errorDiv) {
                    errorDiv.textContent = 'Заполните все поля';
                    errorDiv.style.display = 'block';
                }
                return;
            }
            
            submitLogin.disabled = true;
            submitLogin.textContent = 'Вход...';
            if (errorDiv) errorDiv.style.display = 'none';
            
            try {
                const res = await fetch('/api/auth/client-login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phone, password })
                });
                const data = await res.json();
                
                if (res.ok && data.success) {
                    localStorage.setItem('client', JSON.stringify(data.user));
                    alert(`Добро пожаловать, ${data.user.name || data.user.full_name}!`);
                    modal.classList.remove('active');
                    
                    if (typeof window.updateClientAuthUI === 'function') {
                        window.updateClientAuthUI();
                    }
                    
                    window.location.href = 'client-cabinet.html';
                } else {
                    if (errorDiv) {
                        errorDiv.textContent = data.error || 'Неверный телефон или пароль';
                        errorDiv.style.display = 'block';
                    }
                }
            } catch(e) {
                if (errorDiv) {
                    errorDiv.textContent = 'Ошибка сервера';
                    errorDiv.style.display = 'block';
                }
            } finally {
                submitLogin.disabled = false;
                submitLogin.textContent = 'Войти';
            }
        };
    }
    
    // Регистрация
    if (submitRegister) {
        submitRegister.onclick = async () => {
            const name = document.getElementById('registerName')?.value.trim();
            const phone = document.getElementById('registerPhone')?.value.trim();
            const email = document.getElementById('registerEmail')?.value.trim();
            const password = document.getElementById('registerPassword')?.value;
            const errorDiv = document.getElementById('registerError');
            
            if (!name || !phone || !password) {
                if (errorDiv) {
                    errorDiv.textContent = 'Заполните обязательные поля';
                    errorDiv.style.display = 'block';
                }
                return;
            }
            
            submitRegister.disabled = true;
            submitRegister.textContent = 'Регистрация...';
            if (errorDiv) errorDiv.style.display = 'none';
            
            try {
                const res = await fetch('/api/auth/client-register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ full_name: name, phone, email, password })
                });
                const data = await res.json();
                
                if (res.ok && data.success) {
                    alert('✅ Регистрация успешна! Теперь войдите.');
                    if (loginForm) loginForm.style.display = 'block';
                    if (registerForm) registerForm.style.display = 'none';
                    const phoneInput = document.getElementById('clientPhoneLogin');
                    if (phoneInput) phoneInput.value = phone;
                    document.getElementById('registerName').value = '';
                    document.getElementById('registerPhone').value = '';
                    document.getElementById('registerEmail').value = '';
                    document.getElementById('registerPassword').value = '';
                } else {
                    if (errorDiv) {
                        errorDiv.textContent = data.error || 'Ошибка регистрации';
                        errorDiv.style.display = 'block';
                    }
                }
            } catch(e) {
                if (errorDiv) {
                    errorDiv.textContent = 'Ошибка сервера';
                    errorDiv.style.display = 'block';
                }
            } finally {
                submitRegister.disabled = false;
                submitRegister.textContent = 'Зарегистрироваться';
            }
        };
    }
}

// ===== МОДАЛКА СОТРУДНИКОВ =====
function initWorkerModal() {
    const workerBtn = document.getElementById('workerLoginBtn');
    const modal = document.getElementById('workerModal');
    const closeBtn = document.getElementById('closeWorkerModal');
    const roleSelect = document.getElementById('roleSelect');
    const employeeGroup = document.getElementById('employeeGroup');
    const employeeSelect = document.getElementById('employeeSelect');
    const submitBtn = document.getElementById('submitWorkerLogin');
    const passwordInput = document.getElementById('workerPassword');
    const errorDiv = document.getElementById('workerLoginError');
    
    if (!workerBtn || !modal) return;
    
    workerBtn.onclick = (e) => {
        e.preventDefault();
        modal.classList.add('active');
        if (roleSelect) roleSelect.value = '';
        if (employeeGroup) employeeGroup.style.display = 'none';
        if (passwordInput) passwordInput.value = '';
        if (errorDiv) errorDiv.style.display = 'none';
    };
    
    if (closeBtn) closeBtn.onclick = () => modal.classList.remove('active');
    modal.onclick = (e) => { if (e.target === modal) modal.classList.remove('active'); };
    
    if (roleSelect) {
        roleSelect.onchange = async () => {
            const role = roleSelect.value;
            if (role === 'worker') {
                if (employeeGroup) employeeGroup.style.display = 'block';
                try {
                    const res = await fetch('/api/workers/list');
                    const workers = await res.json();
                    if (employeeSelect) {
                        employeeSelect.innerHTML = '<option value="">-- Выберите сотрудника --</option>';
                        workers.forEach(w => {
                            employeeSelect.innerHTML += `<option value="${w.id}|${w.phone}">${escapeHtml(w.full_name)}</option>`;
                        });
                    }
                } catch(e) { console.error(e); }
            } else {
                if (employeeGroup) employeeGroup.style.display = 'none';
            }
            if (passwordInput) passwordInput.value = '';
            if (errorDiv) errorDiv.style.display = 'none';
        };
    }
    
    if (submitBtn) {
        submitBtn.onclick = async () => {
            const role = roleSelect?.value;
            const password = passwordInput?.value;
            
            if (!role) {
                if (errorDiv) { errorDiv.textContent = 'Выберите роль'; errorDiv.style.display = 'block'; }
                return;
            }
            if (!password) {
                if (errorDiv) { errorDiv.textContent = 'Введите пароль'; errorDiv.style.display = 'block'; }
                return;
            }
            
            let phone = null;
            if (role === 'worker') {
                const selected = employeeSelect?.value;
                if (!selected) {
                    if (errorDiv) { errorDiv.textContent = 'Выберите сотрудника'; errorDiv.style.display = 'block'; }
                    return;
                }
                phone = selected.split('|')[1];
            }
            
            submitBtn.disabled = true;
            submitBtn.textContent = 'Вход...';
            if (errorDiv) errorDiv.style.display = 'none';
            
            try {
                const res = await fetch('/api/auth/worker-login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ role, phone, password })
                });
                const data = await res.json();
                
                if (res.ok && data.success) {
                    localStorage.setItem('user', JSON.stringify(data.user));
                    alert(`Добро пожаловать, ${data.user.name}!`);
                    modal.classList.remove('active');
                    if (data.user.role === 'admin') window.location.href = 'admin-cabinet.html';
                    else if (data.user.role === 'manager') window.location.href = 'manager-cabinet.html';
                    else if (data.user.role === 'worker') window.location.href = 'worker-cabinet.html';
                } else {
                    if (errorDiv) { errorDiv.textContent = data.error || 'Ошибка входа'; errorDiv.style.display = 'block'; }
                }
            } catch(e) {
                if (errorDiv) { errorDiv.textContent = 'Ошибка сервера'; errorDiv.style.display = 'block'; }
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Войти';
            }
        };
    }
}

// ===== КНОПКА ЗАКАЗА =====
function initOrderButton() {
    const btn = document.getElementById('mainOrderBtn');
    
    if (btn) {
        btn.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            const client = localStorage.getItem('client');
            const modal = document.getElementById('clientModal');
            
            if (!client) {
                if (modal) {
                    modal.classList.add('active');
                    const loginForm = document.getElementById('clientLoginForm');
                    const registerForm = document.getElementById('clientRegisterForm');
                    if (loginForm) loginForm.style.display = 'block';
                    if (registerForm) registerForm.style.display = 'none';
                }
            } else {
                window.location.href = 'order.html';
            }
            return false;
        };
        console.log('✅ Кнопка Оформить заявку привязана');
    } else {
        setTimeout(initOrderButton, 500);
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
}

document.addEventListener('DOMContentLoaded', loadAllComponents);