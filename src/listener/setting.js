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
            transferKeepDec: data.transferKeepDec,
            transferStartDec: data.transferStartDec,
            autoTransferCard: data.autoTransferCard,
            rentalDay: data.rentalDay,
            expectedPower: data.expectedPower,
            majorAccount: {
                player: data.username,
                masterKey: data.masterKey
            }
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
        // await master.enqAccounts()
    })
}


module.exports = setting