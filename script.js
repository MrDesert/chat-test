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
    
    if (currentChatWith === null) {
        // Общий чат
        document.getElementById('currentChatTitle').innerHTML = '💬 Общий чат';
        document.getElementById('closeChatBtn').style.display = 'none';
        
        if (publicMessages.length === 0) {
            chatDiv.innerHTML = '<div class="placeholder">💬 Напишите первое сообщение в общий чат</div>';
            return;
        }
        
        chatDiv.innerHTML = publicMessages.map(msg => {
            const isOwn = (msg.nick === currentNick);
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
    
    // Личный чат
    document.getElementById('currentChatTitle').innerHTML = `💬 Чат с ${escapeHtml(currentChatWith)}`;
    document.getElementById('closeChatBtn').style.display = 'inline-block';
    
    const messages = privateMessages[currentChatWith] || [];
    if (messages.length === 0) {
        chatDiv.innerHTML = '<div class="placeholder">📝 Напишите первое сообщение...</div>';
        return;
    }
    
    chatDiv.innerHTML = messages.map(msg => {
        const sender = msg.isOwn ? 'Вы' : msg.from;
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
    if (currentChatWith !== null) return;
    const msgDiv = document.createElement('div');
    msgDiv.className = 'system';
    msgDiv.innerText = text;
    chatDiv.appendChild(msgDiv);
    chatDiv.scrollTop = chatDiv.scrollHeight;
    setTimeout(() => msgDiv.remove(), 4000);
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

function updateUserListUI() {
    const usersList = document.getElementById('userList');
    if (!usersList || !window.userList) return;
    
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
        const isActive = (currentChatWith === name);
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
    const text = document.getElementById('message').value.trim();
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
});