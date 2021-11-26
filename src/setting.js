const localSettings = require('electron-settings')

const settings = {
    account_list: [],
    app_setting: []
}

settings.get = localSettings.get
settings.set = localSettings.set


module.exports = settings