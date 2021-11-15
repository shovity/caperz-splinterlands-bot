// Master will manage all worker
// Master will run in main process

const { Worker } = require('worker_threads')
const path = require('path')
const settings = require('electron-settings')
const {MaxPriorityQueue} = require('@datastructures-js/priority-queue')

const MESSAGE_STATUS = {
    INFO_UPDATE: "INFO_UPDATE",
    STATUS_UPDATE: "STATUS_UPDATE",
}

const ACCOUNT_STATUS = {
    PENDING: 'PENDING',
    DONE: 'DONE',
    RUNNING: 'RUNNING',
    STOPPED: 'STOPPED',
    NONE: 'NONE',
    PAUSED: 'PAUSED',
}

const MASTER_STATE = {
    RUNNING: 'RUNNING',
    PAUSED: 'PAUSED',
}

const PRIORITY_POINT = {
    PAUSED: 1000,
    PENDING: 500,
    GREATER_STOP_ECR: 1500,
}


const master = {
    workers: [],
    state: null,
    priorityQueue: new MaxPriorityQueue({ priority: (a) =>  calculatePriority(a) }),
    dailyIntervalId: null,
    hourlyDeqIntervalId: null,
    stopECR: 50,

    change: () => {},
}

const calculatePriority = (account) => {
    let priority = 0
    const ecrNow = calculateECR(account.lastRewardTime, account.ecr)

    priority += ecrNow

    switch (account.status) {
        case ACCOUNT_STATUS.PAUSED: 
            priority += PRIORITY_POINT.PAUSED
            break
        case ACCOUNT_STATUS.PENDING:
            priority += PRIORITY_POINT.PENDING
            break
    }

    if (ecrNow > master.stopECR) {
        priority += PRIORITY_POINT.GREATER_STOP_ECR
    }

    return priority
}

const calculateECR = (lastRewardTime = 0, ecr) => {
    const ONE_HOUR = 60 * 60 * 1000
    
    const now = Date.now()
    let recoverECR = 0

    if (lastRewardTime) {
        recoverECR = Math.floor((now - lastRewardTime) / ONE_HOUR)
    }

    return recoverECR + ecr
}

master.change('master_state', {state: master.state})

master.handleAddAccount = async (account) => {
    if (master.state === MASTER_STATE.PAUSED) {
        return
    }

    let account_list = await settings.get('account_list')
    const accountIndex = account_list.findIndex(a => a.username === account.username)
    const app_setting = await settings.get('app_setting')
    const user = await settings.get('user')

    const config = {
        ecr:  app_setting.ecr
    }

    const proxyIndex = app_setting.proxies.findIndex(p => p.count < app_setting.botPerIp)

    if (
        proxyIndex >= 0 && 
        calculateECR(account.lastRewardTime, account.ecr) > config.ecr
    ) {
        account_list[accountIndex].proxy = app_setting.proxies[proxyIndex].ip
        account_list[accountIndex].status = ACCOUNT_STATUS.RUNNING
        const proxy = account.proxy === 'Default IP' ? null : `${app_setting.proxies[proxyIndex].protocol}://${account.proxy}`

        master.add({
            worker: {
                name: 'splinterlands',
            },
            username: account.username,
            postingKey: account.postingKey,
            token: account.token,
            proxy,
            config,
            spsToken: user.token
        })

        app_setting.proxies[proxyIndex].count++
    } else {
        account_list[accountIndex].status = ACCOUNT_STATUS.PENDING

        master.priorityQueue.enqueue(account)
    }

    await master.change('account_list', { account_list })
    await master.change('app_setting', { app_setting })
}

