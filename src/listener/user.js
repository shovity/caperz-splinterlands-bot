const user = ({ win, ipc, settings }) => {

    ipc.on('setUser', async (event, data) => {
        settings.data.user = data
        settings.setSync('user', data)
    })

    ipc.on('user.enter_app', async (event, data) => {
        await win.handleSplashScreen()
    })
}


module.exports = user