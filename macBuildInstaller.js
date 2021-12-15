const createDMG = require('electron-installer-dmg');

async function buildDMG() {
    try {
        await createDMG({
            appPath: './dist/NFTauto Desktop-darwin-x64/NFTauto Desktop.app',
            name: 'NFTauto Desktop',
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