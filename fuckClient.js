var fs = require('fs')
var path = require('path')
var recursive = require('recursive-readdir')
var javaScriptObfuscator = require('javascript-obfuscator')

recursive('dist/NFTauto Desktop-win32-x64/resources/app/src/service/splinterlands', function (err, files) {
    files.forEach((file) => {
        if (path.extname(file) === '.js') {
            let contents = fs.readFileSync(file, 'utf8')
            console.log('Protecting ' + file)

            let ret = javaScriptObfuscator.obfuscate(contents, {
                compact: true,
                controlFlowFlattening: false,
                deadCodeInjection: false,
                debugProtection: false,
                debugProtectionInterval: false,
                disableConsoleOutput: false,
                identifierNamesGenerator: 'hexadecimal',
                log: false,
                numbersToExpressions: false,
                renameGlobals: false,
                selfDefending: false,
                simplify: true,
                splitStrings: false,
                stringArray: true,
                stringArrayEncoding: [],
                stringArrayIndexShift: true,
                stringArrayRotate: true,
                stringArrayShuffle: true,
                stringArrayWrappersCount: 1,
                stringArrayWrappersChainedCalls: true,
                stringArrayWrappersParametersMaxCount: 2,
                stringArrayWrappersType: 'variable',
                stringArrayThreshold: 0.75,
                unicodeEscapeSequence: false
            })
            fs.writeFileSync(file, ret.toString())
        }
    })
})
