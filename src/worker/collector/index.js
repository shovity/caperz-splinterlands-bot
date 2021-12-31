const SplinterLandsClient = require('../../service/splinterlands/SplinterlandsClient')

const {parentPort, workerData} = require("worker_threads")

async function main(workerData) {
    const client = new SplinterLandsClient(workerData.param?.proxy, workerData.config, workerData.config?.majorAccount?.masterKey)
    try {
        const user = await client.login(workerData.config?.majorAccount?.player, workerData.config?.majorAccount?.postingKey)
        const resAuth = await client.auth(user.name, user.token)
    
        if (resAuth && resAuth.success) {
            // console.log('success login', user.name, client.getEcr(), client.getBalance('DEC'))
            await client.updateSettings()
            console.log(workerData.param?.cards)
            const res = await client.undelegatePower(workerData.param?.cards, workerData.param?.power, workerData.param?.player)
            parentPort.postMessage({
                type: 'DONE',
                player: workerData.param?.player,
                newPower: workerData.param?.power,
            })
        }
    } catch (error) {
        console.log(error)
    }
}


module.exports = main