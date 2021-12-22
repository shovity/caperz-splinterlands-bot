const settings = require('../settings')


const MESSAGE_STATUS = {
    INFO_UPDATE: "INFO_UPDATE",
    STATUS_UPDATE: "STATUS_UPDATE",
    MESSAGE: "MESSAGE",
    ERROR: "ERROR",
    CREATE_DELEGATOR: "CREATE_DELEGATOR",
    CREATE_COLLECTOR: "CREATE_COLLECTOR"
}

const service = {}

service.handleMessage = (worker, message, master) => {
    switch (worker.name) {
        case 'splinterlands':
            service.splinterlandMessageHandler(worker, message, master)
            break

        case 'delegator':
            service.delegatorMessageHandler(worker, message, master)
            break

        case 'collector':
            service.collectorMesssageHandler(worker, message, master)
            break
    }
}

service.collectorMesssageHandler = async (worker, message, master) => {
    const account_list = settings.data.account_list

    const accountIndex = account_list.findIndex(a => a.username === message.player)

    account_list[accountIndex].power = message.newPower
    await master.changePath('account_list', [{ ...account_list[accountIndex] }])

    worker.instance.terminate()
}

service.delegatorMessageHandler = async (worker, message, master) => {
    const account_list = settings.data.account_list

    const accountIndex = account_list.findIndex(a => a.username === message.player)

    if (message.type === 'DONE' && account_list[accountIndex].status === 'DELEGATING') {
        const proxyIp = account_list[accountIndex].proxy
        const delegated = 1
        master.handleAddAccount(account_list[accountIndex], proxyIp, delegated)
    } else if (message.type === 'ERROR') {
        account_list[accountIndex].status = 'DELEGATING_ERROR'

        await master.changePath('account_list', [{ ...account_list[accountIndex] }])
    }

    worker.instance.terminate()
}

service.splinterlandMessageHandler = async (worker, message, master) => {
    const account_list = settings.data.account_list
    const app_setting = settings.data.app_setting
    const accountIndex = account_list.findIndex(a => a.username === message.player || a.username === message.param?.player)

    switch (message.type) {
        case MESSAGE_STATUS.INFO_UPDATE:

            if (accountIndex === -1) {
                return worker.instance.terminate()
            }

            if (typeof message.ecr != 'undefined') {
                const now = Date.now()
                account_list[accountIndex].ecr = master.calculateECR(now, message.ecr)
            }

            if (typeof message.rating != 'undefined') {
                account_list[accountIndex].rating = message.rating
            }

            if (typeof message.dec != 'undefined') {
                account_list[accountIndex].dec = message.dec
            }

            if (message.lastRewardTime) {
                account_list[accountIndex].lastRewardTime = message.lastRewardTime
            }

            if (typeof message.questClaimed != 'undefined') {
                account_list[accountIndex].questClaimed = message.questClaimed
            }

            if (message.matchStatus) {
                account_list[accountIndex].matchStatus = message.matchStatus || 'NONE'
            }

            if (typeof message.quest != 'undefined') {
                account_list[accountIndex].quest = message.quest
            }

            if (message.maxQuest) {
                account_list[accountIndex].maxQuest = message.maxQuest
            }
            if (message.status) {
                account_list[accountIndex].status = message.status
            }
            if (typeof message.power != 'undefined') {
                account_list[accountIndex].power = message.power
            }

            await master.changePath('account_list', [{ ...account_list[accountIndex] }])
            break

        case MESSAGE_STATUS.STATUS_UPDATE: 

            if (accountIndex === -1) {
                return worker.instance.terminate()
            }

            account_list[accountIndex].status = message.status

            await master.changePath('account_list', [{ ...account_list[accountIndex] }])

            if (message.status === 'DONE') {
                let proxy = account_list[accountIndex].proxy

                const proxyIndex = app_setting.proxies.findIndex(p => p.ip === proxy)
                if (proxyIndex >= 0) {
                    app_setting.proxies[proxyIndex].count--
                    await master.change('app_setting', { app_setting })
                }

                await master.dequeue()
                worker.instance.terminate()                
            }
            break

        case MESSAGE_STATUS.MESSAGE:
            await master.change('log', message.data)
            break

        case MESSAGE_STATUS.ERROR:
            worker.instance.terminate()                

            let proxy = account_list[accountIndex].proxy

            const proxyIndex = app_setting.proxies.findIndex(p => p.ip === proxy)
            if (proxyIndex >= 0) {
                app_setting.proxies[proxyIndex].count--
                await master.change('app_setting', { app_setting })
            }

            account_list[accountIndex].status = 'ERROR'
            if (message.status === 407) {
                account_list[accountIndex].status = 'PROXY_ERROR'
            } else if (message.status === 429) {
                account_list[accountIndex].status = 'MULTI_REQUEST_ERROR'
            }

            await master.change('log', message)

            await master.changePath('account_list', [{ ...account_list[accountIndex] }])
            break

        case MESSAGE_STATUS.CREATE_DELEGATOR:
            worker.instance.terminate()

            await master.add({
                worker: {
                    name: 'delegator',
                },
                param: message.param,
                config: app_setting
            })

            account_list[accountIndex].status = 'DELEGATING'

            await master.changePath('account_list', [{ ...account_list[accountIndex] }])

            break

        case MESSAGE_STATUS.CREATE_COLLECTOR: 
            await master.add({
                worker: {
                    name: 'collector',
                },
                param: message.param,
                config: app_setting
            })
            break
    }
}

service.checkWorkerRunable = (worker, master) => {
    if (worker.status !== 'pending') {
        return false
    }

    const config = master.config[worker.name]
    const numberOfRunning = master.workers.filter(e => e.status === 'running' && e.name === worker.name).length

    if (config.concurrency === 'infinity') {
        return true
    } else if (config.concurrency > numberOfRunning) {
        return true
    } else {
        return false
    }
}


module.exports = service