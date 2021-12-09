
const { parentPort } = require('worker_threads')

async function main(wokerData) {
    console.log(wokerData)
}


module.exports = main