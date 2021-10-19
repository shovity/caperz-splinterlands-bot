const { parentPort, workerData } = require('worker_threads')

const splinterlandsWorker = require('./splinterlands/worker')


// const io = require('socket.io-client')

// const client = io(`https://socket.hubapp.io/dev`)

// client.emit('login', { id:  'child worker', username: 'child worker ' + Date.now() })

// parentPort.postMessage('im worker')

// parentPort.on('message', (m) => {
//     console.log(m)
// })


// hard set defualt
// require('./splinterlands/index.js')

switch (workerData.worker.name) {
    case 'splinterlands':
        splinterlandsWorker(workerData)
        break

    default:
        console.error('worker: worker engine notfound')
}