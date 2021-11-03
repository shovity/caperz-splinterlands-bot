const { app, BrowserWindow, ipcMain: ipc } = require('electron')
const path = require('path')

const master = require('./master')
const settings = require('electron-settings')

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
    app.quit()
}

const loadSettingFile = async () => {
    const app_setting = await settings.get('app_setting')
    ipc.
    ipc.send('load_setting', app_setting)
}
const createWindow = () => {
    // Create the browser window.
    const mainWindow = new BrowserWindow({
        width: 1200,
        height: 600,
        icon: path.join(__dirname, 'assets/img/icon.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: false,
        },
    })

    // and load the index.html of the app.
    mainWindow.loadFile(path.join(__dirname, 'index.html'))

    loadSettingFile()

    // Open the DevTools.
    mainWindow.webContents.openDevTools()
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow)

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
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

ipc.on('worker.add', (event, data) => {
    master.add(data)
})

ipc.on('worker.remove_all', (event, arg) => {
    master.removeAll()
})

ipc.on('save_setting', async (event, data) => {
    const res = await settings.set('app_setting', data)
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
