const WebSocket = require('ws');
const server = new WebSocket.Server({ port: process.env.PORT || 8080 });

let clients = [];
let nextId = 1;

server.on('connection', (ws) => {
    const guestName = `Гость-${nextId++}`;
    const client = { ws, name: guestName };
    clients.push(client);

    // Отправляем клиенту его имя
    ws.send(JSON.stringify({ type: 'init', nick: guestName }));

    ws.on('message', (raw) => {
        try {
            const data = JSON.parse(raw);
            // Рассылаем всем, добавляя имя отправителя
            const message = {
                type: 'message',
                nick: client.name,
                text: data.text
            };
            clients.forEach(c => {
                if (c.ws.readyState === WebSocket.OPEN) {
                    c.ws.send(JSON.stringify(message));
                }
            });
        } catch(e) {}
    });

    ws.on('close', () => {
        const index = clients.findIndex(c => c.ws === ws);
        if (index !== -1) clients.splice(index, 1);
    });
});