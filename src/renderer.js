ipc.on('run', (event, arg) => {
    console.log(arg)
})

ipc.send('run', 'sho')