const settings = require('../settings')
const utils = require('../utils')
const MESSAGE_STATUS = {
    INFO_UPDATE: 'INFO_UPDATE',
    STATUS_UPDATE: 'STATUS_UPDATE',
    MESSAGE: 'MESSAGE',
    ERROR: 'ERROR',
    CREATE_DELEGATOR: 'CREATE_DELEGATOR',
    CREATE_COLLECTOR: 'CREATE_COLLECTOR',
    INFO: 'info',
}

const ACCOUNT_STATUS = {
    PENDING: 'PENDING',
    DONE: 'DONE',
    RUNNING: 'RUNNING',
    STOPPED: 'STOPPED',
    NONE: 'NONE',
    PAUSED: 'PAUSED',
    WAITING_ECR: 'WAITING_ECR',
    UNDELEGATING: 'undelegating',
    ERROR: 'ERROR',
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

        case 'test':
            service.testMessageHandler(worker, message, master)
            break
    }
}

service.testMessageHandler = async (worker, message, master) => {
    console.log(message)
}

service.delegatorMessageHandler = async (worker, message, master) => {
    const app_setting = settings.data.app_setting
    const account_list = settings.data.account_list

    const accountIndex = account_list.findIndex(
        (a) =>
            a.username === message.player ||
            a.username === message.data?.username ||
            a.username === message.data?.player
    )

    const account = account_list[accountIndex]

    if (message.type === 'error') {
        master.change('log', {
            message: message.message,
            type: 'error',
        })
        let proxy = account.proxy

        const proxyIndex = app_setting.proxies.findIndex((p) => p.ip === proxy)
        if (proxyIndex >= 0) {
            app_setting.proxies[proxyIndex].count--
            await master.change('app_setting', { app_setting })
        }

        const accountUpdate = {
            username: account.username,
            status: ACCOUNT_STATUS.ERROR,
        }

        await master.changePath('account_list', [accountUpdate])

        await master.dequeue()

        if (!message.pendingUndelegateTasks && message.pendingDelegateTasks) {
            master.delegatorWorker.instance.postMessage({
                action: 'delegating_continue',
            })
        }
        
        return
    }

    if (message.type === 'info') {
        master.change('log', {
            message: message.message,
            type: 'info',
        })

        return
    }

    if (message.name === 'delegate' && message.status === 'done') {
        await master.handleAddAccount(
            {
                username: account.username,
                postingKey: account.postingKey,
                masterKey: account.masterKey,
                token: account.token,
            },
            account.proxy,
            1
        )
    } else if (message.name === 'undelegate') {
        let proxy = account.proxy

        const proxyIndex = app_setting.proxies.findIndex((p) => p.ip === proxy)
        if (proxyIndex >= 0) {
            app_setting.proxies[proxyIndex].count--
            await master.change('app_setting', { app_setting })
        }

        const accountUpdate = {
            username: account.username,
            status: ACCOUNT_STATUS.DONE,
        }

        if (message.data.power || message.data.power === 0) {
            accountUpdate.power = message.data.power
        }

        await master.changePath('account_list', [accountUpdate])

        await master.dequeue()

        if (!message.pendingUndelegateTasks && message.pendingDelegateTasks) {
            master.delegatorWorker.instance.postMessage({
                action: 'delegating_continue',
            })
        }
    }
}

