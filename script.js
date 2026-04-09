// ========== SUPABASE ==========
const SUPABASE_URL = 'https://ayxbdumhsgvzutmnchph.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_wIbW7rR_LRkHmG7g70_t7A_dVfzTKUp';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;


const WS_URL = "wss://chat-test-gb86.onrender.com";

let ws = null;
let currentNick = "";
let currentChatWith = null; // null = общий чат, иначе ник собеседника
let publicMessages = [];
let privateMessages = {};
let unreadCount = {};
let msgCounter = 0;

function formatTimestamp(timestamp) {
    const diff = Date.now() - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (seconds < 10) return "только что";
    if (seconds < 60) return `${seconds} сек назад`;
    if (minutes < 60) return `${minutes} мин назад`;
    if (hours < 2) return `${hours} час назад`;
    const date = new Date(timestamp);
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

function renderCurrentChat() {
    const chatDiv = document.getElementById('chat');
    
    // === ОБЩИЙ ЧАТ ===
    if (currentChatWith === null) {
        document.getElementById('currentChatTitle').innerHTML = '💬 Общий чат';
        document.getElementById('closeChatBtn').style.display = 'none';
        
        if (publicMessages.length === 0) {
            chatDiv.innerHTML = '<div class="placeholder">💬 Напишите первое сообщение в общий чат</div>';
            return;
        }
        
        chatDiv.innerHTML = publicMessages.map(msg => {
            const isOwn = (msg.nick === currentNick);
            
            // Картинка
            if (msg.type === 'image') {
                return `
                    <div class="message-wrapper ${isOwn ? 'own' : 'other'}">
                        <div class="message ${isOwn ? 'own' : 'other'}">
                            <strong>${escapeHtml(msg.nick)}</strong>:<br>
                            <div class="image-message">
                                <img src="${msg.image}" alt="${escapeHtml(msg.filename)}" data-filename="${escapeHtml(msg.filename)}">
                            </div>
                        </div>
                        <div class="timestamp">${formatTimestamp(msg.timestamp)}</div>
                    </div>
                `;
            }
            
            // Текст
            return `
                <div class="message-wrapper ${isOwn ? 'own' : 'other'}">
                    <div class="message ${isOwn ? 'own' : 'other'}">
                        <strong>${escapeHtml(msg.nick)}</strong>: ${escapeHtml(msg.text)}
                    </div>
                    <div class="timestamp">${formatTimestamp(msg.timestamp)}</div>
                </div>
            `;
        }).join('');
        chatDiv.scrollTop = chatDiv.scrollHeight;
        return;
    }
    
    // === ЛИЧНЫЙ ЧАТ ===
    document.getElementById('currentChatTitle').innerHTML = `💬 Чат с ${escapeHtml(currentChatWith)}`;
    document.getElementById('closeChatBtn').style.display = 'inline-block';
    
    const messages = privateMessages[currentChatWith] || [];
    if (messages.length === 0) {
        chatDiv.innerHTML = '<div class="placeholder">📝 Напишите первое сообщение...</div>';
        return;
    }
    
    chatDiv.innerHTML = messages.map(msg => {
        const sender = msg.isOwn ? 'Вы' : msg.from;
        
        // Картинка
        if (msg.type === 'image') {
            return `
                <div class="message-wrapper ${msg.isOwn ? 'own' : 'other'}">
                    <div class="message ${msg.isOwn ? 'own' : 'other'}">
                        <strong>${escapeHtml(sender)}</strong>:<br>
                        <div class="image-message">
                            <img src="${msg.image}" alt="${escapeHtml(msg.filename)}" data-filename="${escapeHtml(msg.filename)}">
                        </div>
                    </div>
                    <div class="timestamp">${formatTimestamp(msg.timestamp)}</div>
                </div>
            `;
        }
        
        // Текст
        return `
            <div class="message-wrapper ${msg.isOwn ? 'own' : 'other'}">
                <div class="message ${msg.isOwn ? 'own' : 'other'}">
                    <strong>${escapeHtml(sender)}</strong>: ${escapeHtml(msg.text)}
                </div>
                <div class="timestamp">${formatTimestamp(msg.timestamp)}</div>
            </div>
        `;
    }).join('');
    chatDiv.scrollTop = chatDiv.scrollHeight;
}

function addPublicMessage(nick, text, timestamp) {
    publicMessages.push({ nick, text, timestamp, id: msgCounter++ });
    if (currentChatWith === null) {
        renderCurrentChat();
    }
}

function addPrivateMessage(from, to, text, timestamp) {
    const other = (from === currentNick) ? to : from;
    if (!privateMessages[other]) privateMessages[other] = [];
    
    privateMessages[other].push({
        from, to, text, timestamp,
        isOwn: (from === currentNick),
        id: msgCounter++
    });
    
    if (currentChatWith === other) {
        renderCurrentChat();
    } else {
        if (!unreadCount[other]) unreadCount[other] = 0;
        unreadCount[other]++;
        updateUserListUI();
    }
}

function addSystemMessage(text) {
    const chatDiv = document.getElementById('chat');
    // Системные сообщения показываем только в общем чате
    if (currentChatWith !== null) return;
    
    const msgDiv = document.createElement('div');
    msgDiv.className = 'system';
    msgDiv.innerText = text;
    chatDiv.appendChild(msgDiv);
    chatDiv.scrollTop = chatDiv.scrollHeight;
}

function addErrorMessage(text) {
    const chatDiv = document.getElementById('chat');
    const msgDiv = document.createElement('div');
    msgDiv.className = 'error';
    msgDiv.innerText = '⚠️ ' + text;
    chatDiv.appendChild(msgDiv);
    chatDiv.scrollTop = chatDiv.scrollHeight;
    setTimeout(() => msgDiv.remove(), 4000);
}

function sendPublicImage(base64Data, filename) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        addErrorMessage("Нет соединения с сервером");
        return false;
    }
    ws.send(JSON.stringify({
        type: 'public_image',
        image: base64Data,
        filename: filename,
        timestamp: Date.now()
    }));
    return true;
}