master.add = async (workerData) => {
    if (master.state === MASTER_STATE.PAUSED) {
        master.change('master_state', {state: master.state})
        return
    }

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
            account_list[accountIndex].lastRewardTime = m.lastRewardTime
            account_list[accountIndex].matchStatus = m.matchStatus || 'NONE'

            settings.set('account_list', account_list)

            master.change('account_list', { account_list })
        } else if (m.type === MESSAGE_STATUS.STATUS_UPDATE) {
            const accountIndex = account_list.findIndex(a => a.username === m.player)
            account_list[accountIndex].status = m.status

            await master.change('account_list', { account_list })

            if (m.status === 'DONE') {
                const proxyIndex = app_setting.proxies.findIndex(p => p.ip === account_list[accountIndex].proxy)
                app_setting.proxies[proxyIndex].count--

                await master.change('app_setting', { app_setting })

                await master.dequeue()

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
    master.priorityQueue = new MaxPriorityQueue((a, b) => calculatePriority(a) - calculatePriority(b))

    clearInterval(master.dailyIntervalId)
    clearInterval(master.hourlyDeqIntervalId)
}

master.pauseWorkers = async () => {
    master.removeAll()

    const app_setting = await settings.get('app_setting')
    const account_list = await settings.get('account_list')

    for (let i = 0; i < app_setting.proxies.length; i++) {
        app_setting.proxies[i].count = 0
    }

    for (let i = 0; i < account_list.length; i++) {
        if (account_list[i].status === ACCOUNT_STATUS.RUNNING) {
            account_list[i].status = ACCOUNT_STATUS.PAUSED
        } else {
            account_list[i].status = ACCOUNT_STATUS.STOPPED
        }
    }

    await master.change('account_list', { account_list })
    await master.change('app_setting', { app_setting })

    master.state = MASTER_STATE.PAUSED
}

master.startWorkers = async () => {
    master.state = MASTER_STATE.RUNNING
    master.change('master_state', { state: master.state })

    await master.enqAccounts()
    await master.setIntervals()
}

master.enqAccounts = async () => {
    let account_list = await settings.get('account_list')

    for (let i = 0; i < account_list.length; i++) {
        await master.priorityQueue.enqueue(account_list[i], calculatePriority(account_list[i]))
    }

    await master.dequeue()

    account_list = await settings.get('account_list')

    account_list = account_list.map(a => {
        if ([ACCOUNT_STATUS.NONE, ACCOUNT_STATUS.PAUSED, ACCOUNT_STATUS.DONE, ACCOUNT_STATUS.STOPPED].includes(a.status)) {
            a.status = ACCOUNT_STATUS.PENDING
        }

        return a
    })

    await master.change('account_list', { account_list })
}

master.setIntervals = async () => {
    const ONE_HOUR_TIME = 60 * 60 * 1000
    const ONE_DAY_TIME = 24 * ONE_HOUR_TIME

    master.dailyIntervalId = setInterval(async () => {
        let account_list = await settings.get('account_list')

        await master.dequeue()

        for (let i = 0; i < account_list.length; i++) {
            if ([ACCOUNT_STATUS.PENDING, ACCOUNT_STATUS.RUNNING].includes(account_list[i].status)) {
                account_list[i].status = NONE
            }
            await master.priorityQueue.enqueue(account_list[i])
        }

        await master.dequeue()

    }, ONE_DAY_TIME)

    master.hourlyDeqIntervalId = setInterval(async () => {
        await master.dequeue()
    }, ONE_HOUR_TIME)
}

master.dequeue = async () => {
    if (master.priorityQueue.isEmpty() || master.state !== MASTER_STATE.RUNNING) {
        return
    }

    let accountFront = master.priorityQueue.front().element
    let app_setting = await settings.get('app_setting')
    const ecr = app_setting.ecr
    let proxyFree = app_setting.proxies.findIndex(p => p.count < app_setting.botPerIp)

    while (calculateECR(accountFront?.lastRewardTime, accountFront?.ecr) > ecr && proxyFree >= 0) {
        master.priorityQueue.dequeue()
        await master.handleAddAccount(accountFront)
        
        let app_setting = await settings.get('app_setting')
        proxyFree = app_setting.proxies.findIndex(p => p.count < app_setting.botPerIp)

        accountFront = master.priorityQueue.front()?.element
    }
}

master.calculatePriority = calculatePriority


module.exports = master