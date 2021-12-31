const { parentPort, workerData } = require('worker_threads')
const { v4: uuidv4 } = require('uuid')
const SplinterLandsClient = require('../../service/splinterlands/SplinterlandsClient')
const delegate = require('../delegator/delegate')
const undelegate = require('../delegator/undelegate')

const delegator = {
    delegateQueue: [],
    undelegateQueue: [],
    majorAccountClient: null,
    isRunning: () =>
        !!(delegator.undelegateQueue.findIndex((t) => t.status === 'running') >= 0) ||
        !!(delegator.delegateQueue.findIndex((t) => t.status === 'running') >= 0),
}

async function loginMajorAccount(data) {
    const client = new SplinterLandsClient(data.config?.proxy, data.config, data.config?.majorAccount?.masterKey)
    try {
        const user = await client.login(data.config?.majorAccount?.player, data.config?.majorAccount?.postingKey)
        const resAuth = await client.auth(user.name, user.token)
        if (resAuth && resAuth.success) {
            delegator.majorAccountClient = client
            await client.updateSettings()
        }
    } catch (error) {
        console.error('delegator', error)
    }
}

async function main(workerData) {
    if (
        !delegator.majorAccountClient &&
        workerData.config?.majorAccount?.player &&
        workerData.config?.majorAccount?.postingKey
    ) {
        loginMajorAccount(workerData)
    }
}

delegator.push =async (task) => {
    if (
        !delegator.majorAccountClient &&
        task.config?.majorAccount?.player &&
        task.config?.majorAccount?.postingKey
    ) {
        await loginMajorAccount(task)
    }

    if (!delegator.majorAccountClient) {
        return 
    }

    if (task.name === 'delegate') {
        delegator.delegateQueue.push(task)
    }

    if (task.name === 'undelegate') {
        delegator.undelegateQueue.push(task)
    }

    if (delegator.isRunning()) {
        return
    }

    if (task.name === 'delegate') {
        if (delegator.undelegateQueue.filter((e) => e.status === 'pending').length) {
            const task = delegator.undelegateQueue[delegator.undelegateQueue.length - 1]
            undelegate(delegator, task)
        } else {
            delegate(delegator, task)
        }
    }

    if (task.name === 'undelegate') {
        undelegate(delegator, task)
    }
}

parentPort.on('message', (message) => {
    if (message.task) {
        const task = {
            id: uuidv4(),
            name: message.task,
            data: message.data,
            status: 'pending',
        }

        delegator.push(task)
    }
})

module.exports = main
