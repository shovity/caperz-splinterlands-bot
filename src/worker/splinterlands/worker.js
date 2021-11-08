const SplinterLandsClient = require('./src/SplinterlandsClient')
const WSSplinterlandsClient = require('./src/SplinterlandsClientWS')

const defaultConfig = {
    ecr: 55, // stop auto when ecr = 70%
    questECR: 60,
}

async function main({ username, password, account, emailPass, proxy, config = null, postingKey }) {

    config = config || defaultConfig
    const client = new SplinterLandsClient(proxy, config)

    const user = await client.login(username, postingKey)

    const resAuth = await client.auth(user.name, user.token)

    if (resAuth && resAuth.success) {
        // console.log('success login', user.name, client.getEcr(), client.getBalance('DEC'))

        await client.updateSettings()

        if (client.user.starter_pack_purchase) {
            const getUserQuestNew = async () => {
                return await client.login(username, postingKey, true)
            }

            const WSApi = new WSSplinterlandsClient(client, proxy, getUserQuestNew, config)
            WSApi.Connect(user.name, user.token)
        }
    }
}


module.exports = main