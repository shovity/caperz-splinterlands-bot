
const {parentPort, workerData} = require("worker_threads")
const { v4: uuidv4 } = require('uuid')

async function main(workerData) {
    console.log('start testing', workerData)
}


module.exports = main