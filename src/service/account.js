const settings = require('../settings')
const requester = require('./requester')
const ACCOUNT_STATUS = {
    PENDING: 'PENDING',
    DONE: 'DONE',
    RUNNING: 'RUNNING',
    STOPPED: 'STOPPED',
    NONE: 'NONE',
    PAUSED: 'PAUSED',
    WAITING_ECR: 'WAITING_ECR'
}

const MATCH_STATUS = {
    MATCHING: 'MATCHING',
    MATCHED: 'MATCHED',
    SUBMITTING: 'SUBMITTING',
    NONE: 'NONE'
}

const service = {}

service.handleNotEnoughEcr = (username) => {
    const account_list = settings.data.account_list
    const ecrStop = settings.data.app_setting.ecr || 0
    const ecrStart = settings.data.app_setting.startEcr || 80
    for (let i = 0; i< account_list.length; i++) {
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
        recoverECR = +(((now - lastRewardTime) / ONE_HOUR).toFixed(2))
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

service.getMajorAccountInfo = async (username) => {
    console.log('get aos')
    let res = await requester['get']('ann')
    return 'abc'
}


module.exports = service