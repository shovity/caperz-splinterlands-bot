const master = require('../master')

const setting = ({ win, ipc, settings }) => {
    ipc.on('setting.save', async (event, data) => {
        const oldSetting = settings.data.app_setting
        if (data.proxies && data.proxies.length) {
            data.proxies = data.proxies.map((p) => {
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
        } else {
            data.proxies = oldSetting.proxies
        }
        let newSetting = {
            ...oldSetting,
            ...data
        }
        settings.data.app_setting = newSetting
        // await master.enqAccounts()
    })
}


module.exports = setting