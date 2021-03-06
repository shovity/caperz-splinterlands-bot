// Master will manage all worker
// Master will run in main process

const { Worker } = require('worker_threads')
const { v4: uuidv4 } = require('uuid')
const {MaxPriorityQueue} = require('@datastructures-js/priority-queue')
const path = require('path')

const settings = require('./settings')
const utils = require('./utils')
const account = require('./service/account')

const workerService = require('./service/worker')
const accountService = require('./service/account')

const ACCOUNT_STATUS = {
    PENDING: 'PENDING',
    DONE: 'DONE',
    RUNNING: 'RUNNING',
    STOPPED: 'STOPPED',
    NONE: 'NONE',
    PAUSED: 'PAUSED',
    RENTING: 'RENTING',
    WAITING_ECR: 'WAITING_ECR',
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
    config: {
        test: {
            // concurrency: 1,
            concurrency: 'infinity',
        },
        splinterlands: {
            concurrency: 'infinity',
        },
        delegator: {
            concurrency: 1,
        },
        collector: {
            concurrency: 1,
        },
    },
    state: null,
    priorityQueue: new MaxPriorityQueue({ priority: (a) =>  calculatePriority(a) }),
    dailyIntervalId: null,
    hourlyDeqIntervalId: null,
    minuteMajorIntervalId: null,
    stopECR: 50,
    splashStatus: 'off',
    playerUpdaterStatus: 'stopped',

    change: () => {},
    changePath: () => {},
}

