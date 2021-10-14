const io = require('socket.io-client')

const client = io(`https://socket.hubapp.io/dev`)

client.emit('login', { id:  'child worker', username: 'child worker ' + Date.now() })