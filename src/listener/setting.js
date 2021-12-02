const master = require('../master')

const setting = ({ win, ipc, settings }) => {
    ipc.on('setting.save', async (event, data) => {
        const oldSetting = await settings.data.app_setting
        let newSetting = {
            ...oldSetting,
            ecr: data.ecr,
            startQuestEcr: data.startQuestEcr,
            botPerIp: data.botPerIp,
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
}


module.exports = setting