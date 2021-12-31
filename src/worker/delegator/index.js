// const SplinterLandsClient = require('../../service/splinterlands/SplinterlandsClient')

// const {parentPort, workerData} = require("worker_threads")

// async function main(wokerData) {
//     const client = new SplinterLandsClient(wokerData.param?.proxy, wokerData.config, wokerData.config?.majorAccount?.masterKey)
//     try {
//         const user = await client.login(wokerData.config?.majorAccount?.player, wokerData.config?.majorAccount?.postingKey)
//         const resAuth = await client.auth(user.name, user.token)

//         if (resAuth && resAuth.success) {
//             // console.log('success login', user.name, client.getEcr(), client.getBalance('DEC'))
//             await client.updateSettings()
//             await client.delegatePower(wokerData.param?.player, wokerData.param?.pw, workerData.param.currentPower)
//             parentPort.postMessage({
//                 type: 'DONE',
//                 player: wokerData.param?.player,
//             })
//         }
//     } catch (error) {
//         console.error('delegating', error)
//     }
// }

// module.exports = main

const { parentPort, workerData } = require('worker_threads')
const { v4: uuidv4 } = require('uuid')
const SplinterLandsClient = require('../../service/splinterlands/SplinterlandsClient')
const delegate = require('../delegator/delegate')
const undelegate = require('../delegator/undelegate')

const delegator = {
    delegateQueue: [],
    undelegateQueue: [],
    majorAccount: null,
    isRunning: () =>
        !!(delegator.undelegateQueue.findIndex((t) => t.status === 'running') >= 0) ||
        !!(delegator.delegateQueue.findIndex((t) => t.status === 'running') >= 0),
}

async function main(wokerData) {
    console.log('start testing', wokerData)
    const config = worderData.config
    if (!delegator.majorAccount) {
        const client = new SplinterLandsClient(config?.proxy, config, config?.majorAccount?.masterKey)
        try {
            const user = await client.login(
                wokerData.config?.majorAccount?.player,
                wokerData.config?.majorAccount?.postingKey
            )
            const resAuth = await client.auth(user.name, user.token)

            if (resAuth && resAuth.success) {
                // console.log('success login', user.name, client.getEcr(), client.getBalance('DEC'))
                await client.updateSettings()
                await client.delegatePower(wokerData.param?.player, wokerData.param?.pw, workerData.param.currentPower)
                parentPort.postMessage({
                    type: 'DONE',
                    player: wokerData.param?.player,
                })
            }
        } catch (error) {
            console.error('delegating', error)
        }
    }
}

delegator.push = (task) => {
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
