// All of the Node.js APIs are available in the preload process.
// It has the same sandbox as a Chrome extension.
const settings = require('electron-settings')
const electron = require('electron')

window.settings = settings
window.ipc = electron.ipcRenderer