const WS_URL = "wss://chat-test-gb86.onrender.com";

let ws = null;
let currentNick = "";
let messagesList = [];
let updateInterval = null;
let msgCounter = 0;

function formatTimestamp(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
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

function updateAllTimestamps() {
    messagesList.forEach(item => {
        const timestampEl = document.getElementById(`ts-${item.id}`);
        if (timestampEl) {
            const newText = formatTimestamp(item.timestamp);
            if (timestampEl.innerText !== newText) {
                timestampEl.innerText = newText;
            }
        }
    });
}

function startTimestampUpdater() {
    if (updateInterval) clearInterval(updateInterval);
    updateInterval = setInterval(updateAllTimestamps, 60000);
}

function addMessage(nick, text, isOwn, timestamp, msgId) {
    const chatDiv = document.getElementById('chat');
    const wrapper = document.createElement('div');
    wrapper.className = 'message-wrapper ' + (isOwn ? 'own' : 'other');
    wrapper.id = `msg-${msgId}`;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message ' + (isOwn ? 'own' : 'other');
    messageDiv.innerHTML = `<strong>${escapeHtml(nick)}</strong>: ${escapeHtml(text)}`;
    
    const timestampDiv = document.createElement('div');
    timestampDiv.className = 'timestamp';
    timestampDiv.id = `ts-${msgId}`;
    timestampDiv.innerText = formatTimestamp(timestamp);
    
    wrapper.appendChild(messageDiv);
    wrapper.appendChild(timestampDiv);
    chatDiv.appendChild(wrapper);
    chatDiv.scrollTop = chatDiv.scrollHeight;
    
    messagesList.push({ id: msgId, timestamp });
}

function updateUserList(users) {
    const userListDiv = document.getElementById('userList');
    const count = users.length;
    document.getElementById('onlineCount').innerText = `${count} ${count === 1 ? 'человек' : 'человек'}`;
    
    if (users.length === 0) {
        userListDiv.innerHTML = '<div style="padding: 16px; color: #888; text-align: center;">Никого нет</div>';
        return;
    }
    
    userListDiv.innerHTML = users.map(name => `
        <div class="user-item ${name === currentNick ? 'current' : ''}">
            <span class="status"></span>
            <span class="name">${escapeHtml(name)}</span>
            ${name === currentNick ? '<span style="font-size: 10px; color: #888;">(вы)</span>' : ''}
        </div>
    `).join('');
}

function addSystemMessage(text) {
    const chatDiv = document.getElementById('chat');
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
}

function escapeHtml(str) {
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

function sendImage(base64Data, filename) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        addErrorMessage("Нет соединения с сервером");
        return;
    }
    
    const message = {
        type: 'image',
        nick: currentNick,
        image: base64Data,
        filename: filename,
        timestamp: Date.now()
    };
    ws.send(JSON.stringify(message));
}

function addImageMessage(nick, imageData, filename, isOwn, timestamp, msgId) {
    const chatDiv = document.getElementById('chat');
    const wrapper = document.createElement('div');
    wrapper.className = 'message-wrapper ' + (isOwn ? 'own' : 'other');
    wrapper.id = `msg-${msgId}`;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message ' + (isOwn ? 'own' : 'other');
    
    const nameSpan = `<strong>${escapeHtml(nick)}</strong>`;
    const imgElement = `<div class="image-message"><img src="${imageData}" alt="${escapeHtml(filename)}" title="${escapeHtml(filename)}"></div>`;
    
    messageDiv.innerHTML = nameSpan + ': ' + imgElement;
    
    const timestampDiv = document.createElement('div');
    timestampDiv.className = 'timestamp';
    timestampDiv.id = `ts-${msgId}`;
    timestampDiv.innerText = formatTimestamp(timestamp);
    
    wrapper.appendChild(messageDiv);
    wrapper.appendChild(timestampDiv);
    chatDiv.appendChild(wrapper);
    chatDiv.scrollTop = chatDiv.scrollHeight;
    
    messagesList.push({ id: msgId, timestamp });
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
        else if (data.type === 'message') {
            const isOwn = (data.nick === currentNick);
            const msgId = msgCounter++;
            addMessage(data.nick, data.text, isOwn, data.timestamp, msgId);
        }
        // ← НОВЫЙ БЛОК: обработка картинок
        else if (data.type === 'image') {
            const isOwn = (data.nick === currentNick);
            const msgId = msgCounter++;
            addImageMessage(data.nick, data.image, data.filename, isOwn, data.timestamp, msgId);
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
            addSystemMessage(`Вы теперь ${currentNick}`);
        }
        else if (data.type === 'user_list') {
            updateUserList(data.users);
        }
    } catch(e) {
        console.error(e);
    }
};
    ws.onclose = () => {
        console.log("Отключено, переподключение через 3с");
        setTimeout(connect, 3000);
    };
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

