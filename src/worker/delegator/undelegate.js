const {parentPort, workerData} = require("worker_threads")

const undelegate = async (delegator, task) => {
    changeStatus(delegator, task, 'running')

    await delay(3000)

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
    const pendingDelegateTasks = delegator.undelegateQueue.filter(e => e.status === 'pending').length

    if (pendingDelegateTasks.length && !delegator.isRunning()) {
        const task = pendingDelegateTasks.pop()
        undelegate(delegator, task)
    }

    parentPort.postMessage({
        id: task.id,
        name: task.name,
        status: 'done',
    })
}


module.exports = undelegate