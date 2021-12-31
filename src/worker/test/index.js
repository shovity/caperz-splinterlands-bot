
const {parentPort, workerData} = require("worker_threads")
const { v4: uuidv4 } = require('uuid')

async function main(wokerData) {
    console.log('start testing', wokerData)
}


module.exports = main