ori.use('event store emitter storage', () => {
    store.origin.watch()
    emitter.click()
    emitter.keyboard()

    const user = storage.user

    if (!user) {
        // location.href = './sign-in.html'
    }

    store.g_username = user?.userData?.username || 'Unknow'

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

    event.listen('add_proxy', () => {
        let table = document.getElementById('proxy_table')
        let newProxy = document.getElementById('add_proxy_input')
        if (newProxy.value) {
            let row = table.insertRow(1)
            let cell1 = document.createElement('th')
            cell1.setAttribute('scope', 'row')
            cell1.setAttribute('class', 'count')
            row.appendChild(cell1)
            let cell2 = row.insertCell(1)
            cell2.innerHTML = newProxy.value
            let cell3 = document.createElement('td')
            cell3.setAttribute('class', 'x_remove')
            cell3.setAttribute('click-emit', `remove_proxy:${newProxy.value}`)
            cell3.innerHTML = '<p>x</p>'
            row.appendChild(cell3)
            newProxy.value = ''
        }
    })

    event.listen('save_setting', () => {
        let ecr1 = document.getElementById('ecr')
        let ecr2 = document.getElementById('start-quest-ecr')
        let botPerIp = document.getElementById('bot_per_ip')
        let proxyTable = document.getElementById('proxy_table')
        let proxyArray = []
        let rowLength = proxyTable.rows.length
        for (i = 1; i < rowLength; i++) {
            let cells = proxyTable.rows.item(i).cells
            proxyArray.push(cells[1].innerHTML)
        }
        ipc.send('save_setting', {
            ecr1: ecr1.value,
            ecr2: ecr2.value,
            botPerIp: botPerIp.value,
            proxies: proxyArray
        })
    })
    ipc.on('load_setting',(event, data)=> {
        console.log(data)
    })
})
