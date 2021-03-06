const SplinterLandsClient = require('../../service/splinterlands/SplinterlandsClient')
const WSSplinterlandsClient = require('../../service/splinterlands/SplinterlandsClientWS')
const { parentPort } = require('worker_threads')

const defaultConfig = {
    ecr: 55, // stop auto when ecr = 70%
    questECR: 60,
}

async function main({ username, password, account, emailPass, proxy, config = null, postingKey, masterKey , spsToken, delegated }) {
    config = config || defaultConfig
    const client = new SplinterLandsClient(proxy, config, masterKey)
    parentPort.postMessage({
        type: "MESSAGE",
        data: 'start login'
    })


    try {
        const user = await client.login(username, postingKey)

        parentPort.postMessage({
            type: "MESSAGE",
            data: 'login success'
        })
    
        const resAuth = await client.auth(user.name, user.token)
    
        if (resAuth && resAuth.success) {

            // console.log('success login', user.name, client.getEcr(), client.getBalance('DEC'))
    
            await client.updateSettings()
    
            let getUserQuestNew
    
            if (client.user.starter_pack_purchase) {
                getUserQuestNew = async () => {
                    return await client.login(username, postingKey, true)
                }
            }
    
            const WSApi = new WSSplinterlandsClient(client, proxy, getUserQuestNew, config, spsToken, delegated)
            WSApi.Connect(user.name, user.token)
        }
    } catch (e) {
        parentPort.postMessage({
            type: "ERROR",
            player: username,
            status: e.status || e.code,
            message: e.statusText || e.message,
        })
    }
}


module.exports = main