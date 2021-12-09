const master = require('../master')

const setting = ({ win, ipc, settings }) => {
    ipc.on('setting.save', async (event, data) => {
        const oldSetting = settings.data.app_setting
        let newSetting = {
            ...oldSetting,
            ecr: data.ecr,
            startQuestEcr: data.startQuestEcr,
            botPerIp: data.botPerIp,
            useDefaultProxy: data.useDefaultProxy,
            maxDec: data.maxDec,
            expectedPower: data.expectedPower
        }
        newSetting.proxies = data.proxies.map((p) => {
            const oldProxy = oldSetting.proxies.find((pr) => p.ip == pr.ip)
            if (oldProxy) {
                return oldProxy
            } else {
                return {
                    ip: p.ip,
                    protocol: p.protocol,
                    count: 0,
                    status: 'active',
                }
            }
        })
    
        settings.data.app_setting = newSetting
        await master.enqAccounts()
    })
    ipc.on('major_account.save', (e, data) => {
        const oldSetting = settings.data.app_setting
        let newSetting = {
            ...oldSetting,
            majorAccount: {
                player: data.username,
                masterKey: data.master_key
            },
        }
        settings.data.app_setting = newSetting
    })
}


module.exports = setting