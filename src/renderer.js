ori.use('event store emitter storage', () => {
    store.origin.watch()
    emitter.click()
    emitter.keyboard()
    let playerMonitoringTable
    let proxyMonitoringTable

    const user = storage.user

    const statusMapping = (status) => {
        switch (status.toUpperCase()) {
            case 'PENDING':
                return "<span class='status_pending'>Pending</span>"
            case 'RUNNING':
                return "<span class='status_running'>Running</span>"
            case 'PAUSED':
                return "<span class='status_paused'>Paused</span>"
            case 'DONE':
                return "<span class='status_done'>Done</span>"
            case 'STOPPED':
                return "<span class='status_stopped'>Stopped</span>"
            default:
                return "<span class='status_none'>None</span>"
        }
    }

    if (!user) {
        location.href = './sign-in.html'
    }

    store.g_username = user?.userData?.username || 'Unknow'

    // window.btn_add.addEventListener('click', () => {
    //     // add and run wotker instance
    //     ipc.send('worker.add', {
    //         worker: {
    //             name: 'splinterlands',
    //             // other worker param
    //         },
    //         account: 'lanlanpham',
    //         username: 'lanlanpham',
    //         password: '5Jhr6ChzQs4nwbhrtgc8NyLYNgtTYcoSabjdUuFTvTdcZyLFEh2',
    //     })
    // })

    // window.btn_remove_all.addEventListener('click', () => {
    //     ipc.send('worker.remove_all')
    // })

    const tabs = [...document.querySelectorAll('[tab]')]
    const navs = [...document.querySelectorAll('.nav-item a')]

    const showNotice = (text) => {
        notice.innerHTML = `<span>${text}</span>`
        notice.setAttribute('class', 'show')
        setTimeout(() => notice.removeClass('show'), 1500)
    }

    const enterKeypress = (e, f) => {
        if (e.keyCode === 13) {
            f()
        }
    }

    username.addEventListener('keypress', (e) => {
        enterKeypress(e, () => password.focus())
    })
    password.addEventListener('keypress', (e) => {
        enterKeypress(e, () => event.emit('add_account'))
    })
    add_proxy_input.addEventListener('keypress', (e) => {
        enterKeypress(e, () => event.emit('add_proxy'))
    })

    event.listen('select_tab', (name) => {
        if (name == 'monitoring') {
            ipc.send('redraw_player_table')
            ipc.send('redraw_proxy_table')
        }
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

    event.listen('remove_proxy', (proxy) => {
        let rowLength = proxy_table.rows.length
        for (i = 1; i < rowLength; i++) {
            let cells = proxy_table.rows.item(i).cells
            if (cells[1].innerHTML == proxy) {
                proxy_table.deleteRow(i)
                return
            }
        }
    })

    event.listen('add_proxy', () => {
        const vl = add_proxy_input.value
        if (vl) {
            const reg =
                /^.+\:.+\@(([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\:\d{4,5}$/
            if (!reg.test(vl)) {
                showNotice('Invalid proxy format')
                return
            }
            let rowLength = proxy_table.rows.length
            for (i = 1; i < rowLength; i++) {
                let cells = proxy_table.rows.item(i).cells
                if (vl == cells[1].innerHTML) {
                    showNotice('Proxy already exists!')
                    return
                }
            }
            let row = proxy_table.insertRow(1)
            let cell1 = document.createElement('th')
            cell1.setAttribute('scope', 'row')
            cell1.setAttribute('class', 'count')
            row.appendChild(cell1)
            let cell2 = row.insertCell(1)
            cell2.innerHTML = vl
            let cell3 = document.createElement('td')
            cell3.setAttribute('class', 'x_remove')
            cell3.setAttribute('click-emit', `remove_proxy:${vl}`)
            cell3.innerHTML = '<p>x</p>'
            row.appendChild(cell3)
            add_proxy_input.value = ''
        }
    })

    event.listen('save_setting', () => {
        let ecr = document.getElementById('ecr')
        let startQuestEcr = document.getElementById('start_quest_ecr')
        let botPerIp = document.getElementById('bot_per_ip')
        let proxyTable = document.getElementById('proxy_table')
        let proxyArray = []
        let rowLength = proxyTable.rows.length
        for (i = 1; i < rowLength; i++) {
            let cells = proxyTable.rows.item(i).cells
            proxyArray.push({
                ip: cells[1].innerHTML,
            })
        }
        ipc.send('save_setting', {
            ecr: ecr.value,
            startQuestEcr: startQuestEcr.value,
            botPerIp: botPerIp.value,
            proxies: proxyArray,
        })
        showNotice('saved')
    })

    ipc.on('load_setting', (event, data) => {
        console.log(data)
        if (!data) {
            return
        }
        const tableData = data.proxies.map((d) => {
            return {
                ip: d.ip,
                botUsage: d.count + '/' + data.botPerIp,
            }
        })
        proxyMonitoringTable = $('#proxy_monitoring_table').DataTable({
            data: tableData,
            columns: [{ data: 'ip' }, { data: 'botUsage' }],
        })
        ecr.value = data.ecr
        start_quest_ecr.value = data.startQuestEcr
        bot_per_ip.value = data.botPerIp
        data.proxies.forEach((proxy) => {
            let row = proxy_table.insertRow(1)
            let cell1 = document.createElement('th')
            cell1.setAttribute('scope', 'row')
            cell1.setAttribute('class', 'count')
            row.appendChild(cell1)
            let cell2 = row.insertCell(1)
            cell2.innerHTML = proxy.ip
            let cell3 = document.createElement('td')
            if (proxy.ip != 'Default IP') {
                cell3.setAttribute('class', 'x_remove')
                cell3.setAttribute('click-emit', `remove_proxy:${proxy.ip}`)
                cell3.innerHTML = '<p>x</p>'
            }
            row.appendChild(cell3)
        })
    })

    event.listen('add_account', () => {
        if (username.value && password.value) {
            const name = username.value.trim().toLowerCase()
            let rowLength = account_table.rows.length
            for (i = 1; i < rowLength; i++) {
                let cells = account_table.rows.item(i).cells
                if (name == cells[1].innerHTML) {
                    add_player_button.removeClass('d-none')
                    add_player_loading.addClass('d-none')
                    showNotice('Account already exists!')
                    return
                }
            }
            ipc.send('add_account', {
                username: name,
                password: password.value,
            })
            const emailRegex = /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/
            let row = account_table.insertRow(1)
            row.setAttribute('id', name)
            row.addClass('verify_pending')
            let cell1 = document.createElement('th')
            cell1.setAttribute('scope', 'row')
            cell1.setAttribute('class', 'count')
            row.appendChild(cell1)
            if (emailRegex.test(name)) {
                let cell2 = row.insertCell(1)
                cell2.innerHTML = ''
                let cell3 = row.insertCell(2)
                cell3.innerHTML = name
            } else {
                let cell2 = row.insertCell(1)
                cell2.innerHTML = name
                let cell3 = row.insertCell(2)
                cell3.innerHTML = ''
            }
            let cell4 = document.createElement('td')
            cell4.setAttribute('class', 'x_remove')
            cell4.setAttribute('click-emit', `remove_account:${name}`)
            cell4.innerHTML = '<p>x</p>'
            row.appendChild(cell4)
            showNotice(name + ' is added to verifying!')
            username.value = ''
            password.value = ''
        }
    })

    ipc.on('add_account_success', (event, data) => {
        let row = document.getElementById(data.byEmail ? data.email : data.player)
        row.removeClass('verify_pending')
        if (data.byEmail) {
            row.children[1].innerHTML = data.player
        } else {
            row.children[2].innerHTML = data.email || '--'
        }
    })
    ipc.on('add_account_failed', (event, data) => {
        let row = document.getElementById(data.byEmail ? data.email : data.player)
        row.removeClass('verify_pending')
        row.addClass('verify_failed')
        showNotice('Cannot verify ' + data.byEmail ? data.email : data.player + '.Please try again!')
    })

    event.listen('remove_account', (account) => {
        let row = document.getElementById(account)
        ipc.send('delete_account', account)
        row.remove()
    })

    event.listen('start', () => {
        startButton.addClass('d-none')
        stopButton.removeClass('d-none')
        ipc.send('worker.start')
    })

    event.listen('stop', () => {
        startButton.removeClass('d-none')
        stopButton.addClass('d-none')
        ipc.send('worker.stop')
    })

    ipc.on('load_account', (event, data) => {
        if (!data) {
            return
        }
        console.log(data)
        const tableData = data.map((d) => {
            return {
                username: d.username,
                ecr: d.ecr || '--',
                dec: d.dec || '--',
                power: d.power || '--',
                status: statusMapping(d.status),
            }
        })
        playerMonitoringTable = $('#player_monitoring_table').DataTable({
            data: tableData,
            responsive: true,
            columns: [{ data: 'username' }, { data: 'ecr' }, { data: 'dec' }, { data: 'power' }, { data: 'status' }],
            columnDefs: [{ orderable: false, targets: 0 }],
            columnDefs: [{ width: '110px', targets: 4 }],
            fixedColumns: true,
            order: [[1, 'desc']],
        })
        data.forEach((account) => {
            let row = account_table.insertRow(1)
            row.setAttribute('id', account.username)
            let cell1 = document.createElement('th')
            cell1.setAttribute('scope', 'row')
            cell1.setAttribute('class', 'count')
            row.appendChild(cell1)
            let cell2 = row.insertCell(1)
            cell2.innerHTML = account.username
            let cell3 = row.insertCell(2)
            cell3.innerHTML = account.email || '--'
            let cell4 = document.createElement('td')
            cell4.setAttribute('class', 'x_remove')
            cell4.setAttribute('click-emit', `remove_account:${account.username}`)
            cell4.innerHTML = '<p>x</p>'
            row.appendChild(cell4)
        })
    })

    ipc.on('redraw_player_table', (event, data) => {
        console.log('redraw_player_table')
        console.log(data)
        const tableData = data.map((d) => {
            return {
                username: d.username,
                ecr: d.ecr,
                dec: d.dec,
                power: d.power || '--',
                status: statusMapping(d.status),
            }
        })
        playerMonitoringTable.clear().draw()
        playerMonitoringTable.rows.add(tableData) // Add new data
        playerMonitoringTable.columns.adjust().draw()
    })
    ipc.on('redraw_proxy_table', (event, data) => {
        console.log('redraw_proxy_table')
        console.log(data)
        const tableData = data.proxies.map((d) => {
            return {
                ip: d.ip,
                botUsage: d.count + '/' + data.botPerIp,
            }
        })
        proxyMonitoringTable.clear().draw()
        proxyMonitoringTable.rows.add(tableData) // Add new data
        proxyMonitoringTable.columns.adjust().draw()
    })
    ipc.on('modify', (event, data) => {
        if (data.state === 'RUNNING') {
            startButton.addClass('d-none')
            stopButton.removeClass('d-none')
        } else {
            console.log('paused')
            stopButton.addClass('d-none')
            startButton.removeClass('d-none')
        }
    })
})