const calculatePriority = (account, accountIndex = 0) => {
    let priority = 0
    // const ecrNow = calculateECR(account.updatedAt, account.ecr)

    switch (account.status) {
        case ACCOUNT_STATUS.PAUSED: 
            priority += PRIORITY_POINT.PAUSED
            break
        case ACCOUNT_STATUS.PENDING:
            priority += PRIORITY_POINT.PENDING
            break
    }

    // if (ecrNow > master.stopECR) {
    //     priority += PRIORITY_POINT.GREATER_STOP_ECR
    // }

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

master.handleAddAccount = async (account, proxyIp, delegated=0) => {
    let account_list = settings.data.account_list
    const accountIndex = account_list.findIndex(a => a.username === account.username)
    const app_setting = settings.data.app_setting
    const user = settings.data.user

    const config = app_setting

    const isAccountPaused = () => [ACCOUNT_STATUS.PAUSED, ACCOUNT_STATUS.STOPPED].includes(
        settings.data.account_list[accountIndex].status
    )

    if (
        account_list[accountIndex].status === ACCOUNT_STATUS.RUNNING ||
        isAccountPaused()
    ) {
        return
    }

    const proxyIndex = app_setting.proxies.findIndex(p => {
        if (proxyIp) {
            return p.ip === proxyIp
        }

        if (p.ip === 'Default IP') {
            if (app_setting.useDefaultProxy) {
                return p.count < app_setting.botPerIp
            } else {
                return false
            }
        }

        return p.count < app_setting.botPerIp
    })

    if (proxyIndex >= 0) {

        if (!delegated) {
            app_setting.proxies[proxyIndex].count++
        }

        await master.change('app_setting', { app_setting })

        account_list[accountIndex].proxy = app_setting.proxies[proxyIndex].ip
        account_list[accountIndex].status = ACCOUNT_STATUS.RUNNING

        let proxy
        if (account_list[accountIndex].proxy === 'Default IP') {
            proxy = null
        } else {
            const [auth, address] = account_list[accountIndex].proxy.split('@')

            if (auth && address) {
                const [account, password] = auth.split(':')
                const [host, port] = address.split(':')
    
                proxy = {
                    account,
                    password,
                    host,
                    port,
                }

                proxy.protocol = app_setting.proxies[proxyIndex].protocol || 'https://'
            } else {
                const [host, port] = account_list[accountIndex].proxy.split(':')
                proxy = { host, port }
                proxy.protocol = app_setting.proxies[proxyIndex].protocol || 'https://'
            }
        }

        try {
            const shouldDelegate = await workerService.checkDelegate(account.username, proxy, master) 

            if (isAccountPaused()) {
                return
            }    

            if (shouldDelegate) {
                const details = await utils.getDetails(account.username, proxy)
    
                if (isAccountPaused()) {
                    return
                }
    
                master.delegatorWorker.instance.postMessage({
                    task: 'delegate',
                    data: {
                        username: account.username,
                        postingKey: account.postingKey,
                        masterKey: account.masterKey,
                        token: account.token,
                        proxy,
                        delegated,
                        config,
                        spsToken: user.token,
                        delegatePower: app_setting.dlgMinPower - details.collection_power,
                        minDelegatePower: app_setting.dlgMinPower,
                        currentPower: details.collection_power
                    }
                })
                account_list[accountIndex].status = 'DELEGATING'
            } else {
                const worker = await master.add({
                    worker: {
                        name: 'splinterlands',
                    },
                    username: account.username,
                    postingKey: account.postingKey,
                    masterKey: account.masterKey,
                    token: account.token,
                    proxy,
                    delegated,
                    config,
                    spsToken: user.token
                })
    
                account_list[accountIndex].workerId = worker.id
            }
        } catch (err) {
            master.change('log', {message: 'handleAddAccount', err})

            if (!delegated) {
                app_setting.proxies[proxyIndex].count--

                await master.change('app_setting', { app_setting })
            }

            account_list[accountIndex].status = 'ERROR'
        }
    } else {
        account_list[accountIndex].status = ACCOUNT_STATUS.PENDING

        master.priorityQueue.enqueue(account)
    }

    await master.changePath('account_list', [{ ...account_list[accountIndex] }])
}

master.start = async (worker) => {
    worker.instance = new Worker(path.join(__dirname + '/worker/index.js'), { workerData: worker.data })

    worker.status = 'running'

    worker.instance.on('message', async (m) => {
        workerService.handleMessage(worker, m, master)
    })

    worker.instance.on('error', (e) => {
        console.error(e)
    })

    worker.instance.on('exit', () => {
        const workers = master.workers.filter(w => w.name === worker.name && w.status === 'pending')
        for (i = 0; i < workers.length; i++) {
            if (workerService.checkWorkerRunable(workers[i], master)) {
                master.start(workers[i])
            }
        }
    })

    worker.instance.postMessage('im master')

    for (let i = 0; i < master.workers.length; i++) {
        if (master.workers[i].id === worker.id) {
            master.workers[i] = worker
            break
        }
    }
}

master.add = async (workerData) => {

    // await master.change('log', 'add worker')

    const worker = {
        id: uuidv4(),
        name: workerData.worker.name,
        data: workerData,
        status: 'pending'
    }
    
    master.workers.push(worker)

    if (workerService.checkWorkerRunable(worker, master)) {
        for (i = 0; i < master.workers.length; i++) {
            if (workerService.checkWorkerRunable(master.workers[i], master)) {
                await master.start(master.workers[i])
            }
        }
    }

    return worker
}

master.remove = async (account) => {
    const account_list = settings.data.account_list
    const app_setting = settings.data.app_setting

    const accountIndex = account_list.findIndex(a => a.username === account)

    if (account_list[accountIndex].status === ACCOUNT_STATUS.PENDING) {

        const priorityQueue = master.priorityQueue.toArray()

        for (let i = 0; i < priorityQueue.length; i++) {   
            if (priorityQueue[i].element.username === account) {
                master.priorityQueue.clear()
                const newPriorityQueue = priorityQueue.filter(e => e.element.username !== account)
                newPriorityQueue.forEach(e => {
                    master.priorityQueue.enqueue(e.element, calculateECR(e.element.lastRewardTime, e.element.ecr))
                })

                account_list[accountIndex].status = ACCOUNT_STATUS.PAUSED
                await master.changePath('account_list', [{ ...account_list[accountIndex] }])

                break
            }
        }

        return
    }

    for (const worker of master.workers) {
        if (worker.id === account_list[accountIndex].workerId) {
            master.workers = master.workers.filter(w => w.id !== worker.id)
            await worker.instance?.terminate()
        }
    }

    let proxy = account_list[accountIndex].proxy

    const proxyIndex = app_setting.proxies.findIndex(p => p.ip === proxy)
    if (proxyIndex >= 0 && account_list[accountIndex].status !== ACCOUNT_STATUS.DONE) {
        app_setting.proxies[proxyIndex].count--
        await master.change('app_setting', { app_setting })
    }
    account_list[accountIndex].status = ACCOUNT_STATUS.PAUSED
    delete account_list[accountIndex].workerId

    await master.changePath('account_list', [{ ...account_list[accountIndex] }])
    await master.dequeue()
}

master.removeAll = async () => {
    const workers = master.workers
    master.priorityQueue = new MaxPriorityQueue((a, b) => calculatePriority(a) - calculatePriority(b))

    master.workers = []

    for (const worker of workers) {
        if (worker.name === 'delegator') {
            continue
        }
        
        master.workers = workers.filter(w => w.id !== worker.id)
        await worker.instance.terminate()
        worker.status = 'stopped'
    }

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
        } else if (account_list[i].status !== ACCOUNT_STATUS.WAITING_ECR) {
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

    account.beforeEnqueue()

    let account_list = settings.data.account_list
    
    for (let i = 0; i < account_list.length; i++) {
        if ([ACCOUNT_STATUS.PENDING, ACCOUNT_STATUS.RUNNING, ACCOUNT_STATUS.WAITING_ECR].includes(account_list[i].status)) {
            continue
        }
        await master.priorityQueue.enqueue(account_list[i], calculatePriority(account_list[i], i))
    }

    account_list = settings.data.account_list

    account_list = account_list.map(a => {
        if ([ACCOUNT_STATUS.NONE, ACCOUNT_STATUS.PAUSED, ACCOUNT_STATUS.DONE, ACCOUNT_STATUS.STOPPED].includes(a.status)) {
            a.status = ACCOUNT_STATUS.PENDING
        }

        return a
    })

    await master.change('account_list', { account_list })

    await master.dequeue()
}

master.setIntervals = async () => {
    const ONE_HOUR_TIME = 60 * 60 * 1000
    const ONE_DAY_TIME = 24 * ONE_HOUR_TIME

    master.dailyIntervalId = setInterval(async () => {
        let account_list = settings.data.account_list

        await master.dequeue()

        for (let i = 0; i < account_list.length; i++) {
            if ([ACCOUNT_STATUS.PENDING, ACCOUNT_STATUS.RUNNING].includes(account_list[i].status)) {
                account_list[i].status = ACCOUNT_STATUS.NONE
            }
            await master.priorityQueue.enqueue(account_list[i])
        }

        await master.dequeue()

    }, ONE_DAY_TIME)

    // master.hourlyDeqIntervalId = setInterval(async () => {
    //     await master.dequeue()
    // }, ONE_HOUR_TIME)
}

master.dequeue = async () => {
    if (master.priorityQueue.isEmpty()) {
        return
    }

    let accountFront = master.priorityQueue.front().element
    let app_setting = settings.data.app_setting

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

    while (proxyFree >= 0 && accountFront) {
        master.priorityQueue.dequeue()

        await master.handleAddAccount(accountFront)

        accountFront = master.priorityQueue.front()?.element

        let app_setting = settings.data.app_setting

        proxyFree = app_setting.proxies.findIndex(p => {
            if (p.ip === 'Default IP') {
                if (app_setting.useDefaultProxy) {
                    return p.count < app_setting.botPerIp
                } else {
                    return false
                }
            }
    
            return p.count < app_setting.botPerIp
        })
    }
}

master.delay = (time) => {
    return new Promise(resolve => {
        setTimeout(() => resolve(), time)
    })
}

master.updateOpeningPlayerInfo = async () => {
    const ONE_SECOND = 1000
    const THREE_SECOND = 3 * ONE_SECOND
    const TWENTY_SECOND = 20 * ONE_SECOND
    const startTime = Date.now()
    const app_setting = settings.data.app_setting

    if (master.playerUpdaterStatus === 'running') {
        return
    }

    master.playerUpdaterStatus = 'running'

    let account_list = settings.data.account_list
    let updatedList = []
    let updateList = []
    let proxyIndex = 0

    for (let i = 0; i < account_list?.length || 0; i++) {
        const newAccount = {username: account_list[i].username}

        let accountBalances
        let accountDetails

        try {
            let proxy

            if (app_setting.proxies[proxyIndex].ip === 'Default IP') {
                proxy = null
            } else {
                const [auth, address] = app_setting.proxies[proxyIndex].ip.split('@')
    
                if (auth && address) {
                    const [account, password] = auth.split(':')
                    const [host, port] = address.split(':')
        
                    proxy = {
                        account,
                        password,
                        host,
                        port,
                    }
    
                    proxy.protocol = app_setting.proxies[proxyIndex].protocol || 'https://'
                } else {
                    const [host, port] = account_list[accountIndex].ip.split(':')
                    proxy = { host, port }
                    proxy.protocol = app_setting.proxies[proxyIndex].protocol || 'https://'
                }
            }

            proxyIndex = proxyIndex < app_setting.proxies.length - 1 ? proxyIndex + 1 : 0
            accountBalances = await utils.getBalances(account_list[i].username, proxy)
            accountDetails = await utils.getDetails(account_list[i].username, proxy)
            accountQuestDetails = await utils.getQuestDetails(account_list[i].username, proxy)
        } catch (error) {
            console.error('updateOpeningPlayerInfo get balances error', error)
            continue
        }

        if (accountBalances && accountBalances.length) {
            let ecr = accountBalances.find((b) => b.token == 'ECR').balance

            if (ecr === null) {
                ecr = 10000
            }

            const lastRewardTime = new Date(accountBalances.find((b) => b.token == 'ECR').last_reward_time).getTime()

            const dec = accountBalances.find((b) => b.token == 'DEC')?.balance || 0
            const credits = accountBalances.find((b) => b.token == 'CREDITS')?.balance || 0

            newAccount.ecr = calculateECR(lastRewardTime, ecr / 100)
            newAccount.dec = dec
            newAccount.credits = credits
            newAccount.lastRewardTime = lastRewardTime

            if (
                newAccount.ecr >= settings.data.app_setting.ecr && 
                newAccount.status === ACCOUNT_STATUS.WAITING_ECR
            ) {
                newAccount.status = ACCOUNT_STATUS.NONE
            }
        }

        if (accountDetails) {
            newAccount.rating = accountDetails.rating
            newAccount.power = accountDetails.collection_power
        }
        if (accountQuestDetails && accountQuestDetails.length) {
            newAccount.quest = accountQuestDetails[0].completed_items
            newAccount.maxQuest = accountQuestDetails[0].total_items
            newAccount.questClaimed = accountQuestDetails[0].claim_date != null
        }

        updateList.push(newAccount)

        const processPercent = Math.ceil((updatedList.length + updateList.length) * 100 / account_list.length)
        
        await master.change('process_loading', {
            processPercent: processPercent >= 1 ? processPercent - 1 : 0
        })

        if (account_list?.length - i <= 5 || updateList.length === 5) {
            await master.changePath('account_list', updateList)
            updatedList = [
                ...updatedList,
                ...updateList
            ]
            updateList = []

            await master.delay(THREE_SECOND)
        }

        const now = Date.now()

        if (master.splashStatus === 'on' && now - startTime >= TWENTY_SECOND) {
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

master.init = async () => {
    workerService.createDelegator(master)
    accountService.setMajorInterval(master)
}


module.exports = master