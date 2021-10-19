// Master will manage all worker
// Master will run in main process

const { Worker } = require('worker_threads')
const path = require('path')


const master = {
    workers: [],
}


master.add = async (workerData) => {
    const worker = {}

    worker.instance = new Worker(path.join(__dirname, 'worker/index.js'), { workerData })

    worker.status = 'running'

    worker.instance.on('message', (m) => {
        console.log(m)
    })

    worker.instance.postMessage('im master')


    master.workers.push(worker)
}

master.remove = async () => {
    
}

master.removeAll = async () => {
    for (const worker of master.workers) {
        worker.instance.terminate()
        worker.status = 'stopped'
    }

    master.workers = []
}


module.exports = master