function sendPrivateImage(to, base64Data, filename) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        addErrorMessage("Нет соединения с сервером");
        return false;
    }
    ws.send(JSON.stringify({
        type: 'private_image',
        to: to,
        image: base64Data,
        filename: filename,
        timestamp: Date.now()
    }));
    return true;
}

function addPublicImage(nick, imageData, filename, timestamp) {
    publicMessages.push({
        type: 'image',
        nick: nick,
        image: imageData,
        filename: filename,
        timestamp: timestamp,
        id: msgCounter++
    });
    if (currentChatWith === null) {
        renderCurrentChat();
    }
}

function addPrivateImage(from, to, imageData, filename, timestamp) {
    const other = (from === currentNick) ? to : from;
    if (!privateMessages[other]) privateMessages[other] = [];
    
    privateMessages[other].push({
        type: 'image',
        from: from,
        to: to,
        image: imageData,
        filename: filename,
        timestamp: timestamp,
        isOwn: (from === currentNick),
        id: msgCounter++
    });
    
    if (currentChatWith === other) {
        renderCurrentChat();
    } else {
        if (!unreadCount[other]) unreadCount[other] = 0;
        unreadCount[other]++;
        updateUserListUI();
    }
}

function updateUserListUI() {
    const usersList = document.getElementById('userList');
    if (!usersList || !window.userList) return;
    
    // Показываем ВСЕХ пользователей, включая себя
    const users = window.userList;
    
    if (users.length === 0) {
        usersList.innerHTML = '<div style="padding: 16px; color: #888; text-align: center;">Никого нет</div>';
        document.getElementById('onlineCount').innerText = '0 человек';
        return;
    }
    
    document.getElementById('onlineCount').innerText = `${users.length} ${users.length === 1 ? 'человек' : 'человек'}`;
    
    usersList.innerHTML = users.map(name => {
        const isSelf = (name === currentNick);
        const unread = unreadCount[name] || 0;
        const unreadBadge = unread > 0 ? `<span class="unread-badge">${unread}</span>` : '';
        const isActive = (currentChatWith === name);
        
        // Для себя — показываем без кнопки отправки
        if (isSelf) {
            return `
                <div class="user-item ${isActive ? 'current' : ''}">
                    <span class="status"></span>
                    <span class="name">${escapeHtml(name)} (вы)</span>
                </div>
            `;
        }
        
        return `
            <div class="user-item ${isActive ? 'current' : ''}">
                <span class="status"></span>
                <span class="name">${escapeHtml(name)}</span>
                <button class="msg-btn" data-user="${escapeHtml(name)}">✉️ ${unreadBadge}</button>
            </div>
        `;
    }).join('');
    
    document.querySelectorAll('.msg-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const userName = btn.getAttribute('data-user');
            openChatWith(userName);
        });
    });
}

function openChatWith(userName) {
    if (userName === currentNick) {
        addErrorMessage("Нельзя отправить сообщение самому себе");
        return;
    }
    currentChatWith = userName;
    if (unreadCount[userName]) {
        delete unreadCount[userName];
        updateUserListUI();
    }
    renderCurrentChat();
}

function closeCurrentChat() {
    currentChatWith = null;
    renderCurrentChat();
    updateUserListUI();
}

