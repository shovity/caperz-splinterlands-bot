const master = require('../master')

const table = ({ win, ipc, settings }) => {
    ipc.on('player_table.redraw', () => {
        win.onChangeAccountList()
    })
    
    ipc.on('player_table.reorder', async (event, data) => {
        const account_list = await settings.getSync('account_list')
        const newList = []
        data.forEach((username) => {
            const acc = account_list.find((a) => username == a.username)
            newList.push(acc)
        })
        await settings.setSync('account_list', newList)
    })

    ipc.on('proxy_table.redraw', () => {
        win.onChangeProxyList()
    })
}


module.exports = table