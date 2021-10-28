const SplinterLandsClient = require('./src/SplinterlandsClient')
const WSSplinterlandsClient = require('./src/SplinterlandsClientWS')

const defaultConfig = {
    ecr: 70, // stop auto when ecr = 70%
    questECR: 5, //start quest when ECR <= config.ecr + questECR (70+5)

}

async function main({ username, password, account, emailPass, proxy, config = null }) {
    console.log({ username, password, account, emailPass, proxy })
    config = config || defaultConfig
    const api = new SplinterLandsClient(proxy, config)

    const user = await api.login(username, password)
    console.log(user)
    const resAuth = await api.auth(user.name, user.token)

    if (resAuth && resAuth.success) {
        console.log('success login', user.name, api.getEcr(), api.getBalance('DEC'))

        await api.updateSettings()

        if (api.user.starter_pack_purchase) {
            const getUserQuestNew = async () => {
                return await api.login(username, password, true)
            }

            const WSApi = new WSSplinterlandsClient(api, proxy, getUserQuestNew, config)
            WSApi.Connect(user.name, user.token)
        }
    }
}


module.exports = main