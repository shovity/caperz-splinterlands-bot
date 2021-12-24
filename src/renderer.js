ori.use('event store emitter storage', () => {
    store.origin.watch()
    emitter.click()
    emitter.keyboard()
    const log = false
    var playerMonitoringTable
    var proxyMonitoringTable
    let totalDec = {}

    const user = storage.user

    const statusMapping = (status) => {
        switch (status ? status.toUpperCase() : 'NONE') {
            case 'PENDING':
                return "<span class='status_light_blue'>Pending</span>"
            case 'TRANSFERRING':
                return "<span class='status_light_blue'>Transferring</span>"
            case 'RUNNING':
                return "<span class='status_blue'>Running</span>"
            case 'PAUSED':
                return "<span class='status_light_yellow'>Paused</span>"
            case 'DONE':
                return "<span class='status_green'>Done</span>"
            case 'WAITING_ECR':
                return "<span class='status_light_yellow'>Waiting ECR</span>"
            case 'COLLECTING':
                return "<span class='status_light_yellow'>Claiming SSR</span>"
            case 'PROXY_ERROR':
                return "<span class='status_red'>Proxy error</span>"
            case 'DELEGATING_ERROR':
                return "<span class='status_red'>Delegating error</span>"
            case 'MULTI_REQUEST_ERROR':
                return "<span class='status_red'>Multi request</span>"
            case 'ERROR':
                return "<span class='status_red'>System error</span>"
            case 'STOPPED':
                return "<span class='status_red'>Stopped</span>"
            case 'RENTING':
                return "<span class='status_yellow'>Renting</span>"
            case 'NOT IN WHITELIST':
                return "<span class='status_black'>Not in whitelist</span>"
            case 'DELEGATING': 
                return "<span class='status_yellow'>Delegating</span>"
            default:
                return "<span class='status_gray'>None</span>"
        }
    }
    const matchStatusMapping = (status) => {
        switch (status ? status.toUpperCase() : 'NONE') {
            case 'MATCHING':
                return "<span class='status_light_yellow'>Matching</span>"
            case 'MATCHED':
                return "<span class='status_yellow'>Matched</span>"
            case 'SUBMITTING':
                return "<span class='status_blue'>Submitting</span>"
            default:
                return "<span class='status_gray'>None</span>"
        }
    }

    if (!user) {
        location.href = './sign-in.html'
    } else {
        ipc.send('user.enter_app')
    }

    ipc.on('splash.on', () => {
        log && console.log('on')
        splashScreen.removeClass('d-none')
        app.addClass('d-none')
    })

    ipc.on('splash.off', () => {
        log && console.log('off')
        splashScreen.addClass('d-none')
        app.removeClass('d-none')
    })

    store.g_username = user?.userData?.username || 'Unknow'

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
        enterKeypress(e, () => master_key.focus())
    })
    master_key.addEventListener('keypress', (e) => {
        enterKeypress(e, () => {
            username.focus()
            event.emit('account.add')
        })
    })
    add_proxy_input.addEventListener('keypress', (e) => {
        enterKeypress(e, () => event.emit('proxy.add'))
    })

    event.listen('select_tab', (name) => {
        if (name == 'monitoring') {
            ipc.send('player_table.redraw')
            ipc.send('proxy_table.redraw')
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
        ipc.send('setUser', null)
        location.href = './sign-in.html'
    })

    event.listen('proxy.remove', (proxy) => {
        let rowLength = proxy_table.rows.length
        for (i = 1; i < rowLength; i++) {
            let cells = proxy_table.rows.item(i).cells
            if (cells[1].innerHTML == proxy) {
                proxy_table.deleteRow(i)
                return
            }
        }
    })
    event.listen('account.start', (account) => {
        ipc.send('account.start', account)
    })
    event.listen('account.stop', (account) => {
        ipc.send('account.stop', account)
    })
    event.listen('modePlayToggle', () => {
        ipc.send('setting.save', {
            modePlay: mode_play.checked,
        })
    })
    event.listen('modeRentalToggle', () => {
        ipc.send('setting.save', {
            modeRental: mode_rental.checked,
        })
    })
    event.listen('modeDelegateToggle', () => {
        ipc.send('setting.save', {
            modeDelegate: mode_delegate.checked,
        })
    })
    event.listen('modeTransferToggle', () => {
        ipc.send('setting.save', {
            modeTransfer: mode_transfer.checked,
        })
    })
    event.listen('modeClaimQuestToggle', () => {
        ipc.send('setting.save', {
            modeClaimQuest: mode_claim_quest.checked,
        })
    })
    event.listen('modeCollectSeasonRewardToggle', () => {
        ipc.send('setting.save', {
            modeCollectSeasonReward: mode_collect_season_reward.checked,
        })
    })

    event.listen('setSeason', () => {
        showNotice('Saved')
        ipc.send('setting.save', {
            season: season.value,
        })
    })

    event.listen('proxy.add', () => {
        let vl = add_proxy_input.value
        if (vl) {
            if (vl.includes('https://')) {
                vl = vl.replace('https://', '')
            }
            if (vl.includes('http://')) {
                vl = vl.replace('http://', '')
            }
            if (vl.includes('socks4://')) {
                vl = vl.replace('socks4://', '')
            }
            if (vl.includes('socks5://')) {
                vl = vl.replace('socks5://', '')
            }
            const reg =
                /^[^:]+\:[^:]+\@(([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\:\d{4,5}$/
            // /(([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\:\d{4,5}$/
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
            let row = proxy_table.insertRow(2)
            let cell1 = document.createElement('th')
            cell1.setAttribute('scope', 'row')
            cell1.setAttribute('class', 'count')
            row.appendChild(cell1)
            let cell2 = row.insertCell(1)
            cell2.innerHTML = vl
            let cell3 = row.insertCell(2)
            cell3.innerHTML = protocol.value
            let cell4 = document.createElement('td')
            cell4.setAttribute('class', 'x_remove')
            cell4.setAttribute('click-emit', `proxy.remove:${vl}`)
            cell4.innerHTML = '<p>x</p>'
            row.appendChild(cell4)
            add_proxy_input.value = ''
        }
    })

    event.listen('setting.save', () => {
        let proxyTable = document.getElementById('proxy_table')
        let useDproxy = document.getElementById('use_default_proxy')
        let proxyArray = []
        let rowLength = proxyTable.rows.length
        for (i = 1; i < rowLength; i++) {
            let cells = proxyTable.rows.item(i).cells
            proxyArray.push({
                ip: cells[1].innerHTML,
                protocol: cells[2].innerHTML,
            })
        }
        ipc.send('setting.save', {
            ecr: ecr.value,
            startQuestEcr: start_quest_ecr.value,
            startEcr: start_ecr.value,
            botPerIp: bot_per_ip.value,
            proxies: proxyArray,
            useDefaultProxy: useDproxy.checked,
            dlgMinPower: adc_min_power.value,
            expectedPower: acr_expected_power.value,
            maxDec: acr_max_dec.value,
            transferKeepDec: transfer_keep_dec.value,
            transferStartDec: transfer_start_dec.value,
            rentalDay: acr_rental_day.value,
            majorAccount: {
                player: ma_username.value,
                postingKey: ma_posting_key.value,
                masterKey: ma_master_key.value,
            },
        })
        showNotice('saved')
    })

    ipc.on('setting.load', (event, data) => {
        log && console.log(data)
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
        ecr.value = data.ecr || 0
        start_quest_ecr.value = data.startQuestEcr || 100
        start_ecr.value = data.startEcr || 80
        use_default_proxy.checked = data.useDefaultProxy
        bot_per_ip.value = data.botPerIp
        adc_min_power.value = data.dlgMinPower
        acr_expected_power.value = data.expectedPower
        acr_max_dec.value = data.maxDec
        season.value = data.season || 0
        mode_play.checked = data.modePlay
        mode_rental.checked = data.modeRental
        mode_delegate.checked = data.modeDelegate
        mode_transfer.checked = data.modeTransfer
        mode_claim_quest.checked = data.modeClaimQuest
        mode_collect_season_reward.checked = data.modeCollectSeasonReward
        transfer_keep_dec.value = data.transferKeepDec
        transfer_start_dec.value = data.transferStartDec
        acr_rental_day.value = data.rentalDay
        ma_username.value = data.majorAccount?.player || ''
        ma_posting_key.value = data.majorAccount?.postingKey || ''
        ma_master_key.value = data.majorAccount?.masterKey || ''
        data.proxies.forEach((proxy) => {
            let row = proxy_table.insertRow(1)
            let cell1 = document.createElement('th')
            cell1.setAttribute('scope', 'row')
            cell1.setAttribute('class', 'count')
            row.appendChild(cell1)
            let cell2 = row.insertCell(1)
            cell2.innerHTML = proxy.ip
            let cell3 = row.insertCell(2)
            cell3.innerHTML = proxy.protocol
            let cell4 = document.createElement('td')
            if (proxy.ip != 'Default IP') {
                cell4.setAttribute('class', 'x_remove')
                cell4.setAttribute('click-emit', `proxy.remove:${proxy.ip}`)
                cell4.innerHTML = '<p>x</p>'
            }
            row.appendChild(cell4)
        })
    })

    event.listen('account.add', () => {
        if (username.value && password.value && master_key.value) {
            const name = username.value.trim().toLowerCase()
            password.value = password.value.trim()
            master_key.value = master_key.value.trim()
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
            ipc.send('account.add', {
                username: name,
                password: password.value,
                master_key: master_key.value,
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
            cell4.setAttribute('click-emit', `account.remove:${name}`)
            cell4.innerHTML = '<p>x</p>'
            row.appendChild(cell4)
            showNotice(name + ' is added to verifying!')
            // username.value = ''
            // password.value = ''
        }
    })

    ipc.on('account.add_success', (event, data) => {
        let row = document.getElementById(data.byEmail ? data.email : data.player)
        row.removeClass('verify_pending')
        if (data.byEmail) {
            row.children[1].innerHTML = data.player
        } else {
            row.children[2].innerHTML = data.email || '--'
        }
    })
    ipc.on('account.add_failed', (event, data) => {
        let row = document.getElementById(data.byEmail ? data.email : data.player)
        row.removeClass('verify_pending')
        row.addClass('verify_failed')
        showNotice('Cannot verify ' + data.byEmail ? data.email : data.player + '.Please try again!')
    })

    event.listen('account.remove', (account) => {
        let row = document.getElementById(account)
        ipc.send('account.delete', account)
        row.remove()
    })

    event.listen('account.start_all', () => {
        startButton.addClass('d-none')
        stopButton.removeClass('d-none')
        ipc.send('worker.start')
    })

    event.listen('account.stop_all', () => {
        startButton.removeClass('d-none')
        stopButton.addClass('d-none')
        ipc.send('worker.stop')
    })

    ipc.on('account.load', (event, data) => {
        if (!data) {
            return
        }
        totalDec = {}
        const tableData = data.map((d) => {
            totalDec[d.username] = isNaN(d.dec) ? 0 : d.dec
            return {
                id: 'player_' + d.username,
                username: d.username,
                ecr: d.ecr || 0,
                dec: d.dec.toFixed(3) || 0,
                power: d.power || 0,
                rating: d.rating || 0,
                lastUpdate: new Date().toLocaleTimeString(),
                quest: d.questClaimed
                    ? '---'
                    : typeof d.quest != 'undefined' && typeof d.maxQuest != 'undefined'
                    ? `${d.quest}/${d.maxQuest}`
                    : '--',
                status: statusMapping(d.status),
                stt: { status: d.status, username: d.username },
                matchStatus: matchStatusMapping(d.status != 'RUNNING' ? 'none' : d.matchStatus),
            }
        })
        let total = 0
        for (const [key, value] of Object.entries(totalDec)) {
            total += value
        }
        $('#total_dec').html(total.toFixed(2))
        playerMonitoringTable = $('#player_monitoring_table').DataTable({
            data: tableData,
            responsive: true,
            rowId: 'id',
            columns: [
                { data: 'username' },
                { data: 'ecr' },
                { data: 'dec' },
                { data: 'power' },
                { data: 'rating' },
                { data: 'quest' },
                { data: 'lastUpdate' },
                { data: 'status' },
                { data: 'matchStatus' },
                { data: 'stt' },
            ],

            columnDefs: [
                { orderable: false, targets: 0 },
                { width: '60px', targets: 1 },
                { width: '60px', targets: 2 },
                { width: '60px', targets: 3 },
                { width: '60px', targets: 4 },
                { width: '60px', targets: 5 },
                { width: '100px', targets: 6 },
                { width: '90px', targets: 7 },
                { width: '110px', targets: 8 },
                {
                    orderable: false,
                    width: '40px',
                    targets: 9,
                    render: function (data, type, row) {
                        if (
                            ['RUNNING', 'PENDING', 'DONE', 'RENTING', 'COLLECTING', 'TRANSFERRING'].includes(
                                data.status
                            )
                        ) {
                            return `<button class="btn btn-primary active" click-emit="account.stop:${data.username}">
                            <img src="./assets/img/pause.svg" width="12" height="12" style="background-color: unset;" alt="Play  free icon" title="Play free icon">
                        </button>`
                        } else {
                            return `<button class="btn btn-primary active" click-emit="account.start:${data.username}">
                            <img src="./assets/img/play.svg" width="12" height="12" style="background-color: unset;" alt="Play  free icon" title="Play free icon">
                        </button>`
                        }
                    },
                },
            ],
            order: [],
        })
        $("th.sorting[aria-controls='player_monitoring_table']").on('click', function () {
            const dataTable = playerMonitoringTable.rows().data().toArray()
            const newList = dataTable.map((d) => d.username)
            ipc.send('player_table.reorder', newList)
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
            cell4.setAttribute('click-emit', `account.remove:${account.username}`)
            cell4.innerHTML = '<p>x</p>'
            row.appendChild(cell4)
        })
    })

    ipc.on('player_table.redraw', (event, data) => {
        log && console.log('table rerender')
        totalDec = {}
        const tableData = data.map((d) => {
            totalDec[d.username] = isNaN(d.dec) ? 0 : d.dec
            return {
                id: 'player_' + d.username,
                username: d.username,
                ecr: d.ecr || 0,
                dec: d.dec.toFixed(3) || 0,
                power: d.power || 0,
                rating: d.rating || 0,
                quest: d.questClaimed
                    ? '---'
                    : typeof d.quest != 'undefined' && typeof d.maxQuest != 'undefined'
                    ? `${d.quest}/${d.maxQuest}`
                    : '--',
                lastUpdate: new Date().toLocaleTimeString(),
                status: statusMapping(d.status),
                stt: { status: d.status, username: d.username },
                matchStatus: matchStatusMapping(d.status != 'RUNNING' ? 'none' : d.matchStatus),
            }
        })
        playerMonitoringTable.clear().rows.add(tableData).draw()
        let total = 0
        for (const [key, value] of Object.entries(totalDec)) {
            total += value
        }
        $('#total_dec').html(total.toFixed(2))
    })

    ipc.on('player_table.player.redraw', (event, d) => {
        log && console.log('player' + d.username + 'rerender')
        log && console.log(d)
        totalDec[d.username] = isNaN(d.dec) ? 0 : d.dec
        const newData = {
            id: 'player_' + d.username,
            username: d.username,
            ecr: d.ecr || 0,
            dec: d.dec.toFixed(3) || 0,
            power: d.power || 0,
            rating: d.rating || 0,
            quest: d.questClaimed
                ? '---'
                : typeof d.quest != 'undefined' && typeof d.maxQuest != 'undefined'
                ? `${d.quest}/${d.maxQuest}`
                : '--',
            lastUpdate: new Date().toLocaleTimeString(),
            status: statusMapping(d.status),
            stt: { status: d.status, username: d.username },
            matchStatus: matchStatusMapping(d.status != 'RUNNING' ? 'none' : d.matchStatus),
        }
        playerMonitoringTable.row(`#player_${d.username}`).data(newData)
        // if ($(`#player_monitoring_table tr#${d.username}`)[0]) {
        //     playerMonitoringTable
        //         .row($(`#player_monitoring_table tr#${d.username}`)[0])
        //         .data(newData)
        //         .draw(false)
        // }

        let total = 0
        for (const [key, value] of Object.entries(totalDec)) {
            total += value
        }
        $('#total_dec').html(total.toFixed(2))
    })

    ipc.on('proxy_table.redraw', (event, data) => {
        const tableData = data.proxies.map((d) => {
            return {
                ip: d.ip,
                botUsage: d.count + '/' + data.botPerIp,
            }
        })

        proxyMonitoringTable.clear().rows.add(tableData).draw(false)
    })
    ipc.on('modify', (event, data) => {
        if (data.state === 'RUNNING') {
            startButton.addClass('d-none')
            stopButton.removeClass('d-none')
        } else {
            stopButton.addClass('d-none')
            startButton.removeClass('d-none')
        }
    })
    ipc.on('log', (event, data) => {
        console.log(data)
    })
    ipc.on('process', (event, data) => {
        var width = barPercent.innerHTML * 1
        var id = setInterval(frame, 10)
        function frame() {
            if (width >= data) {
                clearInterval(id)
            } else {
                width++
                myBar.style.width = width + '%'
                barPercent.innerHTML = width * 1
            }
        }
    })
})
