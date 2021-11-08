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

            if (m.status === 'done') {
                worker.instance.terminate()
            }
        }
    })

    worker.instance.on('exit', async (m) => {
        console.log('exit', m)
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

master.stopWorkers = async () => {
    master.removeAll()

    const app_setting = await settings.get('app_setting')
    const account_list = await settings.get('account_list')

    for (let i = 0; i< app_setting.proxies.length; i++) {
        app_setting.proxies[i].count = 0
    }

    for (let i = 0; i< account_list.length; i++) {
        account_list[i].status = 'STOPPED'
    }

    settings.set('account_list', account_list)

    master.change('account_list')
}

master.startWorkers = async () => {
    const account_list = await settings.get('account_list')
    const app_setting = await settings.get('app_setting')

    const botPerIp = app_setting.botPerIp || 5

    for (let account of account_list) {
        const config = {}

        config.ecr = app_setting.ecr === '' ? 55 : +app_setting.ecr
        config.questECR = app_setting.startQuestEcr === '' ? 60 : +app_setting.startQuestEcr

        const proxyIndex = app_setting.proxies.findIndex(p => p.count < botPerIp)



        if (proxyIndex >= 0) {
            master.add({
                worker: {
                    name: 'splinterlands',
                },
                username: account.username,
                postingKey: account.postingKey,
                token: account.token,
                // proxy: app_setting.proxies[proxyIndex].ip,
                config,
            })

            app_setting.proxies[proxyIndex].count++
            if (app_setting.proxies[proxyIndex].count === botPerIp) {
                app_setting.proxies[proxyIndex].status === 'Enough Account'
            }
        }
    }
}


module.exports = master