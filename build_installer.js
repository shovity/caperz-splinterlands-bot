const { MSICreator } = require('electron-wix-msi')
const path = require('path')
// Step 1: Instantiate the MSICreator
const APP_DIR = path.resolve(__dirname, './dist/SPS Caper Bot-win32-x64')
const OUT_DIR = path.resolve(__dirname, './installer')
const msiCreator = new MSICreator({
    appDirectory: APP_DIR,
    description: 'SPS Caper Bot',
    exe: 'SPS Caper Bot',
    name: 'SPS Caper Bot',
    manufacturer: 'Caper Team',
    version: '2.3.12',
    outputDirectory: OUT_DIR,
    ui: {
        chooseDirectory: true,
    },
})

// Step 2: Create a .wxs template file
msiCreator.create().then(function () {
    msiCreator.compile()
})
