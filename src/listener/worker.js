const master = require('../master')

const worker = ({ ipc }) => {
    ipc.on('worker.add', async (event, data) => {
        master.add(data)
    })
    
    ipc.on('worker.remove_all', (event, arg) => {
        master.removeAll()
    })

    ipc.on('worker.start', async (e) => {
        master.startWorkers()
    })
    
    ipc.on('worker.stop', async (e) => {
        master.pauseWorkers()
    })
}


module.exports = worker