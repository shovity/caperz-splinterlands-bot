const { app, BrowserWindow, ipcMain: ipc } = require('electron')
const path = require('path')

const master = require('./master')
const settings = require('electron-settings')
const utils = require('./utils')
let win
// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
    app.quit()
}

const loadConfigData = async () => {
    const app_setting = await settings.get('app_setting')
    win.webContents.send('load_setting', app_setting)
    const account_list = await settings.get('account_list')
    win.webContents.send('load_account', account_list)
}
const createWindow = () => {
    // Create the browser window.
    win = new BrowserWindow({
        width: 1200,
        height: 600,
        icon: path.join(__dirname, 'assets/img/icon.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: false,
        },
    })

    // and load the index.html of the app

    win.loadFile(path.join(__dirname, 'index.html'))
    // Open the DevTools.
    win.webContents.openDevTools()

    ipc.on('run', (event, arg) => {
        console.log(arg)
    })

    win.webContents.on('did-finish-load', () => {
        loadConfigData()
        win.webContents.send('run', 'im main proc')
    })
}

const onChangeAccountList = async () => {
    const account_list = await settings.get('account_list')
    win.webContents.send('redraw', account_list)
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
        const account_list = await settings.get('account_list')
        const newList = account_list.map((account) => {
            return {
                ...account,
                status: 'STOPPED',
            }
        })
        await settings.set('account_list', newList)
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

ipc.on('save_setting', async (event, data) => {
    const res = await settings.set('app_setting', data)
})

ipc.on('add_account', async (event, data) => {
    let res
    const emailRegex = /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/
    try {
        if (emailRegex.test(data.username)) {
            res = await utils.loginEmail(data.username, data.password)
        } else {
            res = await utils.login(data.username, data.password)
        }
    } catch (error) {
        win.webContents.send('add_account_failed', {
            byEmail: emailRegex.test(data.username),
            player: data.username,
            email: data.username || '',
        })
        return
    }
    let list = await settings.get('account_list')
    let newList = list || []
    newList.push({
        username: res.name,
        email: res.email || '',
        power: res.collection_power,
        postingKey: res.posting_key,
        updatedAt: Date.now(),
        token: res.token,
        ecr: res.balances.find((b) => b.token == 'ECR').balance / 100,
        dec: res.balances.find((b) => b.token == 'DEC').balance,
        status: 'STOPPED',
    })
    await settings.set('account_list', newList)
    win.webContents.send('add_account_success', {
        byEmail: emailRegex.test(data.username),
        player: res.name,
        email: res.email || '',
    })
})

ipc.on('delete_account', async (event, data) => {
    let list = await settings.get('account_list')
    let newList = list.filter((account) => account.username != data && account.email != data)
    await settings.set('account_list', newList)
})

ipc.on('redraw', () => {
    onChangeAccountList()
})

ipc.on('start_bots', async (e) => {
    master.startWorkers()
})

ipc.on('stop_bots', async (e) => {
    master.stopWorkers()
})

master.change = async (name) => {
    switch (name) {
        case 'account_list':
            onChangeAccountList()
            break
    }
}

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
