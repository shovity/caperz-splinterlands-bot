ipc.on('run', (event, arg) => {
    console.log(arg)
})

ipc.send('run', 'sho')

window.btn_add.addEventListener('click', () => {
    ipc.send('worker.add')
})

window.btn_remove_all.addEventListener('click', () => {
    ipc.send('worker.remove_all')
})