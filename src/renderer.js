ori.use('storage', () => {
    const user = storage.user

    if (!user) {
        // location.href = './sign-in.html'
    }

    ipc.on('run', (event, arg) => {
        console.log(arg)
    })
    
    ipc.send('run', 'sho')
    
    window.btn_add.addEventListener('click', () => {

        // add and run wotker instance
        ipc.send('worker.add', {
            worker: {
                name: 'splinterlands',
                // other worker param
            },
            account: 'lanlanpham',
            username: 'lanlanpham',
            password: '5Jhr6ChzQs4nwbhrtgc8NyLYNgtTYcoSabjdUuFTvTdcZyLFEh2',
        })
    })
    
    window.btn_remove_all.addEventListener('click', () => {
        ipc.send('worker.remove_all')
    })
    
    window.btn_logout.addEventListener('click', () => {
        storage.user = null
        location.href = './sign-in.html'
    })
})