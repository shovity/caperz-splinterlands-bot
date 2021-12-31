const {parentPort, workerData} = require("worker_threads")
const undelegate = require('./undelegate')

const delegate = async (delegator, task) => {
    changeStatus(delegator, task, 'running')
    console.log(task.data)
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
    const pendingDelegateTasks = delegator.delegateQueue.filter(e => e.status === 'pending')
    const undelegateTasks = delegator.undelegateQueue.filter(e => e.status === 'pending')

    if (
        pendingDelegateTasks.length && 
        !delegator.isRunning() && 
        !undelegateTasks.length
    ) {
        const task = pendingDelegateTasks.pop()
        delegate(delegator, task)
    }

    if (
        undelegateTasks.length &&
        !delegator.isRunning()
    ) {
        const task = undelegateTasks.pop()
        undelegate(delegator, task)
    }

    parentPort.postMessage({
        id: task.id,
        name: task.name,
        status: 'done',
    })
}


module.exports = delegate