function sendMessage() {
    // Отправка картинки
    if (window.pendingImage) {
        const { imageData, filename } = window.pendingImage;
        
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            addErrorMessage("Нет соединения с сервером");
            return;
        }
        
        if (currentChatWith === null) {
            sendPublicImage(imageData, filename);
        } else {
            sendPrivateImage(currentChatWith, imageData, filename);
        }
        
        // Очищаем превью И сбрасываем pendingImage
        clearImagePreview();
        window.pendingImage = null;
        return;
    }
    
    // Отправка текста
    let text = document.getElementById('message').value.trim();
    if (!text) return;
    
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        addErrorMessage("Нет соединения с сервером");
        return;
    }
    
    if (currentChatWith === null) {
        ws.send(JSON.stringify({ type: 'public', text: text }));
    } else {
        ws.send(JSON.stringify({ type: 'private', to: currentChatWith, text: text }));
    }
    
    document.getElementById('message').value = '';
}

function clearImagePreview() {
    const container = document.getElementById('imagePreviewContainer');
    if (container) {
        container.innerHTML = '';
    }
    window.pendingImage = null;
}

function changeNick() {
    const newNick = document.getElementById('nickInput').value.trim();
    if (!newNick) {
        addErrorMessage("Введите новый ник");
        return;
    }
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        addErrorMessage("Нет соединения с сервером");
        return;
    }
    ws.send(JSON.stringify({ type: 'nick', nick: newNick }));
    document.getElementById('nickInput').value = '';
}

function connect() {
    ws = new WebSocket(WS_URL);
    ws.onopen = () => {
        console.log("Соединено");
        // Отправляем серверу свой ник
        ws.send(JSON.stringify({ type: 'nick', nick: currentUser.nickname }));
    };
    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            
            if (data.type === 'init') {
                currentNick = data.nick;
                document.getElementById('nickInfo').innerText = currentNick;
            }
            else if (data.type === 'public') {
                addPublicMessage(data.nick, data.text, data.timestamp);
            }
            else if (data.type === 'private') {
                addPrivateMessage(data.from, data.to, data.text, data.timestamp);
            }
            else if (data.type === 'user_list') {
                window.userList = data.users;
                updateUserListUI();
            }
            else if (data.type === 'system') {
                addSystemMessage(data.text);
            }
            else if (data.type === 'error') {
                addErrorMessage(data.text);
            }
            else if (data.type === 'nick_changed') {
                currentNick = data.nick;
                document.getElementById('nickInfo').innerText = currentNick;
                addSystemMessage(`Теперь вы ${currentNick}`);
            }
            else if (data.type === 'public_image') {
                addPublicImage(data.nick, data.image, data.filename, data.timestamp);
            }
            else if (data.type === 'private_image') {
                addPrivateImage(data.from, data.to, data.image, data.filename, data.timestamp);
            }
        } catch(e) {
            console.error(e);
        }
    };
    ws.onclose = () => {
        setTimeout(connect, 3000);
    };
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('send').onclick = sendMessage;
    document.getElementById('changeNickBtn').onclick = changeNick;
    document.getElementById('closeChatBtn').onclick = closeCurrentChat;
    document.getElementById('message').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
    document.getElementById('nickInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') changeNick();
    });
    
    // Смайлики
    const emojiBtn = document.getElementById('emojiBtn');
    const emojiPicker = document.getElementById('emojiPicker');
    const messageInput = document.getElementById('message');
    if (emojiBtn) {
        emojiBtn.onclick = (e) => {
            e.stopPropagation();
            emojiPicker.classList.toggle('hidden');
        };
        document.addEventListener('click', (e) => {
            if (!emojiBtn.contains(e.target) && !emojiPicker.contains(e.target)) {
                emojiPicker.classList.add('hidden');
            }
        });
        document.querySelectorAll('.emoji').forEach(emoji => {
            emoji.addEventListener('click', () => {
                const cursorPos = messageInput.selectionStart;
                const newText = messageInput.value.slice(0, cursorPos) + emoji.textContent + messageInput.value.slice(cursorPos);
                messageInput.value = newText;
                messageInput.focus();
                const newPos = cursorPos + emoji.textContent.length;
                messageInput.setSelectionRange(newPos, newPos);
                emojiPicker.classList.add('hidden');
            });
        });
    }
    
    // Модальное окно для картинок
    const modal = document.getElementById('imageModal');
    const modalImg = document.getElementById('modalImage');
    if (modal) {
        document.getElementById('chat').addEventListener('click', (e) => {
            if (e.target.tagName === 'IMG') {
                modal.style.display = 'block';
                modalImg.src = e.target.src;
            }
        });
        modal.onclick = () => { modal.style.display = 'none'; };
        const closeBtn = document.querySelector('.modal-close');
        if (closeBtn) closeBtn.onclick = () => { modal.style.display = 'none'; };
    }
    
    connect();

    // Отправка картинок — с предпросмотром
