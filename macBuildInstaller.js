const createDMG = require('electron-installer-dmg');

async function buildDMG() {
    try {
        await createDMG({
            appPath: './dist/NFTauto Desktop ver2.2.1-darwin-x64/NFTauto Desktop ver2.2.1.app',
            name: 'NFTauto Desktop ver2.2.1',
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