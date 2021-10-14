// Master will manage all worker
// Master will run in main process

const { fork } = require('child_process')
const path = require('path')


const master = {
    workers: [],
}


master.add = async () => {
    const worker = {}

    worker.controller = new AbortController()
    worker.child = fork(path.join(__dirname, 'worker.js'), [], { signal: worker.controller.signal })
    worker.status = 'running'

    worker.child.on('error', (err) => {
        worker.status = 'error'
    })

    // setup woker






    master.workers.push(worker)
}

master.remove = async () => {
    
}

master.removeAll = async () => {
    for (const worker of master.workers) {
        worker.controller.abort()
        worker.status = 'stopped'
    }

    master.workers = []
}


module.exports = master