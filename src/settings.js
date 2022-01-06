const localSettings = require('electron-settings')

const settings = {
    data: {
        account_list: [],
        account_origin_list: [],
        app_setting: null,
        user: null
    }
}

settings.getSync = localSettings.getSync
settings.setSync = localSettings.setSync

settings.init = () => {
    for (const key in settings.data) {
        settings.data[key] = localSettings.getSync(key)

        // if (key === 'account_origin_list') {
        //     if (!settings.data[key].length) {
        //         settings.data.account_origin_list = localSettings.getSync('account_list')
        //     }   
        // }
    }
}

const ONE_MINUTE = 60 * 1000

setInterval(() => {
    for (const key in settings.data) {
        localSettings.setSync(key, settings.data[key])
    }
}, ONE_MINUTE)


module.exports = settings