service.splinterlandMessageHandler = async (worker, message, master) => {
    const account_list = settings.data.account_list
    const app_setting = settings.data.app_setting
    const accountIndex = account_list.findIndex(
        (a) => a.username === message.player || a.username === message.param?.player
    )

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

            if (typeof message.credits != 'undefined') {
                account_list[accountIndex].credits = message.credits
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

            if (message.status === 'DONE') {
                worker.instance.terminate()
                const stoprc = app_setting.majorAccount?.stoprc || 5
                if (
                    app_setting.modeDelegate &&
                    app_setting.majorAccount?.player &&
                    app_setting.majorAccount?.postingKey &&
                    app_setting.majorAccount?.rc >= stoprc
                ) {
                    account_list[accountIndex].status = ACCOUNT_STATUS.UNDELEGATING
                    master.delegatorWorker.instance.postMessage({
                        task: 'undelegate',
                        data: {
                            ...message.param,
                        },
                    })
                } else {
                    let proxy = account_list[accountIndex].proxy

                    const proxyIndex = app_setting.proxies.findIndex((p) => p.ip === proxy)
                    if (proxyIndex >= 0) {
                        app_setting.proxies[proxyIndex].count--
                        await master.change('app_setting', { app_setting })
                    }

                    await master.dequeue()
                }

                await master.changePath('account_list', [{ ...account_list[accountIndex] }])
            }

            break

        case MESSAGE_STATUS.MESSAGE:
            await master.change('log: ', message.data)
            break

        case MESSAGE_STATUS.ERROR:
            worker.instance.terminate()

            let proxy = account_list[accountIndex].proxy

            const proxyIndex = app_setting.proxies.findIndex((p) => p.ip === proxy)
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

            await master.change('log', {
                message: message,
                type: 'error',
            })

            await master.changePath('account_list', [{ ...account_list[accountIndex] }])

            await master.dequeue()
            break
        //TODO: clear status create delegator
        case MESSAGE_STATUS.CREATE_DELEGATOR:
            worker.instance.terminate()

            await master.add({
                worker: {
                    name: 'delegator',
                },
                param: message.param,
                config: app_setting,
            })

            account_list[accountIndex].status = 'DELEGATING'

            await master.changePath('account_list', [{ ...account_list[accountIndex] }])

            break

        //TODO: clear status create delegator
        case MESSAGE_STATUS.CREATE_COLLECTOR:
            await master.add({
                worker: {
                    name: 'collector',
                },
                param: message.param,
                config: app_setting,
            })
            break
        
        case MESSAGE_STATUS.INFO:
            master.change('log', {
                message: message.message,
                type: 'info',
            })
            break
    }
}

service.checkWorkerRunable = (worker, master) => {
    if (worker.status !== 'pending') {
        return false
    }

    const config = master.config[worker.name]
    const numberOfRunning = master.workers.filter((e) => e.status === 'running' && e.name === worker.name).length

    if (config.concurrency === 'infinity') {
        return true
    } else if (config.concurrency > numberOfRunning) {
        return true
    } else {
        return false
    }
}

service.beforeTerminateWorker = (worker, master) => {
    master.workers = master.workers.map((w) => {
        if (w.id === worker.id) {
            w.status = 'stopped'
        }

        return w
    })
}

service.createDelegator = async (master) => {
    master.delegatorWorker = await master.add({
        worker: {
            name: 'delegator',
        },
        config: settings.data.app_setting,
    })
}

service.checkDelegate = async (player, proxy, master) => {
    const appSetting = settings.data.app_setting
    const minDlgPower = appSetting.dlgMinPower || 0

    if (!appSetting.modeDelegate) {
        return false
    }

    if (!appSetting.majorAccount?.player && !appSetting.majorAccount?.postingKey) {
        master.change('log', { type: 'info', message: `${player}: Delegate failed - missing major account` })
        return false
    }

    const res = (await utils.getDetails(player, proxy)) || {}
    if (typeof res.collection_power == 'undefined') {
        master.change('log', { type: 'error', message: `${player}: Delegate failed - get player details error` })
        return false
    }
    const cp = res.collection_power

    const cards = await utils.getCollection(appSetting.majorAccount?.player, proxy)
    if (cards == null) {
        master.change('log', { type: 'error', message: `${player}: Delegate failed - get major collection error` })
        return false
    }
    let availablePower = 0
    const availableCards = cards.filter((c) => {
        if (!c.delegated_to && utils.calculateCP(c) >= 100) {
            availablePower += utils.calculateCP(c)
            return true
        }
    })

    if (typeof appSetting.majorAccount.rc == 'undefined') {
        master.change('log', { type: 'error', message: `${player}: Delegate failed - cannot read major account RC` })
        return false
    }
    if (minDlgPower - cp > availablePower) {
        master.change('log', { type: 'info', message: `${player}: Delegate failed - major power run out` })
    }
    const stoprc = appSetting.majorAccount.stoprc || 5
    return minDlgPower > cp && appSetting.majorAccount.rc >= stoprc && availablePower > 10
}

module.exports = service
