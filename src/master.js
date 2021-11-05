// Master will manage all worker
// Master will run in main process

const { Worker } = require('worker_threads')
const path = require('path')
const settings = require('electron-settings')

const MESSAGE_STATUS = {
    INFO_UPDATE: "INFO_UPDATE",
    STATUS_UPDATE: "STATUS_UPDATE",
}


const master = {
    workers: [],

    change: () => {},
}


master.add = async (workerData) => {
    const worker = {}

    worker.instance = new Worker(path.join(__dirname, 'worker/index.js'), { workerData })

    worker.status = 'running'

    worker.instance.on('message', async (m) => {
        const account_list = await settings.get('account_list')

        if (m.type === MESSAGE_STATUS.INFO_UPDATE) {
            const accountIndex = account_list.findIndex(a => a.username === m.player)
            account_list[accountIndex].ecr = m.ecr
            account_list[accountIndex].rating = m.rating
            account_list[accountIndex].dec = m.dec
            account_list[accountIndex].status = 'RUNNING'

            settings.set('account_list', account_list)

            master.change('account_list')
        } else if (m.type === MESSAGE_STATUS.STATUS_UPDATE) {
            const accountIndex = account_list.findIndex(a => a.username === m.player)
            account_list[accountIndex].status = m.status

            settings.set('account_list', account_list)

            master.change('account_list')
        }
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