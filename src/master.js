// Master will manage all worker
// Master will run in main process

const { Worker } = require('worker_threads')
const path = require('path')
const settings = require('electron-settings')
const PriorityQueue = require('priorityQueuejs')

const MESSAGE_STATUS = {
    INFO_UPDATE: "INFO_UPDATE",
    STATUS_UPDATE: "STATUS_UPDATE",
}

const ACCOUNT_STATUS = {
    PENDING: 'PENDING',
    DONE: 'DONE',
    RUNNING: 'RUNNING',
    // STOPPED: 'STOPPED',
    NONE: 'NONE',
    PAUSED: 'PAUSED',
}

const calculateECR = (updatedAt = 0, ecr) => {
    const ONE_HOUR = 60 * 60 * 1000
    
    const now = Date.now()
    let recoverECR = 0

    if (updatedAt) {
        recoverECR = Math.floor((now - updatedAt) / ONE_HOUR)
    }

    return recoverECR + ecr
}

const master = {
    workers: [],
    priorityQueue: new PriorityQueue((a, b)=> {return calculateECR(b.updatedAt, b.ecr) - calculateECR(a.updatedAt, a.ecr) }),

    change: () => {},
}


master.add = async (workerData) => {
    console.log('add')
    const worker = {}

    worker.instance = new Worker(path.join(__dirname, 'worker/index.js'), { workerData })

    worker.status = 'running'

    worker.instance.on('message', async (m) => {
        console.log('worker message: ', m)
        const account_list = await settings.get('account_list')
        const app_setting = await settings.get('app_setting')

        if (m.type === MESSAGE_STATUS.INFO_UPDATE) {
            const accountIndex = account_list.findIndex(a => a.username === m.player)
            account_list[accountIndex].ecr = m.ecr
            account_list[accountIndex].rating = m.rating
            account_list[accountIndex].dec = m.dec

            settings.set('account_list', account_list)

            master.change('account_list', { account_list })
        } else if (m.type === MESSAGE_STATUS.STATUS_UPDATE) {
            const accountIndex = account_list.findIndex(a => a.username === m.player)
            account_list[accountIndex].status = m.status

            master.change('account_list', { account_list })

            const proxyIndex = app_setting.proxies.findIndex(p => p.ip === account_list[accountIndex].proxy)
            app_setting.proxies[proxyIndex].count--

            master.change('app_setting', { app_setting })

            await master.dequeue()

            if (m.status === 'done') {
                worker.instance.terminate()
            }
        }
    })

    worker.instance.on('error', (e) => {
        console.error(e)
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

master.pauseWorkers = async () => {
    master.removeAll()

    const app_setting = await settings.get('app_setting')
    const account_list = await settings.get('account_list')

    for (let i = 0; i< app_setting.proxies.length; i++) {
        app_setting.proxies[i].count = 0
    }

    for (let i = 0; i< account_list.length; i++) {
        account_list[i].status = ACCOUNT_STATUS.PAUSED
    }

    master.change('account_list', { account_list })
}

master.startWorkers = async () => {
    let account_list = await settings.get('account_list')
    const app_setting = await settings.get('app_setting')

    const botPerIp = app_setting.botPerIp || 5

    account_list = account_list.sort((a, b)=> { return b.ecr - a.ecr })

    for (let i = 0; i < account_list.length; i++) {
        const config = {}

        config.ecr = app_setting.ecr === '' ? 55 : + app_setting.ecr
        config.questECR = app_setting.startQuestEcr === '' ? 60 : + app_setting.startQuestEcr

        const proxyIndex = app_setting.proxies.findIndex(p => p.count < botPerIp)

        if (
            proxyIndex >= 0 && 
            calculateECR(account_list[i].updatedAt, account_list[i].ecr) < config.ecr
        ) {
            account_list[i].status = 'RUNNING'

            master.add({
                worker: {
                    name: 'splinterlands',
                },
                username: account_list[i].username,
                postingKey: account_list[i].postingKey,
                token: account_list[i].token,
                proxy: app_setting.proxies[proxyIndex].ip,
                config,
            })

            app_setting.proxies[proxyIndex].count++
        } else {
            console.log('enq', account_list[i].username)
            account_list[i].status = ACCOUNT_STATUS.PENDING
            master.priorityQueue.enq(account_list[i])
        }
    }

    master.change('account_list', { account_list })
    master.change('app_setting', { app_setting })
}

master.dequeue = async (proxyIp) => {
    console.log('dequeue', proxyIp)
    const app_setting = await settings.get('app_setting')

    const proxyIndex = app_setting.proxies.findIndex(p => p.ip === proxyIp)

    const account = master.priorityQueue.deq()

    master.add({
        worker: {
            name: 'splinterlands',
        },
        username: account.username,
        postingKey: account.postingKey,
        token: account.token,
        proxy: app_setting.proxies[proxyIndex].ip,
        config,
    })

    app_setting.proxies[proxyIndex].count++

    master.change('app_setting', { app_setting })
}


module.exports = master