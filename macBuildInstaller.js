const createDMG = require('electron-installer-dmg');

async function buildDMG() {
    try {
        await createDMG({
            appPath: './dist/SPS Caper Bot-darwin-x64/SPS Caper Bot.app',
            name: 'SPS Caper Bot',
            out: './dist',
            overwrite: true,
            debug: true,
            icon: './src/assets/img/icon.ico'
          });
          console.log('done')
    } catch (e) {
        console.error(e)
    }
}

buildDMG()