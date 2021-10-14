// All of the Node.js APIs are available in the preload process.
// It has the same sandbox as a Chrome extension.

const path = require('path')
const { fork } = require('child_process')
const electron = require('electron')


window.ipc = electron.ipcRenderer

window.addEventListener('DOMContentLoaded', () => {
    //
})