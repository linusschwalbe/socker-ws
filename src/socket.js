
const crypto = require('crypto');
const events = new (require('events'))();

module.exports = (server) => {
  server.on('upgrade', (req, socket) => {
    socket.write(_handshake(req));
    socket.buffer = _buffer();
    socket.send = _encode.bind(this, socket);

    events.emit('connect', socket);

    socket.on('data', (data) => {
      if (data.readUInt8(0) === 136 || data.readUInt8(0) === 138) { return false; }

      if (!socket.buffer.data) {
        if (!socket.buffer.head) { socket.buffer.head = (data.readUInt8(1) - 128); }

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

        for (let c = 0; c < buffer.length; c++) {
          socket.buffer.data[c + socket.buffer.size] = buffer[c];
        }
        socket.buffer.size += buffer.length;
      }

      if (socket.buffer.data.length <= socket.buffer.size) {
        socket.buffer.decode = new Buffer(socket.buffer.data.length);

        for (let c = 0; c < socket.buffer.data.length; c++) {
          socket.buffer.decode[c] = (socket.buffer.data[c] ^ socket.buffer.mask[c % 4]);
        }
        events.emit('message', socket.buffer.decode.toString('utf8'));

        socket.buffer = _buffer();
      }
    });

    _ping(socket);
  });

  return events;
}

const _handshake = ({ headers }) => {
  return [
    'HTTP/1.1 101 Switching Protocol',
    'Upgrade: WebSocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${_authorize(headers['sec-websocket-key'])}`,
    '\r\n'
  ].join('\r\n');
}

const _authorize = (secret) => {
  return crypto
    .createHash('sha1')
    .update(`${secret}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest('base64');
}

const _encode = (socket, data) => {
  const length = Buffer.byteLength(data, 'uf8');

  let encode = null;

  if (length <= 125) {
    encode = new Buffer(length + 2);

    encode.writeUInt8(length, 1);

    encode.write(data, 2);
  } else if (length >= 126 && length <= 65535){
    encode = new Buffer(length + 4);

    encode.writeUInt8(126, 1);
    encode.writeUInt16BE(length, 2);

    encode.write(data + 3, 4);
  } else {
    encode = new Buffer(length + 10);

    encode.writeUInt8(127, 1);
    encode.writeUInt32BE(0, 2);
    encode.writeUInt32BE(length, 6);

    encode.write(data, 10);
  }
  encode.writeUInt8(129, 0);

  return socket.write(encode);
}

const _buffer = () => {
  return {
    offset: null,
    decode: null,
    mask: null,
    head: null,
    data: null,
    size: 0
  }
}

const _ping = (socket) => {
  const ping = new Buffer(2);
        ping.writeUInt8(137, 0);

  return setInterval(() => {
    socket.write(ping);
  }, 10000);
}
