const {parentPort, workerData} = require("worker_threads")

const delegate = async (delegator, task) => {
    console.log('worker running')
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
    for (let i = 0; i < delegator.delegateQueue.length; i++) {
        if (delegator.delegateQueue[i].id === task.id) {
            delegator.delegateQueue[i].status = status
            break
        }
    }
}

const afterDone = (delegator, task) => {
    const pendingDelegateTasks = delegator.delegateQueue.filter(e => e.status === 'pending').length

    if (pendingDelegateTasks.length && !delegator.isRunning()) {
        const task = pendingDelegateTasks.pop()
        delegate(delegator, task)
    }

    parentPort.postMessage({
        id: task.id,
        name: task.name,
        status: 'done',
    })
}


module.exports = delegate