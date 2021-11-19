const Store = require('electron-store')

const store = new Store()

// store.onDidChange('app_setting', (newValue) => {
//     console.log(newValue)
// })

store.clear()


module.exports = store
