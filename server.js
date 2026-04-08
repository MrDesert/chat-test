const WebSocket = require('ws');
const server = new WebSocket.Server({ port: process.env.PORT || 8080 });

let clients = [];
let nextId = 1;

function findClientByName(name) {
    return clients.find(c => c.name.toLowerCase() === name.toLowerCase());
}

function findClientByWs(ws) {
    return clients.find(c => c.ws === ws);
}

function broadcastUserList() {
    const userList = clients.map(c => c.name);
    clients.forEach(client => {
        if (client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(JSON.stringify({
                type: 'user_list',
                users: userList
            }));
        }
    });
}

function sendToUser(toName, data) {
    const recipient = findClientByName(toName);
    if (recipient && recipient.ws.readyState === WebSocket.OPEN) {
        recipient.ws.send(JSON.stringify(data));
    }
}

server.on('connection', (ws) => {
    const guestName = `Гость-${nextId++}`;
    const client = { ws, name: guestName };
    clients.push(client);

    ws.send(JSON.stringify({ type: 'init', nick: guestName }));
    broadcastUserList();

    ws.on('message', (raw) => {
        try {
            const data = JSON.parse(raw);
            const sender = findClientByWs(ws);
            if (!sender) return;

            // === ОБЩИЙ ЧАТ ===
            if (data.type === 'public') {
                const message = {
                    type: 'public',
                    nick: sender.name,
                    text: data.text,
                    timestamp: Date.now()
                };
                // Рассылаем ВСЕМ (включая отправителя)
                clients.forEach(c => {
                    if (c.ws.readyState === WebSocket.OPEN) {
                        c.ws.send(JSON.stringify(message));
                    }
                });
            }
            
            // === ЛИЧНОЕ СООБЩЕНИЕ ===
            else if (data.type === 'private') {
                const recipientName = data.to;
                const recipient = findClientByName(recipientName);
                
                if (!recipient) {
                    ws.send(JSON.stringify({
                        type: 'error',
                        text: `Пользователь ${recipientName} не найден`
                    }));
                    return;
                }

                const message = {
                    type: 'private',
                    from: sender.name,
                    to: recipientName,
                    text: data.text,
                    timestamp: Date.now()
                };

                // Отправляем получателю
                sendToUser(recipientName, message);
                
                // Отправляем отправителю
                ws.send(JSON.stringify(message));
            }
            
            // === СМЕНА НИКА ===
            else if (data.type === 'nick') {
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
                
                const oldName = sender.name;
                sender.name = newName;
                
                ws.send(JSON.stringify({ type: 'nick_changed', nick: newName }));
                
                clients.forEach(c => {
                    if (c.ws !== ws && c.ws.readyState === WebSocket.OPEN) {
                        c.ws.send(JSON.stringify({
                            type: 'system',
                            text: `${oldName} → ${newName}`
                        }));
                    }
                });
                
                broadcastUserList();
            }
        } catch(e) {
            console.error(e);
        }
    });

    ws.on('close', () => {
        const index = clients.findIndex(c => c.ws === ws);
        if (index !== -1) {
            const leftName = clients[index].name;
            clients.splice(index, 1);
            
            clients.forEach(c => {
                if (c.ws.readyState === WebSocket.OPEN) {
                    c.ws.send(JSON.stringify({
                        type: 'system',
                        text: `${leftName} покинул чат`
                    }));
                }
            });
            
            broadcastUserList();
        }
    });
});