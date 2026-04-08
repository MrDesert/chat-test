const WebSocket = require('ws');
const server = new WebSocket.Server({ port: process.env.PORT || 8080 });

let clients = [];
let nextId = 1;

// Вспомогательная функция: поиск клиента по имени
function findClientByName(name) {
    return clients.find(c => c.name.toLowerCase() === name.toLowerCase());
}

// Вспомогательная функция: рассылка всем (кроме опционального отправителя)
function broadcast(data, excludeWs = null) {
    clients.forEach(client => {
        if (client.ws !== excludeWs && client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(JSON.stringify(data));
        }
    });
}

// Вспомогательная функция: уведомление в чат
function broadcastSystemMessage(text, excludeWs = null) {
    broadcast({ type: 'system', text }, excludeWs);
}

server.on('connection', (ws) => {
    const guestName = `Гость-${nextId++}`;
    const client = { ws, name: guestName };
    clients.push(client);

    // Отправляем клиенту его имя
    ws.send(JSON.stringify({ type: 'init', nick: guestName }));
    
    // Оповещаем всех, что новый пользователь зашёл
    broadcastSystemMessage(`${guestName} присоединился к чату`);

    ws.on('message', (raw) => {
        try {
            const data = JSON.parse(raw);
            
            // Обработка команды смены ника
            if (data.type === 'nick') {
                const newName = data.nick.trim();
                
                // Проверки
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
                
                // Подтверждение смены ника для самого пользователя
                ws.send(JSON.stringify({ type: 'nick_changed', nick: newName }));
                
                // Оповещение всех о смене имени
                broadcastSystemMessage(`${oldName} → ${newName}`);
                return;
            }
            
            // Обычное сообщение
            if (data.text) {
                const message = {
                    type: 'message',
                    nick: client.name,
                    text: data.text, 
                    timestamp: Date.now()  // Добавляем время
                };
                // Рассылаем всем (включая отправителя)
                clients.forEach(c => {
                    if (c.ws.readyState === WebSocket.OPEN) {
                        c.ws.send(JSON.stringify(message));
                    }
                });
            }
        } catch(e) {}
    });

    ws.on('close', () => {
        const index = clients.findIndex(c => c.ws === ws);
        if (index !== -1) {
            const leftName = clients[index].name;
            clients.splice(index, 1);
            broadcastSystemMessage(`${leftName} покинул чат`);
        }
    });
});