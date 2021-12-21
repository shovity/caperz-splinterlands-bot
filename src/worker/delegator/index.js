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
            const res = await client.delegatePower(wokerData.param?.player, wokerData.param?.pw, workerData.param.currentPower)
            
            parentPort.postMessage({
                type: 'DONE',
                player: wokerData.param?.player,
            })
        }
    } catch (error) {
        console.error('delegating', error)
    }
}


module.exports = main