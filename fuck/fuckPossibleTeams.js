var fs = require('fs')
var path = require('path')
var recursive = require('recursive-readdir')
var javaScriptObfuscator = require('javascript-obfuscator')

recursive('../dist/NFTauto Desktop-win32-x64/resources/app/src/worker/splinterlands',['!possibleTeams.js'], function (err, files) {
    files.forEach((file) => {
        if (path.extname(file) === '.js') {
            let contents = fs.readFileSync(file, 'utf8')
            console.log('Protecting ' + file)

            let ret = javaScriptObfuscator.obfuscate(contents, {
                compact: true,
                    controlFlowFlattening: true,
                    controlFlowFlatteningThreshold: 1,
                    deadCodeInjection: true,
                    deadCodeInjectionThreshold: 1,
                    debugProtection: true,
                    debugProtectionInterval: true,
                    disableConsoleOutput: true,
                    identifierNamesGenerator: 'hexadecimal',
                    log: false,
                    numbersToExpressions: true,
                    renameGlobals: false,
                    selfDefending: true,
                    simplify: true,
                    splitStrings: true,
                    splitStringsChunkLength: 5,
                    stringArray: true,
                    stringArrayEncoding: ['rc4'],
                    stringArrayIndexShift: true,
                    stringArrayRotate: true,
                    stringArrayShuffle: true,
                    stringArrayWrappersCount: 5,
                    stringArrayWrappersChainedCalls: true,    
                    stringArrayWrappersParametersMaxCount: 5,
                    stringArrayWrappersType: 'function',
                    stringArrayThreshold: 1,
                    transformObjectKeys: true,
                    unicodeEscapeSequence: false
            })
            fs.writeFileSync(file, ret.toString())
        }
    })
})
