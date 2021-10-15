// All of the Node.js APIs are available in the preload process.
// It has the same sandbox as a Chrome extension.

const path = require('path')
const electron = require('electron')
const storage = require('electron-json-storage')

storage.setDataPath(`${process.cwd()}/storage`)

window.ipc = electron.ipcRenderer
window.storage = storage


window.addEventListener('DOMContentLoaded', () => {
    //
})