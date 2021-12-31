const SplinterLandsClient = require('../../service/splinterlands/SplinterlandsClient')

const {parentPort, workerData} = require("worker_threads")

async function main(wokerData) {
    const client = new SplinterLandsClient(wokerData.param?.proxy, wokerData.config, wokerData.config?.majorAccount?.masterKey)
    try {
        const user = await client.login(wokerData.config?.majorAccount?.player, wokerData.config?.majorAccount?.postingKey)
        const resAuth = await client.auth(user.name, user.token)
    
        if (resAuth && resAuth.success) {
            // console.log('success login', user.name, client.getEcr(), client.getBalance('DEC'))
            await client.updateSettings()
            console.log(wokerData.param?.cards)
            const res = await client.undelegatePower(wokerData.param?.cards, wokerData.param?.power, workerData.param?.player)
            parentPort.postMessage({
                type: 'DONE',
                player: workerData.param?.player,
                newPower: wokerData.param?.power,
            })
        }
    } catch (error) {
        console.log(error)
    }
}


module.exports = main