function sendMessage() {
    let text = document.getElementById('message').value.trim();
    if (!text) return;

    if (text.startsWith('/nick ')) {
        const newNick = text.slice(6).trim();
        if (newNick) {
            if (!ws || ws.readyState !== WebSocket.OPEN) {
                addErrorMessage("Нет соединения с сервером");
                return;
            }
            ws.send(JSON.stringify({ type: 'nick', nick: newNick }));
        }
        document.getElementById('message').value = '';
        return;
    }

    if (!ws || ws.readyState !== WebSocket.OPEN) {
        addErrorMessage("Сервер ещё не подключён");
        return;
    }

    ws.send(JSON.stringify({ text }));
    document.getElementById('message').value = '';
}

// Инициализация после загрузки DOM
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('send').onclick = sendMessage;
    document.getElementById('changeNickBtn').onclick = changeNick;
    document.getElementById('message').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
    document.getElementById('nickInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') changeNick();
    });
    
    connect();
    startTimestampUpdater();

    // Смайлики
    const emojiBtn = document.getElementById('emojiBtn');
    const emojiPicker = document.getElementById('emojiPicker');
    const messageInput = document.getElementById('message');

    if (emojiBtn) {
        emojiBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            emojiPicker.classList.toggle('hidden');
        });
    
        // Закрыть панель при клике вне её
        document.addEventListener('click', (e) => {
            if (!emojiBtn.contains(e.target) && !emojiPicker.contains(e.target)) {
                emojiPicker.classList.add('hidden');
            }
        });
    
        // Вставка смайлика в поле ввода
        document.querySelectorAll('.emoji').forEach(emoji => {
            emoji.addEventListener('click', () => {
                const currentText = messageInput.value;
                const cursorPos = messageInput.selectionStart;
                const newText = currentText.slice(0, cursorPos) + emoji.textContent + currentText.slice(cursorPos);
                messageInput.value = newText;
                messageInput.focus();
                const newCursorPos = cursorPos + emoji.textContent.length;
                messageInput.setSelectionRange(newCursorPos, newCursorPos);
                emojiPicker.classList.add('hidden');
            });
        });
    }

    // Отправка картинок
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
            sendImage(ev.target.result, file.name);
            fileInput.value = '';
        };
        reader.readAsDataURL(file);
    });
}

// Модальное окно для увеличения картинок
const modal = document.getElementById('imageModal');
const modalImg = document.getElementById('modalImage');
const modalClose = document.querySelector('.modal-close');

// Открытие модального окна при клике на любую картинку в чате
document.getElementById('chat').addEventListener('click', (e) => {
    if (e.target.tagName === 'IMG') {
        modal.style.display = 'block';
        modalImg.src = e.target.src;
    }
});

// Закрытие по клику на крестик
if (modalClose) {
    modalClose.onclick = () => {
        modal.style.display = 'none';
    };
}

// Закрытие по клику на фон
modal.onclick = () => {
    modal.style.display = 'none';
};

});