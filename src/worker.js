const { parentPort } = require('worker_threads');
const io = require('socket.io-client')

const client = io(`https://socket.hubapp.io/dev`)

client.emit('login', { id:  'child worker', username: 'child worker ' + Date.now() })

parentPort.postMessage('im worker')

parentPort.on('message', (m) => {
    console.log(m)
})