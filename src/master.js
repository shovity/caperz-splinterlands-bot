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

master.handleAddAccount = async (account) => {

    if (account.status === ACCOUNT_STATUS.RUNNING) {
        return
    }

    let account_list = await settings.get('account_list')
    const accountIndex = account_list.findIndex(a => a.username === account.username)
    const app_setting = await settings.get('app_setting')

    const config = {
        ecr:  app_setting.ecr
    }

    const proxyIndex = app_setting.proxies.findIndex(p => p.count < app_setting.botPerIp)

    if (
        proxyIndex >= 0 && 
        calculateECR(account.updatedAt, account.ecr) > config.ecr
    ) {
        account_list[accountIndex].proxy = app_setting.proxies[proxyIndex].ip
        account_list[accountIndex].status = ACCOUNT_STATUS.RUNNING

        master.add({
            worker: {
                name: 'splinterlands',
            },
            username: account.username,
            postingKey: account.postingKey,
            token: account.token,
            proxy: account.proxy,
            config,
        })

        app_setting.proxies[proxyIndex].count++
    } else {
        account_list[accountIndex].status = ACCOUNT_STATUS.PENDING

        master.priorityQueue.enq(account)
    }

    await master.change('account_list', { account_list })
    await master.change('app_setting', { app_setting })
}

const master = {
    workers: [],
    priorityQueue: new PriorityQueue((a, b) => {return calculateECR(b.updatedAt, b.ecr) - calculateECR(a.updatedAt, a.ecr) }),
    dailyIntervalId: null,

    change: () => {},
}


master.add = async (workerData) => {
    const worker = {}

    worker.instance = new Worker(path.join(__dirname, 'worker/index.js'), { workerData })

    worker.status = 'running'

    worker.instance.on('message', async (m) => {
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

            await master.change('account_list', { account_list })

            const proxyIndex = app_setting.proxies.findIndex(p => p.ip === account_list[accountIndex].proxy)
            app_setting.proxies[proxyIndex].count--

            await master.change('app_setting', { app_setting })

            await master.dequeue()

            if (m.status === 'DONE') {
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

    clearInterval(master.dailyIntervalId);
}

master.pauseWorkers = async () => {
    master.removeAll()

    const app_setting = await settings.get('app_setting')
    const account_list = await settings.get('account_list')

    for (let i = 0; i < app_setting.proxies.length; i++) {
        app_setting.proxies[i].count = 0
    }

    for (let i = 0; i < account_list.length; i++) {
        account_list[i].status = ACCOUNT_STATUS.PAUSED
    }

    master.change('account_list', { account_list })
    master.change('app_setting', { app_setting })
}

master.startWorkers = async () => {
    let account_list = await settings.get('account_list')
    account_list = account_list.map(a => {
        if (a.status === ACCOUNT_STATUS.NONE) {
            a.status = ACCOUNT_STATUS.PENDING
        }
        return a
    })

    await master.change('account_list', { account_list })

    account_list = account_list.sort((a, b)=> { return b.ecr - a.ecr })

    for (let i = 0; i < account_list.length; i++) {
        await master.handleAddAccount(account_list[i])
    }

    const ONE_DAY_TIME = 60 * 1000 || 24 * 60 * 60 * 1000

    master.dailyIntervalId = setInterval(async () => {
        let account_list = await settings.get('account_list')

        await master.dequeue()
        for (let i = 0; i < account_list.length; i++) {
            await handleAddAccount(account_list[i])
        }

    }, ONE_DAY_TIME)
}

master.dequeue = async () => {
    if (master.priorityQueue.isEmpty()) {
        return
    }

    let accountPeek = master.priorityQueue.peek()
    let app_setting = await settings.get('app_setting')
    const ecr = app_setting.ecr
    let proxyFree = app_setting.proxies.findIndex(p => p.count < app_setting.botPerIp)

    while (calculateECR(accountPeek.updatedAt, accountPeek.ecr) > ecr && proxyFree >= 0) {
        await handleAddAccount(accountPeek)
        
        let app_setting = await settings.get('app_setting')
        proxyFree = app_setting.proxies.findIndex(p => p.count < app_setting.botPerIp)

        master.priorityQueue.deq()
    }
}   


module.exports = master