const fileInput = document.getElementById('fileInput');
if (fileInput) {
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        if (!file.type.startsWith('image/')) {
            addErrorMessage("Можно отправлять только картинки");
            fileInput.value = '';
            return;
        }
        
        if (file.size > 2 * 1024 * 1024) {
            addErrorMessage("Картинка не больше 2 МБ");
            fileInput.value = '';
            return;
        }
        
        const reader = new FileReader();
        reader.onload = (ev) => {
            const imageData = ev.target.result;
            const filename = file.name;
            
            showImagePreview(imageData, filename);
            window.pendingImage = { imageData, filename };
            fileInput.value = '';
        };
        reader.readAsDataURL(file);
    });
}

function showImagePreview(imageData, filename) {
    const container = document.getElementById('imagePreviewContainer');
    if (!container) {
        console.error("imagePreviewContainer not found");
        return;
    }
    
    // Очищаем контейнер
    container.innerHTML = '';
    
    // Создаём превью
    const previewDiv = document.createElement('div');
    previewDiv.className = 'image-preview';
    previewDiv.innerHTML = `
        <div class="preview-container">
            <img src="${imageData}" alt="${escapeHtml(filename)}">
            <span class="preview-filename">${escapeHtml(filename)}</span>
            <button class="preview-remove">✕</button>
        </div>
    `;
    
    container.appendChild(previewDiv);  // ← используем appendChild вместо insertBefore
    
    // Кнопка удаления
    const removeBtn = previewDiv.querySelector('.preview-remove');
    if (removeBtn) {
        removeBtn.onclick = () => {
            container.innerHTML = '';
            window.pendingImage = null;
        };
    }
}
// ========== АВТОРИЗАЦИЯ ==========
const authModal = document.getElementById('authModal');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const authMessage = document.getElementById('authMessage');

function showAuthMessage(text, isError = true) {
    authMessage.textContent = text;
    authMessage.className = 'auth-message ' + (isError ? 'error' : 'success');
    setTimeout(() => {
        authMessage.textContent = '';
        authMessage.className = 'auth-message';
    }, 3000);
}

async function login(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
        showAuthMessage(error.message);
        return false;
    }
    
    // Получаем профиль пользователя
    const { data: profile } = await supabase
        .from('profiles')
        .select('nickname')
        .eq('id', data.user.id)
        .single();
    
    currentUser = {
        id: data.user.id,
        email: data.user.email,
        nickname: profile?.nickname || data.user.email.split('@')[0]
    };
    
    // Обновляем last_seen
    await supabase
        .from('profiles')
        .update({ last_seen: new Date() })
        .eq('id', currentUser.id);
    
    return true;
}

async function register(nickname, email, password) {
    // Проверяем уникальность никнейма
    const { data: existing } = await supabase
        .from('profiles')
        .select('nickname')
        .eq('nickname', nickname)
        .single();
    
    if (existing) {
        showAuthMessage('Никнейм уже занят');
        return false;
    }
    
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { nickname } }
    });
    
    if (error) {
        showAuthMessage(error.message);
        return false;
    }
    
    showAuthMessage('Регистрация успешна! Теперь войдите', false);
    showLoginForm();
    return false;
}

function showLoginForm() {
    loginForm.style.display = 'block';
    registerForm.style.display = 'none';
}

function showRegisterForm() {
    loginForm.style.display = 'none';
    registerForm.style.display = 'block';
}

async function checkAuth() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        const { data: profile } = await supabase
            .from('profiles')
            .select('nickname')
            .eq('id', session.user.id)
            .single();
        
        currentUser = {
            id: session.user.id,
            email: session.user.email,
            nickname: profile?.nickname || session.user.email.split('@')[0]
        };
        
        document.body.classList.add('authorized');
        authModal.style.display = 'none';
        
        // Запускаем чат
        initChat();
        return true;
    }
    return false;
}

async function logout() {
    await supabase.auth.signOut();
    currentUser = null;
    document.body.classList.remove('authorized');
    authModal.style.display = 'flex';
    // Закрываем WebSocket если был
    if (ws) ws.close();
}

// Обработчики событий
document.getElementById('loginBtn').onclick = async () => {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    if (await login(email, password)) {
        location.reload(); // Перезагружаем для применения
    }
};

document.getElementById('registerBtn').onclick = async () => {
    const nickname = document.getElementById('regNickname').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;
    await register(nickname, email, password);
};

document.getElementById('showRegisterBtn').onclick = showRegisterForm;
document.getElementById('showLoginBtn').onclick = showLoginForm;
document.getElementById('closeAuthModal').onclick = () => {
    authModal.style.display = 'none';
    showAuthMessage('Без авторизации чат не работает', true);
    setTimeout(() => { authModal.style.display = 'flex'; }, 2000);
};

// Проверяем авторизацию при загрузке
checkAuth();
});