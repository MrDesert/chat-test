const WebSocket = require('ws');
const server = new WebSocket.Server({ port: process.env.PORT || 8080 });

let clients = [];
let nextId = 1;

function findClientByName(name) {
    return clients.find(c => c.name.toLowerCase() === name.toLowerCase());
}

// Рассылка всем (опционально исключая отправителя)
function broadcast(data, excludeWs = null) {
    clients.forEach(client => {
        if (client.ws !== excludeWs && client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(JSON.stringify(data));
        }
    });
}

// Рассылка системного сообщения
function broadcastSystemMessage(text, excludeWs = null) {
    broadcast({ type: 'system', text }, excludeWs);
}

// Рассылка актуального списка пользователей
function broadcastUserList() {
    const userList = clients.map(c => c.name);
    broadcast({ type: 'user_list', users: userList });
}

server.on('connection', (ws) => {
    const guestName = `Гость-${nextId++}`;
    const client = { ws, name: guestName };
    clients.push(client);

    // Отправляем клиенту его имя
    ws.send(JSON.stringify({ type: 'init', nick: guestName }));
    
    // Оповещаем всех о новом пользователе
    broadcastSystemMessage(`${guestName} присоединился к чату`);
    broadcastUserList();

    ws.on('message', (raw) => {
        try {
            const data = JSON.parse(raw);
            
            if (data.type === 'nick') {
                const newName = data.nick.trim();
                
                if (!newName || newName.length < 2) {
                    ws.send(JSON.stringify({ type: 'error', text: 'Имя должно быть не короче 2 символов' }));
                    return;
                }
                if (newName.length > 20) {
                    ws.send(JSON.stringify({ type: 'error', text: 'Имя не должно быть длиннее 20 символов' }));
                    return;
                }
                if (!/^[a-zA-Zа-яА-Я0-9_-]+$/.test(newName)) {
                    ws.send(JSON.stringify({ type: 'error', text: 'Имя может содержать только буквы, цифры, - и _' }));
                    return;
                }
                if (findClientByName(newName)) {
                    ws.send(JSON.stringify({ type: 'error', text: `Имя "${newName}" уже занято` }));
                    return;
                }
                
                const oldName = client.name;
                client.name = newName;
                
                ws.send(JSON.stringify({ type: 'nick_changed', nick: newName }));
                broadcastSystemMessage(`${oldName} → ${newName}`);
                broadcastUserList();
                return;
            }
            
            // Обычное текстовое сообщение
            if (data.text) {
                const message = {
                    type: 'message',
                    nick: client.name,
                    text: data.text,
                    timestamp: Date.now()
                };
                clients.forEach(c => {
                    if (c.ws.readyState === WebSocket.OPEN) {
                        c.ws.send(JSON.stringify(message));
                    }
                });
                return;
            }
            
            // ← НОВЫЙ БЛОК: обработка картинок
            if (data.type === 'image') {
                const message = {
                    type: 'image',
                    nick: client.name,
                    image: data.image,
                    filename: data.filename,
                    timestamp: Date.now()
                };
                clients.forEach(c => {
                    if (c.ws.readyState === WebSocket.OPEN) {
                        c.ws.send(JSON.stringify(message));
                    }
                });
                return;
            }
            
        } catch(e) {
            console.error('Ошибка обработки сообщения:', e);
        }
    });

    ws.on('close', () => {
        const index = clients.findIndex(c => c.ws === ws);
        if (index !== -1) {
            const leftName = clients[index].name;
            clients.splice(index, 1);
            broadcastSystemMessage(`${leftName} покинул чат`);
            broadcastUserList();
        }
    });
});