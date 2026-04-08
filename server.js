const WebSocket = require('ws');
const server = new WebSocket.Server({ port: process.env.PORT || 8080 });

const clients = [];

server.on('connection', (ws) => {
    clients.push(ws);

    ws.on('message', (raw) => {
        try {
            const data = JSON.parse(raw);
            // рассылаем всем, включая отправителя
            clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(data));
                }
            });
        } catch(e) {}
    });

    ws.on('close', () => {
        const index = clients.indexOf(ws);
        if (index !== -1) clients.splice(index, 1);
    });
});