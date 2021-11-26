const user = ({ win, ipc, settings }) => {

    ipc.on('setUser', async (event, data) => {
        await settings.setSync('user', data)
    })

    ipc.on('user.enter_app', async (event, data) => {
        await win.handleSplashScreen()
    })
}


module.exports = user