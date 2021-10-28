ori.use('event store emitter storage', () => {

    store.origin.watch()
    emitter.click()
    emitter.keyboard()

    const user = storage.user

    if (!user) {
        // location.href = './sign-in.html'
    }

    store.g_username = user?.userData?.username || 'Unknow'

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


    const tabs = [...document.querySelectorAll('[tab]')]
    const navs = [...document.querySelectorAll('.nav-item a')]

    event.listen('select_tab', (name) => {
        for (const nav of navs) {
            nav.removeClass('active')
        }

        const nav = document.querySelector(`.nav-item a[href="#${name}"]`)
        nav && nav.addClass('active')

        for (const tab of tabs) {
            tab.addClass('d-none')
        }

        const tab = document.querySelector(`[tab="${name}"]`)
        tab && tab.removeClass('d-none')

        if (name === 'login') {
            window.sidebar.addClass('d-none')
        } else {
            window.sidebar.removeClass('d-none')
        }
    })

    event.listen('logout', () => {
        storage.user = null
        location.href = './sign-in.html'
    })
})