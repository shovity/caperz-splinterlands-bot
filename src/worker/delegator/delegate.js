const {parentPort, workerData} = require("worker_threads")

const delegate = async (delegator, task) => {
    try {
        const majorClient = delegator.majorAccountClient
        changeStatus(delegator, task, 'running')
        if (majorClient) {
            const res = await majorClient.delegatePower(task.data?.username, task.data.minDelegatePower)
            // if (res) {
            //     console.log('delegate done')
            // } else {
            //     console.log('delegate fail')
            // }
        }
        changeStatus(delegator, task, 'done')

        afterDone(delegator, task)
    } catch (err) {
        changeStatus(delegator, task, 'done')
        let errMessage = err.statusText || err.message

        if (typeof err === 'string') {
            errMessage = err
        }
        afterError(
            errMessage,
            err.status || err.code,
            err,
            task,
            delegator,
        )
    }
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
        const task = pendingDelegateTasks.shift()
        delegator.delegate(delegator, task)
    }

    if (
        undelegateTasks.length &&
        !delegator.isRunning()
    ) {
        const task = undelegateTasks.shift()
        delegator.undelegate(delegator, task)
    }

    parentPort.postMessage({
        id: task.id,
        name: task.name,
        status: 'done',
        data: task.data
    })
}

const afterError = (message, code, cause, task, delegator) => {
    const pendingDelegateTasks = delegator.delegateQueue.filter(e => e.status === 'pending')
    const undelegateTasks = delegator.undelegateQueue.filter(e => e.status === 'pending')

    if (
        pendingDelegateTasks.length && 
        !delegator.isRunning() && 
        !undelegateTasks.length
    ) {
        const task = pendingDelegateTasks.shift()
        delegator.delegate(delegator, task)
    }

    if (
        undelegateTasks.length &&
        !delegator.isRunning()
    ) {
        const task = undelegateTasks.shift()
        delegator.undelegate(delegator, task)
    }

    parentPort.postMessage({
        id: task.id,
        name: task.name,
        type: 'error',
        code,
        message,
        cause,
        data: task.data,
    })
}


module.exports = delegate