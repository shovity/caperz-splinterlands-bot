const SplinterLandsClient = require('./src/SplinterlandsClient')
const WSSplinterlandsClient = require('./src/SplinterlandsClientWS')


async function main({ username, password, account, emailPass, proxy }) {
    console.log({ username, password, account, emailPass, proxy })

    const api = new SplinterLandsClient(proxy)

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

            const WSApi = new WSSplinterlandsClient(api, proxy, getUserQuestNew)
            WSApi.Connect(user.name, user.token)
        }
    }
}


module.exports = main