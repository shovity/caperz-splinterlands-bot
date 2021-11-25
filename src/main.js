const { app, BrowserWindow, ipcMain: ipc, nativeTheme, globalShortcut } = require('electron')
const path = require('path')

const master = require('./master')
const settings = require('electron-settings')
const utils = require('./utils')

let isStarted = false
let win
// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
    app.quit()
}

const loadConfigData = async () => {
    let app_setting = await settings.getSync('app_setting')
    app_setting = app_setting || {
        ecr: 50,
        startQuestEcr: 60,
        botPerIp: 5,
        proxies: [{ ip: 'Default IP', count: 0, protocol: 'https', status: 'active' }],
    }
    await settings.setSync('app_setting', app_setting)
    master.stopECR = app_setting.ecr
    win.webContents.send('setting.load', app_setting)
    let account_list = await settings.getSync('account_list')
    account_list = account_list ? account_list.filter((e) => e) : []
    win.webContents.send('account.load', account_list)
    await settings.setSync('account_list', account_list)
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
}

const onChangeAccountList = async () => {
    const account_list = await settings.getSync('account_list')
    win.webContents.send('player_table.redraw', account_list)
}
const onChangeProxyList = async () => {
    const app_setting = await settings.getSync('app_setting')
    win.webContents.send('proxy_table.redraw', app_setting)
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow)

// app.whenReady().then(() => {
//     // Register a 'CommandOrControl+X' shortcut listener.
//     const ret = globalShortcut.register('CommandOrControl+R', () => {
//         console.log('CommandOrControl+R is pressed')
//     })

//     if (!ret) {
//       console.log('registration failed')
//     }
// })

// app.on('will-quit', () => {
//     globalShortcut.unregisterAll()
// })

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
        const account_list = await settings.getSync('account_list')
        const app_setting = await settings.getSync('app_setting')

        const newList = account_list.map((account) => {
            if (account.status === 'RUNNING') {
                account.status = 'PAUSED'
            } else {
                account.status = 'STOPPED'
            }
            return account
        })

        for (let i = 0; i < app_setting.proxies.length; i++) {
            app_setting.proxies[i].count = 0
        }

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

ipc.on('worker.add', async (event, data) => {
    master.add(data)
})

ipc.on('worker.remove_all', (event, arg) => {
    master.removeAll()
})

ipc.on('setting.save', async (event, data) => {
    master.stopECR = data.ecr
    const oldSetting = await settings.getSync('app_setting')
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

    const res = await settings.setSync('app_setting', newSetting)
    await master.enqAccounts()
})

ipc.on('account.add', async (event, data) => {
    let res
    const emailRegex = /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/
    try {
        if (emailRegex.test(data.username)) {
            res = await utils.loginEmail(data.username, data.password)
        } else {
            res = await utils.login(data.username, data.password)
        }
    } catch (error) {
        win.webContents.send('account.add_failed', {
            byEmail: emailRegex.test(data.username),
            player: data.username,
            email: data.username || '',
        })
        return
    }
    let list = await settings.getSync('account_list')
    let newList = list || []
    let ecr = res.balances.find((b) => b.token == 'ECR').balance

    if (ecr === null) {
        ecr = 10000
    }

    newList.push({
        username: res.name,
        email: res.email || '',
        power: res.collection_power,
        postingKey: res.posting_key,
        updatedAt: Date.now(),
        lastRewardTime: new Date(res.last_reward_time).getTime(),
        token: res.token,
        ecr: master.calculateECR(new Date(res.last_reward_time).getTime(), ecr / 100),
        dec: res.balances.find((b) => b.token == 'DEC') ? res.balances.find((b) => b.token == 'DEC').balance : null,
        status: 'NONE',
    })
    await settings.setSync('account_list', newList)
    win.webContents.send('account.add_success', {
        byEmail: emailRegex.test(data.username),
        player: res.name,
        email: res.email || '',
    })

    if (master.state === 'RUNNING') {
        const account = {
            username: res.name,
            email: res.email || '',
            power: res.collection_power,
            postingKey: res.posting_key,
            updatedAt: Date.now(),
            lastRewardTime: new Date(res.last_reward_time).getTime(),
            token: res.token,
            ecr: master.calculateECR(new Date(res.last_reward_time).getTime(), ecr / 100),
            dec: res.balances.find((b) => b.token == 'DEC').balance,
            status: 'PENDING',
        }

        const now = Date.now()

        master.priorityQueue.enqueue(account, master.calculatePriority(account, now))

        await master.dequeue()
    }
})

ipc.on('delete.account', async (event, data) => {
    let list = await settings.getSync('account_list')
    let newList = list.filter((account) => account.username != data && account.email != data)
    await settings.setSync('account_list', newList)
})

ipc.on('player_table.redraw', () => {
    onChangeAccountList()
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
    onChangeProxyList()
})

ipc.on('worker.start', async (e) => {
    master.startWorkers()
})

ipc.on('worker.stop', async (e) => {
    master.pauseWorkers()
})

ipc.on('account.start', async (event, account) => {
    const account_list = await settings.getSync('account_list')

    const accountIndex = account_list.findIndex((a) => a.username == account)
    master.priorityQueue.enqueue(
        account_list[accountIndex],
        master.calculatePriority(account_list[accountIndex], accountIndex)
    )

    await settings.setSync(`account_list[${accountIndex}].status`, 'PENDING')

    onChangeAccountList()

    await master.dequeue()
})

ipc.on('account.stop', async (event, account) => {
    const account_list = await settings.getSync('account_list')
    const accountIndex = account_list.findIndex((a) => a.username === account)
    if (account_list[accountIndex].status === 'DONE' || account_list[accountIndex].status === 'PENDING') {
        await settings.setSync(`account_list[${accountIndex}].status`, 'PAUSED')
        onChangeAccountList()
        return
    }
    await master.remove(account)
})

master.change = async (name, param) => {
    const now = Date.now()
    switch (name) {
        case 'account_list':
            await settings.setSync(
                'account_list',
                param.account_list.map((a) => {
                    return {
                        ...a,
                        updatedAt: now,
                    }
                })
            )
            onChangeAccountList()
            break
        case 'app_setting':
            await settings.setSync('app_setting', param.app_setting)
            const appSetting = await settings.getSync('app_setting', param.app_setting)
            count = appSetting.proxies[0].count
            onChangeProxyList()
            break
        case 'master_state':
            win.webContents.send('modify', { state: param.state })
            break
        case 'log':
            logToDevtool(param)
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
        onChangeAccountList()
    }
}

const handleSplashScreen = async () => {
    const user = await settings.getSync('user')

    if (user?.token) {
        master.splashStatus = 'on'
        win.webContents.send('splash.on')

        await master.updateOpeningPlayerInfo()
    
        win.webContents.send('splash.off')   
    }
}

ipc.on('setUser', async (event, data) => {
    await settings.setSync('user', data)
})
ipc.on('user.enter_app', async (event, data) => {
    await handleSplashScreen()
})
// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
const logToDevtool = (data) => {
    win.webContents.send('log', data)
}
