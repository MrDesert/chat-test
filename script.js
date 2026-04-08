const WS_URL = "wss://chat-test-gb86.onrender.com";

let ws = null;
let currentNick = "";
let currentChatWith = null; // с кем сейчас открыт чат
let privateMessages = {};    // { "Вася": [{from, text, timestamp, isOwn}] }
let unreadCount = {};         // { "Вася": 3 }
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
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

function addPrivateMessage(from, to, text, timestamp, isOwn) {
    const other = isOwn ? to : from;
    if (!privateMessages[other]) privateMessages[other] = [];
    
    privateMessages[other].push({
        from, to, text, timestamp, isOwn, id: msgCounter++
    });
    
    // Если чат с этим человеком открыт — показываем сразу
    if (currentChatWith === other) {
        renderCurrentChat();
    } else {
        // Иначе увеличиваем счётчик непрочитанных
        if (!unreadCount[other]) unreadCount[other] = 0;
        unreadCount[other]++;
        updateUserListUI();
    }
}

function renderCurrentChat() {
    const chatDiv = document.getElementById('chat');
    if (!currentChatWith) {
        chatDiv.innerHTML = '<div class="placeholder">👈 Нажмите на ✉️ у пользователя, чтобы начать диалог</div>';
        document.getElementById('currentChatTitle').innerText = '💬 Выберите чат';
        document.getElementById('closeChatBtn').style.display = 'none';
        return;
    }
    
    document.getElementById('currentChatTitle').innerHTML = `💬 Чат с ${escapeHtml(currentChatWith)}`;
    document.getElementById('closeChatBtn').style.display = 'inline-block';
    
    const messages = privateMessages[currentChatWith] || [];
    if (messages.length === 0) {
        chatDiv.innerHTML = '<div class="placeholder">📝 Напишите первое сообщение...</div>';
        return;
    }
    
    chatDiv.innerHTML = messages.map(msg => {
        const isOwn = msg.isOwn;
        const sender = isOwn ? 'Вы' : msg.from;
        return `
            <div class="message-wrapper ${isOwn ? 'own' : 'other'}">
                <div class="message ${isOwn ? 'own' : 'other'}">
                    <strong>${escapeHtml(sender)}</strong>: ${escapeHtml(msg.text)}
                </div>
                <div class="timestamp">${formatTimestamp(msg.timestamp)}</div>
            </div>
        `;
    }).join('');
    
    chatDiv.scrollTop = chatDiv.scrollHeight;
}

function updateUserListUI() {
    const usersList = document.getElementById('userList');
    if (!usersList) return;
    
    // Получаем список пользователей от сервера (хранится в глобальной переменной)
    if (!window.userList) return;
    
    const users = window.userList.filter(u => u !== currentNick);
    
    if (users.length === 0) {
        usersList.innerHTML = '<div style="padding: 16px; color: #888; text-align: center;">Никого нет</div>';
        document.getElementById('onlineCount').innerText = '0 человек';
        return;
    }
    
    document.getElementById('onlineCount').innerText = `${users.length} ${users.length === 1 ? 'человек' : 'человек'}`;
    
    usersList.innerHTML = users.map(name => {
        const unread = unreadCount[name] || 0;
        const unreadBadge = unread > 0 ? `<span class="unread-badge">${unread}</span>` : '';
        return `
            <div class="user-item ${name === currentChatWith ? 'current' : ''}">
                <span class="status"></span>
                <span class="name">${escapeHtml(name)}</span>
                <button class="msg-btn" data-user="${escapeHtml(name)}">✉️ ${unreadBadge}</button>
            </div>
        `;
    }).join('');
    
    // Вешаем обработчики на кнопки
    document.querySelectorAll('.msg-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const userName = btn.getAttribute('data-user');
            openChatWith(userName);
        });
    });
}

function openChatWith(userName) {
    currentChatWith = userName;
    // Сбрасываем счётчик непрочитанных для этого пользователя
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

function addSystemMessage(text) {
    const chatDiv = document.getElementById('chat');
    if (currentChatWith) return; // системные только в общем виде, но у нас нет общего чата
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
    setTimeout(() => msgDiv.remove(), 3000);
}

function sendPrivateMessage(to, text) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        addErrorMessage("Нет соединения с сервером");
        return false;
    }
    ws.send(JSON.stringify({
        type: 'private',
        to: to,
        text: text
    }));
    return true;
}

function sendMessage() {
    let text = document.getElementById('message').value.trim();
    if (!text) return;
    if (!currentChatWith) {
        addErrorMessage("Сначала выберите чат (нажмите ✉️ у пользователя)");
        return;
    }
    if (sendPrivateMessage(currentChatWith, text)) {
        // Добавляем сообщение в локальный список
        addPrivateMessage(currentNick, currentChatWith, text, Date.now(), true);
        document.getElementById('message').value = '';
        renderCurrentChat();
    }
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
    ws.onopen = () => console.log("Соединено");
    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.type === 'init') {
                currentNick = data.nick;
                document.getElementById('nickInfo').innerText = currentNick;
            }
            else if (data.type === 'private') {
                const isOwn = (data.from === currentNick);
                addPrivateMessage(data.from, data.to, data.text, data.timestamp, isOwn);
                if (currentChatWith === (isOwn ? data.to : data.from)) {
                    renderCurrentChat();
                }
                updateUserListUI();
            }
            else if (data.type === 'user_list') {
                window.userList = data.users;
                updateUserListUI();
            }
            else if (data.type === 'error') {
                addErrorMessage(data.text);
            }
            else if (data.type === 'nick_changed') {
                currentNick = data.nick;
                document.getElementById('nickInfo').innerText = currentNick;
                // Обновляем все сообщения, где был старый ник — сложно, проще очистить историю
                privateMessages = {};
                unreadCount = {};
                currentChatWith = null;
                renderCurrentChat();
                updateUserListUI();
                addErrorMessage("Ник изменён. История чатов очищена.");
            }
        } catch(e) {
            console.error(e);
        }
    };
    ws.onclose = () => {
        setTimeout(connect, 3000);
    };
}

// Инициализация
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
    
    // Картинки
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
                // TODO: отправка картинок в ЛС (пока не реализовано, чтобы не усложнять)
                addErrorMessage("Отправка картинок в ЛС пока в разработке");
                fileInput.value = '';
            };
            reader.readAsDataURL(file);
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
        document.querySelector('.modal-close').onclick = () => { modal.style.display = 'none'; };
    }
    
    connect();
});