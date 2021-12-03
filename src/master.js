// Master will manage all worker
// Master will run in main process

const { Worker } = require('worker_threads')
const path = require('path')
const settings = require('./settings')
const {MaxPriorityQueue} = require('@datastructures-js/priority-queue')
const utils = require('./utils')

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
    splashStatus: 'off',
    playerUpdaterStatus: 'stopped',

    change: () => {},
    changePath: () => {},
}

const calculatePriority = (account, accountIndex = 0) => {
    let priority = 0
    const ecrNow = calculateECR(account.updatedAt, account.ecr)

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

    priority -= accountIndex

    return priority
}

const calculateECR = (lastRewardTime = 0, ecr) => {
    const ONE_MINUTE = 60 * 1000
    const ONE_HOUR = 60 * ONE_MINUTE
    
    const now = Date.now()
    let recoverECR = 0

    if (lastRewardTime) {
        recoverECR = +(((now - lastRewardTime) / ONE_HOUR).toFixed(2))
    }

    ecr = +(recoverECR + ecr).toFixed(2)

    if (ecr > 100) {
        ecr = 100
    }

    return ecr
}

master.change('master_state', {state: master.state})

master.handleAddAccount = async (account) => {
    let account_list = settings.data.account_list
    const accountIndex = account_list.findIndex(a => a.username === account.username)
    const app_setting = settings.data.app_setting
    const user = settings.data.user

    const config = {
        ecr: app_setting.ecr
    }

    const proxyIndex = app_setting.proxies.findIndex(p => {
        if (p.ip === 'Default IP') {
            if (app_setting.useDefaultProxy) {
                return p.count < app_setting.botPerIp
            } else {
                return false
            }
        }

        return p.count < app_setting.botPerIp
    })

    if (
        proxyIndex >= 0 && 
        calculateECR(account.lastRewardTime, account.ecr) > config.ecr
    ) {
        account_list[accountIndex].proxy = app_setting.proxies[proxyIndex].ip
        account_list[accountIndex].status = ACCOUNT_STATUS.RUNNING

        let proxy
        if (account_list[accountIndex].proxy === 'Default IP') {
            proxy = null
        } else {
            const [auth, address] = account_list[accountIndex].proxy.split('@')
            const [account, password] = auth.split(':')
            const [host, port] = address.split(':')

            proxy = {
                account,
                password,
                host,
                port,
            }
        }

        await master.change('log', {
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
        try {
            const worker = await master.add({
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

            account_list[accountIndex].workerId = worker.threadId
        } catch (e) {
            await master.change('log', e)
        }

        app_setting.proxies[proxyIndex].count++
    } else {
        account_list[accountIndex].status = ACCOUNT_STATUS.PENDING

        master.priorityQueue.enqueue(account)
    }

    await master.changePath('account_list', [{ ...account_list[accountIndex], index: accountIndex }])
    await master.change('app_setting', { app_setting })
}

master.add = async (workerData) => {

    await master.change('log', 'add worker')

    const worker = {}

    worker.instance = new Worker(path.join(__dirname + '/worker/index.js'), { workerData })

    worker.status = 'running'

    worker.instance.on('message', async (m) => {
        const account_list = settings.data.account_list
        const app_setting = settings.data.app_setting

        if (m.type === MESSAGE_STATUS.INFO_UPDATE) {
            const accountIndex = account_list.findIndex(a => a.username === m.player)

            if (accountIndex === -1) {
                return worker.instance.terminate()
            }

            if (m.ecr) {
                const now = Date.now()
                account_list[accountIndex].ecr = calculateECR(now, m.ecr)
            }

            if (m.rating) {
                account_list[accountIndex].rating = m.rating
            }

            if (m.dec) {
                account_list[accountIndex].dec = m.dec
            }

            if (m.lastRewardTime) {
                account_list[accountIndex].lastRewardTime = m.lastRewardTime
            }

            if (m.questClaimed) {
                account_list[accountIndex].questClaimed = m.questClaimed
            }

            if (m.matchStatus) {
                account_list[accountIndex].matchStatus = m.matchStatus || 'NONE'
            }

            if (typeof m.quest != 'undefined') {
                account_list[accountIndex].quest = m.quest
            }

            if (m.maxQuest) {
                account_list[accountIndex].maxQuest = m.maxQuest
            }

            await master.changePath('account_list', [{ ...account_list[accountIndex], index: accountIndex }])
        } else if (m.type === MESSAGE_STATUS.STATUS_UPDATE) {
            const accountIndex = account_list.findIndex(a => a.username === m.player)

            if (accountIndex === -1) {
                return worker.instance.terminate()
            }

            account_list[accountIndex].status = m.status

            await master.changePath('account_list', [{ ...account_list[accountIndex], index: accountIndex }])

            if (m.status === 'DONE') {
                let proxy = account_list[accountIndex].proxy
    
                const proxyIndex = app_setting.proxies.findIndex(p => p.ip === proxy)
                if (proxyIndex >= 0) {
                    app_setting.proxies[proxyIndex].count--
                    await master.change('app_setting', { app_setting })
                }

                await master.dequeue()
                worker.instance.terminate()                
            }
        } else if (m.type === 'MESSAGE') {
            await master.change('log', m.data)
        }
    })

    worker.instance.on('error', (e) => {
        console.error(e)
    })

    worker.instance.postMessage('im master')

    master.workers.push(worker)

    return worker.instance
}

master.remove = async (account) => {
    const account_list = settings.data.account_list
    const app_setting = settings.data.app_setting

    const accountIndex = account_list.findIndex(a => a.username === account)
    let proxy = account_list[accountIndex].proxy

    const proxyIndex = app_setting.proxies.findIndex(p => p.ip === proxy)
    if (proxyIndex >= 0 && account_list[accountIndex].status !== ACCOUNT_STATUS.DONE) {
        app_setting.proxies[proxyIndex].count--
        await master.change('app_setting', { app_setting })
    }
    account_list[accountIndex].status = ACCOUNT_STATUS.PAUSED
    await master.changePath('account_list', [{ ...account_list[accountIndex], index: accountIndex }])

    for (const worker of master.workers) {
        if (worker.instance.threadId === account_list[accountIndex].workerId) {
            await worker.instance.terminate()
        }
    }
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

    let account_list = settings.data.account_list

    account_list.map(a => {
        delete a.workerId

        return a
    })

    await master.change('account_list', {account_list})
}

master.pauseWorkers = async () => {
    await master.removeAll()

    const app_setting = settings.data.app_setting
    const account_list = settings.data.account_list

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

    if (master.state !== MASTER_STATE.RUNNING) {
        return
    }

    let account_list = settings.data.account_list

    for (let i = 0; i < account_list.length; i++) {
        if ([ACCOUNT_STATUS.PENDING, ACCOUNT_STATUS.RUNNING].includes(account_list[i].status)) {
            continue
        }
        await master.priorityQueue.enqueue(account_list[i], calculatePriority(account_list[i], i))
    }

    await master.dequeue()

    account_list = settings.data.account_list

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
        let account_list = settings.data.account_list

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
    if (master.priorityQueue.isEmpty()) {
        return
    }

    let accountFront = master.priorityQueue.front().element
    let app_setting = settings.data.app_setting
    const ecr = app_setting.ecr
    let proxyFree = app_setting.proxies.findIndex(p => {
        if (p.ip === 'Default IP') {
            if (app_setting.useDefaultProxy) {
                return p.count < app_setting.botPerIp
            } else {
                return false
            }
        }

        return p.count < app_setting.botPerIp
    })

    while (calculateECR(accountFront?.updatedAt, accountFront?.ecr) > ecr && proxyFree >= 0) {
        master.priorityQueue.dequeue()
        await master.handleAddAccount(accountFront)
        
        let app_setting = settings.data.app_setting
        proxyFree = app_setting.proxies.findIndex(p => p.count < app_setting.botPerIp)

        accountFront = master.priorityQueue.front()?.element
    }
}

master.delay = (time) => {
    return new Promise(resolve => {
        setTimeout(() => resolve(), time)
    })
}

master.updateOpeningPlayerInfo = async () => {
    const LOADING_TIME = 2 * 1000
    const startTime = Date.now()

    if (master.playerUpdaterStatus === 'running') {
        return
    }

    master.playerUpdaterStatus = 'running'

    let account_list = settings.data.account_list
    let updatedList = []
    let updateList = []

    for (let i = 0; i < account_list?.length || 0; i++) {
        const newAccount = account_list[i]

        let accountBalances
        let accountDetails

        try {
            accountBalances = await utils.getBalances(account_list[i].username)
            accountDetails = await utils.getDetails(account_list[i].username)
        } catch (error) {
            console.error('updateOpeningPlayerInfo get balances error', error)
            continue
        }

        if (accountBalances) {
            let ecr = accountBalances.find((b) => b.token == 'ECR').balance

            if (ecr === null) {
                ecr = 10000
            }

            const lastRewardTime = new Date(accountBalances.find((b) => b.token == 'ECR').last_reward_time).getTime()

            const dec = accountBalances.find((b) => b.token == 'DEC')?.balance || 0

            newAccount.ecr = calculateECR(lastRewardTime, ecr / 100)
            newAccount.dec = dec
            newAccount.lastRewardTime = lastRewardTime
        }

        if (accountDetails) {
            newAccount.rating = accountDetails.rating
            newAccount.power = accountDetails.collection_power
        }

        newAccount.index = i

        updateList.push(newAccount)

        const processPercent = Math.ceil((updatedList.length + updateList.length) * 100 / account_list.length)
        
        await master.change('process_loading', {
            processPercent: processPercent >= 1 ? processPercent - 1 : 0
        })

        await master.delay(500)

        if (account_list?.length - i <= 3 || updateList.length === 3) {
            await master.changePath('account_list', updateList)
            updatedList = [
                ...updatedList,
                ...updateList
            ]
            updateList = []
        }

        const now = Date.now()

        if (master.splashStatus === 'on' && now - startTime >= LOADING_TIME) {
            await master.change('process_loading', {
                processPercent: 99,
                splashStatus: 'off',
            })

            master.splashStatus = 'off'
        }
    }

    master.playerUpdaterStatus = 'stopped'
    master.splashStatus = 'off'
}

master.calculatePriority = calculatePriority
master.calculateECR = calculateECR


module.exports = master