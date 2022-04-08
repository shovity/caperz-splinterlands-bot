const settings = require('../settings')
const requester = require('./requester')
const utils = require('../utils')
const ACCOUNT_STATUS = {
    PENDING: 'PENDING',
    DONE: 'DONE',
    RUNNING: 'RUNNING',
    STOPPED: 'STOPPED',
    NONE: 'NONE',
    PAUSED: 'PAUSED',
    WAITING_ECR: 'WAITING_ECR',
}

const MATCH_STATUS = {
    MATCHING: 'MATCHING',
    MATCHED: 'MATCHED',
    SUBMITTING: 'SUBMITTING',
    NONE: 'NONE',
}

const service = {}

service.handleNotEnoughEcr = (username) => {
    const account_list = settings.data.account_list
    const ecrStop = settings.data.app_setting.ecr || 0
    const ecrStart = settings.data.app_setting.startEcr || 80
    for (let i = 0; i < account_list.length; i++) {
        const ecrNow = service.calculateECR(account_list[i].updatedAt, account_list[i].ecr)

        if (ecrNow <= ecrStart) {
            settings.data.account_list[i].status = ACCOUNT_STATUS.WAITING_ECR
        } else if (settings.data.account_list[i].status === ACCOUNT_STATUS.WAITING_ECR) {
            settings.data.account_list[i].status = ACCOUNT_STATUS.NONE
        }

        if (username === account_list[i].username) {
            break
        }
    }
}

service.handleUpdateMatchStatus = (account, status) => {
    for (let i = 0; i < settings.data.account_list.length; i++) {
        if (settings.data.account_list[i].username === account.username) {
            settings.data.account_list[i].matchStatus = status
            break
        }
    }
}

service.calculateECR = (lastRewardTime = 0, ecr) => {
    const ONE_MINUTE = 60 * 1000
    const ONE_HOUR = 60 * ONE_MINUTE

    const now = Date.now()
    let recoverECR = 0

    if (lastRewardTime) {
        recoverECR = +((now - lastRewardTime) / ONE_HOUR).toFixed(2)
    }

    ecr = +(recoverECR + ecr).toFixed(2)

    if (ecr > 100) {
        ecr = 100
    }

    return ecr
}

service.beforePausedOrStopped = (account) => {
    service.handleUpdateMatchStatus(account, MATCH_STATUS.NONE)
}

service.beforeEnqueue = (username = null) => {
    service.handleNotEnoughEcr(username)
}

service.getMajorAccountInfo = async () => {
    try {
        const username = settings.data.app_setting.majorAccount?.player
        if (!username) {
            return {}
        }
        const { result } = await requester['post']('https://api.hive.blog', {
            id: 1,
            jsonrpc: '2.0',
            method: 'rc_api.find_rc_accounts',
            params: {
                accounts: [username],
            },
        })
        let rc = 0
        let a = Math.ceil(new Date().getTime() / 1000) - result.rc_accounts[0].rc_manabar.last_update_time
        let r = parseFloat(result.rc_accounts[0].max_rc)
        let i = parseFloat(result.rc_accounts[0].rc_manabar.current_mana) + (a * r) / 432e3
        rc = (100 * i) / r
        let res
        res = await requester['get'](`https://api2.splinterlands.com/cards/collection/${username}`)
        const cards = res.cards.filter((c) => {
            if (c.delegated_to && c.player == username) {
                return true
            }
        })
        let availablePower = 0
        const availableCards = res.cards.filter((c) => {
            if (!c.delegated_to && utils.calculateCP(c) >= 100) {
                availablePower += utils.calculateCP(c)
                return true
            }
        })
        const formattedList = []
        cards.forEach((c) => {
            const index = formattedList.findIndex((cd) => cd.delegatedTo == c.delegated_to)
            if (index == -1) {
                formattedList.push({
                    delegatedTo: c.delegated_to,
                    quantity: 1,
                    totalPower: utils.calculateCP(c),
                })
            } else {
                formattedList[index].quantity++
                formattedList[index].totalPower += utils.calculateCP(c)
            }
        })
        settings.data.app_setting.majorAccount.rc = rc
        settings.data.app_setting.majorAccount.availablePower = availablePower
        return {
            rc: rc || 0,
            availablePower: availablePower,
            delegatedCards: formattedList,
        }
    } catch (error) {
        console.log(error)
    }
}
service.setMajorInterval = async (master) => {
    const TIME = 60 * 1000
    const majorInfo = await service.getMajorAccountInfo()
    await master.change('major_account', majorInfo)
    master.minuteMajorIntervalId = setInterval(async () => {
        const majorInfo = await service.getMajorAccountInfo()
        await master.change('major_account', majorInfo)
    }, TIME)
}

module.exports = service
