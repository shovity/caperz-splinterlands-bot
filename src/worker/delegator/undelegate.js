const { parentPort, workerData } = require("worker_threads")
const delegate = require('./delegate')
const utils = require('../../utils')
const undelegate = async (delegator, task) => {
    const majorClient = delegator.majorAccountClient
    changeStatus(delegator, task, 'running')
    if (majorClient) {
        const res = await majorClient.undelegatePower(task.data?.cards)
        if (res) {
            console.log('undelegate done')
        } else {
            console.log('undelegate fail')
        }
    }
    const result = await utils.getDetails(task.data?.player || task.data?.username)
    task.data.power = result.collection_power || 0
    changeStatus(delegator, task, 'done')
    afterDone(delegator, task)
}

const delay = (time) => {
    return new Promise(resolve => {
        setTimeout(() => resolve(), time)
    })
}

const changeStatus = (delegator, task, status) => {
    for (let i = 0; i < delegator.undelegateQueue.length; i++) {
        if (delegator.undelegateQueue[i].id === task.id) {
            delegator.undelegateQueue[i].status = status
            break
        }
    }
}

const afterDone = (delegator, task) => {
    const pendingUndelegateTasks = delegator.undelegateQueue.filter(e => e.status === 'pending')
    const pendingDelegateTasks = delegator.delegateQueue.filter(e => e.status === 'pending')

    if (pendingUndelegateTasks.length && !delegator.isRunning()) {
        const task = pendingUndelegateTasks.shift()
        delegator.undelegate(delegator, task)
    }

    const message = {
        id: task.id,
        name: task.name,
        status: 'done',
        data: task.data,
        pendingDelegateTasks: pendingDelegateTasks.length,
        pendingUndelegateTasks: pendingUndelegateTasks.length
    }

    parentPort.postMessage(message)
}


module.exports = undelegate