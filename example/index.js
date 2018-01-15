
const fs = require('fs');
const http = require('http');

const socker = require(`${__dirname}/../src/socket`);

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(fs.readFileSync(`${__dirname}/index.html`, 'utf8'));
}).listen(8080);

const connection = socker(server);

connection.on('connect', (socket) => {
  connection.on('message', (data) => {
    console.log(`message: ${data}`);

    socket.send(`message: ${data}`);
  });
});
