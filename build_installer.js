import { MSICreator } from 'electron-wix-msi'
const path = require('path')
// Step 1: Instantiate the MSICreator
const APP_DIR = path.resolve(__dirname, './dist/NFTauto Desktop-win32-x64')
const OUT_DIR = path.resolve(__dirname, './installer')
const msiCreator = new MSICreator({
    appDirectory: APP_DIR,
    description: 'SPS NFTAuto Desktop',
    exe: 'SPSNFTAuto',
    name: 'SPS NFTAuto Desktop',
    manufacturer: 'Caper Team',
    version: '1.0.0',
    outputDirectory: OUT_DIR,
    ui: {
        chooseDirectory: true,
    },
})

// Step 2: Create a .wxs template file
const supportBinaries = await msiCreator.create()

// 🆕 Step 2a: optionally sign support binaries if you
// sign you binaries as part of of your packaging script
supportBinaries.forEach(async (binary) => {
    // Binaries are the new stub executable and optionally
    // the Squirrel auto updater.
    await signFile(binary)
})

// Step 3: Compile the template to a .msi file
await msiCreator.compile()
