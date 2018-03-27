
const crypto = require('crypto');
const events = new (require('events'))(); //eslint-disable-line

const authorize = (secret) =>
  crypto
    .createHash('sha1')
    .update(`${secret}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest('base64');

const handshake = ({ headers }) =>
  [
    'HTTP/1.1 101 Switching Protocol',
    'Upgrade: WebSocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${authorize(headers['sec-websocket-key'])}`,
    '\r\n'
  ].join('\r\n');

const encode = (socket, data) => {
  const length = Buffer.byteLength(data, 'uf8');

  let encodeBuffer = null;

  if (length <= 125) {
    encodeBuffer = new Buffer(length + 2);

    encodeBuffer.writeUInt8(length, 1);

    encodeBuffer.write(data, 2);
  } else if (length >= 126 && length <= 65535) {
    encodeBuffer = new Buffer(length + 4);

    encodeBuffer.writeUInt8(126, 1);
    encodeBuffer.writeUInt16BE(length, 2);

    encodeBuffer.write(data + 3, 4);
  } else {
    encodeBuffer = new Buffer(length + 10);

    encodeBuffer.writeUInt8(127, 1);
    encodeBuffer.writeUInt32BE(0, 2);
    encodeBuffer.writeUInt32BE(length, 6);

    encodeBuffer.write(data, 10);
  }
  encodeBuffer.writeUInt8(129, 0);

  return socket.write(encodeBuffer);
};

const bufferSchema = () => ({
  offset: null,
  decode: null,
  mask: null,
  head: null,
  data: null,
  size: 0
});

const ping = (socket) => {
  const pingBuffer = new Buffer(2);

  pingBuffer.writeUInt8(137, 0);

  return setInterval(() => {
    socket.write(pingBuffer);
  }, 10000);
};

module.exports = (server) => {
  server.on('upgrade', (req, socket) => {
    socket.write(handshake(req));
    socket.buffer = bufferSchema();
    socket.send = encode.bind(this, socket);

    events.emit('connect', socket);

    socket.on('data', (data) => {
      if (data.readUInt8(0) === 136 || data.readUInt8(0) === 138) { return false; }

      if (!socket.buffer.data) {
        if (!socket.buffer.head) { socket.buffer.head = data.readUInt8(1) - 128; }

        switch (socket.buffer.head) {
          case 126:
            socket.buffer.offset = 4;
            socket.buffer.data = new Buffer((data.readUInt8(2) << 8) + data.readUInt8(3));
            break;
          case 127:
            socket.buffer.offset = 10;
            socket.buffer.data = new Buffer((data.readUInt32BE(2) << 32) + data.readUInt32BE(6));
            break;
          default:
            socket.buffer.offset = 2;
            socket.buffer.data = new Buffer(socket.buffer.head);
        }
        socket.buffer.mask = data.slice(socket.buffer.offset, socket.buffer.offset + 4);
      }

      if (socket.buffer.data.length > socket.buffer.size) {
        const buffer = data.slice(socket.buffer.offset + 4, data.length);

        for (let c = 0; c < buffer.length; c += 1) {
          socket.buffer.data[c + socket.buffer.size] = buffer[c];
        }
        socket.buffer.size += buffer.length;
      }

      if (socket.buffer.data.length <= socket.buffer.size) {
        socket.buffer.decode = new Buffer(socket.buffer.data.length);

        for (let c = 0; c < socket.buffer.data.length; c += 1) {
          socket.buffer.decode[c] = socket.buffer.data[c] ^ socket.buffer.mask[c % 4];
        }
        events.emit('message', socket.buffer.decode.toString('utf8'));

        socket.buffer = bufferSchema();
      }

      return null;
    });

    ping(socket);
  });

  return events;
};
