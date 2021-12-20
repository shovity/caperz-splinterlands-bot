
const {parentPort, workerData} = require("worker_threads")

async function main(wokerData) {
    console.log(wokerData)
}


module.exports = main