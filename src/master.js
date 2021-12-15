// Master will manage all worker
// Master will run in main process

const { Worker } = require('worker_threads')
const path = require('path')
const settings = require('./settings')
const {MaxPriorityQueue} = require('@datastructures-js/priority-queue')
const utils = require('./utils')
const account = require('./service/account')

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

master.handleAddAccount = async (account) => {
    let account_list = settings.data.account_list
    const accountIndex = account_list.findIndex(a => a.username === account.username)
    const app_setting = settings.data.app_setting
    const user = settings.data.user

    const config = app_setting

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

    if (proxyIndex >= 0) {
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

        // await master.change('log', {
        //     worker: {
        //         name: 'splinterlands',
        //     },
        //     username: account.username,
        //     postingKey: account.postingKey,
        //     masterKey: account.masterKey,
        //     token: account.token,
        //     proxy,
        //     config,
        //     spsToken: user.token
        // })
        try {
            const worker = await master.add({
                worker: {
                    name: 'splinterlands',
                },
                username: account.username,
                postingKey: account.postingKey,
                masterKey: account.masterKey,
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

    await master.changePath('account_list', [{ ...account_list[accountIndex] }], 1)
    await master.change('app_setting', { app_setting })
}

master.add = async (workerData) => {

    // await master.change('log', 'add worker')

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

            if (typeof m.ecr != 'undefined') {
                const now = Date.now()
                account_list[accountIndex].ecr = calculateECR(now, m.ecr)
            }

            if (typeof m.rating != 'undefined') {
                account_list[accountIndex].rating = m.rating
            }

            if (typeof m.dec != 'undefined') {
                account_list[accountIndex].dec = m.dec
            }

            if (m.lastRewardTime) {
                account_list[accountIndex].lastRewardTime = m.lastRewardTime
            }

            if (typeof m.questClaimed != 'undefined') {
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
            if (m.status) {
                account_list[accountIndex].status = m.status
            }
            if (typeof m.power != 'undefined') {
                account_list[accountIndex].power = m.power
            }

            await master.changePath('account_list', [{ ...account_list[accountIndex] }])
        } else if (m.type === MESSAGE_STATUS.STATUS_UPDATE) {
            const accountIndex = account_list.findIndex(a => a.username === m.player)

            if (accountIndex === -1) {
                return worker.instance.terminate()
            }

            account_list[accountIndex].status = m.status

            await master.changePath('account_list', [{ ...account_list[accountIndex] }])

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
        } else if (m.type === 'ERROR') {
            const accountIndex = account_list.findIndex(a => a.username === m.player || m.data?.player)

            let proxy = account_list[accountIndex].proxy

            const proxyIndex = app_setting.proxies.findIndex(p => p.ip === proxy)
            if (proxyIndex >= 0) {
                app_setting.proxies[proxyIndex].count--
                await master.change('app_setting', { app_setting })
            }

            account_list[accountIndex].status = 'ERROR'
            if (m.status === 407) {
                account_list[accountIndex].status = 'PROXY_ERROR'
            } else if (m.status === 429) {
                account_list[accountIndex].status = 'MULTI_REQUEST_ERROR'
            }

            await master.change('log', m)

            await master.changePath('account_list', [{ ...account_list[accountIndex] }])

            worker.instance.terminate()                
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

    for (const worker of master.workers) {
        if (worker.instance.threadId === account_list[accountIndex].workerId) {
            await worker.instance.terminate()
        }
    }

    let proxy = account_list[accountIndex].proxy

    const proxyIndex = app_setting.proxies.findIndex(p => p.ip === proxy)
    if (proxyIndex >= 0 && account_list[accountIndex].status !== ACCOUNT_STATUS.DONE) {
        app_setting.proxies[proxyIndex].count--
        await master.change('app_setting', { app_setting })
    }
    account_list[accountIndex].status = ACCOUNT_STATUS.PAUSED
    await master.changePath('account_list', [{ ...account_list[accountIndex] }])
    await master.dequeue()
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

        accountFront = master.priorityQueue.front()?.element
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
        const newAccount = account_list[i]

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


module.exports = master