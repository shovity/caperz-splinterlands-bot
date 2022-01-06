const { app, BrowserWindow, ipcMain: ipc, nativeTheme, globalShortcut } = require('electron')
const path = require('path')

const master = require('./master')
const utils = require('./utils')
const listener = require('./listener')
const settings = require('./settings')
const accountService = require('./service/account')

settings.init()
let win
// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
    app.quit()
}

const loadConfigData = async () => {
    let app_setting = settings.data.app_setting
    app_setting = app_setting || {
        ecr: 50,
        startQuestEcr: 60,
        botPerIp: 5,
        proxies: [{ ip: 'Default IP', count: 0, protocol: 'https', status: 'active' }],
        useDefaultProxy: true,
    }
    settings.data.app_setting = app_setting
    master.stopECR = app_setting.ecr
    win.webContents.send('setting.load', app_setting)
    let account_list = settings.data.account_list
    account_list = account_list ? account_list.filter((e) => e) : []
    win.webContents.send('account.load', account_list)
    settings.data.account_list = account_list
}
const createWindow = () => {
    // Create the browser window.
    win = new BrowserWindow({
        autoHideMenuBar: true,
        show: false,
        icon: path.join(__dirname, 'assets/img/icon.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: false,
        },
    })

    // and load the index.html of the app

    win.loadFile(path.join(__dirname, 'index.html'))
    win.maximize()
    win.show()

    ipc.on('run', (event, arg) => {
        console.log(arg)
    })

    win.webContents.on('did-finish-load', async () => {
        loadConfigData()

        win.webContents.send('run', 'im main proc')
        win.webContents.send('modify', { state: master.state })
    })

    win.onChangeAccountList = async () => {
        const account_list = settings.data.account_list
        win.webContents.send('player_table.redraw', account_list)
    }

    win.onChangeProxyList = async () => {
        const app_setting = settings.data.app_setting
        win.webContents.send('proxy_table.redraw', app_setting)
    }

    win.handleSplashScreen = async () => {
        const user = settings.data.user

        if (user?.token) {
            master.splashStatus = 'on'
            win.webContents.send('splash.on')

            await master.updateOpeningPlayerInfo()

            win.webContents.send('splash.off')
        }
    }

    win.onChangeAccount = async (account) => {
        win.webContents.send('player_table.player.redraw', account)
    }

    listener({ win, ipc, settings })
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow)

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
// app.on('window-all-closed', () => {
//     if (process.platform !== 'darwin') {
//         app.quit()
//     }
// })

let asyncOperationDone = false

app.on('before-quit', async (e) => {
    if (!asyncOperationDone) {
        e.preventDefault()
        const account_list = settings.data.account_list
        const app_setting = settings.data.app_setting

        const newList = account_list.map((account) => {
            accountService.beforePausedOrStopped(account)
            if (account.status === 'RUNNING') {
                account.status = 'PAUSED'
            } else if (account.status !== 'WAITING_ECR') {
                account.status = 'STOPPED'
            }
            return account
        })

        for (let i = 0; i < app_setting.proxies?.length; i++) {
            app_setting.proxies[i].count = 0
        }

        settings.data.account_list = newList
        settings.data.app_setting = app_setting

        await settings.setSync('account_list', newList)
        await settings.setSync('app_setting', app_setting)

        asyncOperationDone = true
        app.quit()
    }
})

app.on('activate', () => {
    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
    }
})

master.change = async (name, param) => {
    const now = Date.now()
    switch (name) {
        case 'account_list':
            settings.data.account_list = param.account_list.map((a) => {
                return {
                    ...a,
                    updatedAt: now,
                }
            })

            win.onChangeAccountList()
            break
        case 'app_setting':
            settings.data.app_setting = param.app_setting
            win.onChangeProxyList()
            break
        case 'master_state':
            win.webContents.send('modify', { state: param.state })
            break
        case 'log':
            logToDevtool(param)
            break
        case 'major_account':
            win.webContents.send('major_acc.update', param)
            break
        case 'process_loading':
            if (master.splashStatus === 'on') {
                win.webContents.send('process', param.processPercent)
            }

            if (param.splashStatus === 'off') {
                await master.delay(500)

                win.webContents.send('splash.off')
            }
            break
    }
}

master.changePath = async (name, array) => {
    const now = Date.now()

    await utils.updatePathArraySetting({
        name,
        array,
        settings,
        updatedAt: now,
    })

    if (name === 'account_list') {
        array.forEach((a) => {
            if (!a.username) {
                return
            }
            const account = settings.data.account_list.find((e) => e.username === a.username)
            win.onChangeAccount(account)
        })
    }
}

master.init()

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
const logToDevtool = (data) => {
    win.webContents.send('log', data)
}
