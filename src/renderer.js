ori.use('event store emitter storage', () => {
    store.origin.watch()
    emitter.click()
    emitter.keyboard()
    const log = false
    var playerMonitoringTable
    var proxyMonitoringTable
    let totalDec = {}
    let maRc = 0
    var cardData
    var requireCard = []

    const user = storage.user
    const delay = (time) => {
        return new Promise((resolve) => {
            setTimeout(() => resolve(), time)
        })
    }
    const formatNumber = (x) => {
        return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    }
    const logError = (data) => {
        console.log(data)
        if (data.type == 'info') {
            $('#log').append(`<p><span class='info'>INFO/ </span>${data?.message?.message || data.message}</p>`)
        }
        if (data.type == 'error') {
            $('#log').append(`<p><span class='error'>ERROR/ </span>${data?.message?.message || data.message}</p>`)
        }
    }
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
            case 'UNDELEGATING':
                return "<span class='status_yellow'>Undelegating</span>"
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

    store.g_username = user?.userData?.username || 'Unknown'

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
    event.listen('open_url', (url) => {
        ipc.send('open_url', url)
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
    event.listen('modeTransferDECToggle', () => {
        ipc.send('setting.save', {
            modeTransferDEC: mode_transfer_dec.checked,
        })
    })
    event.listen('modeTransferPWToggle', () => {
        ipc.send('setting.save', {
            modeTransferPW: mode_transfer_pw.checked,
        })
    })
    event.listen('modeRankupToggle', () => {
        ipc.send('setting.save', {
            modeRankup: mode_rankup.checked,
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
            startPw: start_pw.value,
            botPerIp: bot_per_ip.value,
            proxies: proxyArray,
            useDefaultProxy: useDproxy.checked,
            dlgMinPower: adc_min_power.value,
            expectedPower: acr_expected_power.value,
            maxDec: acr_max_dec.value,
            transferKeepDec: transfer_keep_dec.value,
            transferStartDec: transfer_start_dec.value,
            transferStartPW: transfer_start_pw.value,
            rentalDay: acr_rental_day.value,
            majorAccount: {
                player: ma_username.value,
                postingKey: ma_posting_key.value,
                stoprc: ma_rc_config.value,
                rc: maRc,
            },
            requireCard: requireCard,
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
        start_pw.value = data.startPw || 0
        use_default_proxy.checked = data.useDefaultProxy
        bot_per_ip.value = data.botPerIp
        adc_min_power.value = data.dlgMinPower
        acr_expected_power.value = data.expectedPower
        acr_max_dec.value = data.maxDec
        season.value = data.season || 0
        mode_play.checked = data.modePlay
        mode_rental.checked = data.modeRental
        mode_delegate.checked = data.modeDelegate
        mode_transfer_dec.checked = data.modeTransferDEC
        mode_transfer_pw.checked = data.modeTransferPW
        mode_rankup.checked = data.modeRankup
        mode_claim_quest.checked = data.modeClaimQuest
        mode_collect_season_reward.checked = data.modeCollectSeasonReward
        transfer_keep_dec.value = data.transferKeepDec
        transfer_start_dec.value = data.transferStartDec
        transfer_start_pw.value = data.transferStartPW
        acr_rental_day.value = data.rentalDay
        ma_username.value = data.majorAccount?.player || ''
        ma_posting_key.value = data.majorAccount?.postingKey || ''
        ma_rc_config.value = data.majorAccount?.stoprc || 5
        require_card.value = ''
        $.getJSON('cardImgSrc.json', function (dt) {
            if (data.requireCard?.length) {
                requireCard = data.requireCard
                requireCard.forEach((rc) => {
                    let rcard = dt.find((c) => c.id == rc.id)
                    let html = `<div class="row mb-3" id="${rc.id}">
            <div class="col-md-2" style="padding: 0;padding-left: 12px;">
                            <div class="card" click-emit="require_card.add:${rc.id}">
                                <img class="card-image" style="width: 100%" src="${rcard.url}"/>
                            </div>
                            </div>
                            <div class="col-md-8 require-card-dec">
                                <p style="font-size: 12px;margin: 0px">${capitalizeFirstLetter(
                                    rc.name.toLowerCase()
                                )}</p>
                                <div class="d-flex">
                                <p class="max-dec">Max DEC: </p>
                                    <input class="form-control max-dec-value">
                                </div>
                            </div>
                            <div class="col-md-1 d-flex justify-content-center align-items-center">
                                <button type="button" class="btn-close" click-emit="require_card.remove:${
                                    rc.id
                                }"></button>
                            </div>
                        </div>`
                    document.getElementById('require_card_list').innerHTML += html
                })
                requireCard.forEach((rc) => {
                    if (require_card.value) {
                        require_card.value += `, `
                        require_card.value += rc.name
                    } else {
                        require_card.value = rc.name
                    }
                    const card = document.querySelector(`#${rc.id}`)
                    card.querySelector(`.max-dec-value`).value = rc.maxDec
                })
            }
        })
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
                if (name == cells[1].innerHTML || name == cells[2].innerHTML) {
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
        const node = row.childNodes[3]
        node.setAttribute('click-emit', `account.remove:${data.byEmail ? data.email : data.player}`)
        node.innerHTML = '<p>x</p>'
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
        const node = row.childNodes[3]
        node.setAttribute(
            'click-emit',
            `account.retry:${data.data.username}%${data.data.password}%${data.data.master_key}`
        )
        node.innerHTML = '<p>Retry</p>'
        showNotice('Cannot verify ' + data.byEmail ? data.email : data.player + '.Please try again!')
    })

    event.listen('account.retry', (dataString) => {
        const dataSplited = dataString.split('%')
        ipc.send('account.add', {
            username: dataSplited[0],
            password: dataSplited[1],
            master_key: dataSplited[2],
        })
        let row = document.getElementById(dataSplited[0])
        row.removeClass('verify_failed')
        row.addClass('verify_pending')
    })
    event.listen('account.remove', (account) => {
        let row = document.getElementById(account)
        ipc.send('account.delete', account)
        row.remove()
    })
    event.listen('account.remove_all', () => {
        ipc.send('account.delete_all')
        const accountTable = document.querySelector('#account_table tbody')
        accountTable.innerHTML = `<tr>
        <th scope="col"><storng>#</storng></th>
        <th scope="col"><strong>Player</strong></th>
        <th scope="col"><strong>Email</strong></th>
        <th></th>
    </tr>`
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
                dec: d.dec ? d.dec?.toFixed(3) : 0,
                credits: d.credits ? Math.floor(d.credits) : 0,
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
        $('#total_dec').html(formatNumber(total.toFixed(2)))
        playerMonitoringTable = $('#player_monitoring_table').DataTable({
            data: tableData,
            responsive: true,
            rowId: 'id',
            columns: [
                { data: 'username' },
                { data: 'ecr' },
                { data: 'dec' },
                { data: 'credits' },
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
                { width: '60px', targets: 6 },
                { width: '100px', targets: 7 },
                { width: '90px', targets: 8 },
                { width: '110px', targets: 9 },
                {
                    orderable: false,
                    width: '40px',
                    targets: 10,
                    render: function (data, type, row) {
                        if (
                            [
                                'RUNNING',
                                'PENDING',
                                'DONE',
                                'RENTING',
                                'COLLECTING',
                                'TRANSFERRING',
                                'DELEGATING',
                                'UNDELEGATING',
                            ].includes(data.status.toUpperCase())
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
                dec: d.dec ? d.dec?.toFixed(3) : 0,
                credits: d.credits ? Math.floor(d.credits) : 0,
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
        $('#total_dec').html(formatNumber(total.toFixed(2)))
    })

    ipc.on('player_table.player.redraw', (event, d) => {
        log && console.log('player' + d.username + 'rerender')
        log && console.log(d)
        totalDec[d.username] = isNaN(d.dec) ? 0 : d.dec
        const newData = {
            id: 'player_' + d.username,
            username: d.username,
            ecr: d.ecr || 0,
            dec: d.dec ? d.dec?.toFixed(3) : 0,
            credits: d.credits ? Math.floor(d.credits) : 0,
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
        $('#total_dec').html(formatNumber(total.toFixed(2)))
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

    ipc.on('remaining_match.update', (event, data) => {
        $('#remaining_match').html(formatNumber(data))
        if (data < 1000) {
            $('#remaining_match').removeClass('green-lable')
            $('#remaining_match').removeClass('yellow-lable')
            $('#remaining_match').addClass('red-lable')
            return
        }
        if (data < 3000) {
            $('#remaining_match').removeClass('green-lable')
            $('#remaining_match').removeClass('red-lable')
            $('#remaining_match').addClass('yellow-lable')
            return
        }
        $('#remaining_match').removeClass('red-lable')
        $('#remaining_match').removeClass('yellow-lable')
        $('#remaining_match').addClass('green-lable')
    })
    ipc.on('free_match.update', (event, data) => {
        $('#free_match').html(formatNumber(data))
        if (data < 50) {
            $('#free_match').removeClass('green-lable')
            $('#free_match').removeClass('yellow-lable')
            $('#free_match').addClass('red-lable')
            return
        }
        if (data < 200) {
            $('#free_match').removeClass('green-lable')
            $('#free_match').removeClass('red-lable')
            $('#free_match').addClass('yellow-lable')
            return
        }
        $('#free_match').removeClass('red-lable')
        $('#free_match').removeClass('yellow-lable')
        $('#free_match').addClass('green-lable')
    })

    ipc.on('log', (event, data) => {
        logError(data)
    })
    ipc.on('major_acc.update', (event, data) => {
        if (!data) {
            return
        }
        const rc = +data.rc
        const availablePower = +data.availablePower
        maRc = rc.toFixed(2)
        ma_rc.innerText = rc.toFixed(2) + '%'
        if (rc < 10) {
            $('#ma_rc').removeClass('green-lable')
            $('#ma_rc').removeClass('yellow-lable')
            $('#ma_rc').addClass('red-lable')
        } else {
            if (rc < 30) {
                $('#ma_rc').removeClass('green-lable')
                $('#ma_rc').removeClass('red-lable')
                $('#ma_rc').addClass('yellow-lable')
            } else {
                $('#ma_rc').removeClass('red-lable')
                $('#ma_rc').removeClass('yellow-lable')
                $('#ma_rc').addClass('green-lable')
            }
        }
        ma_available_power.innerText = formatNumber(availablePower)
        let html1 = ''
        let html2 = ''
        data.delegatedCards.slice(0, 14).forEach((card, index) => {
            if (index < 7) {
                html1 += `<div class="mb-1">
                    <label>Delegated ${card.totalPower} power (${card.quantity} card(s)) to ${card.delegatedTo}</label>
                </div>`
            } else {
                html2 += `<div class="mb-1">
                    <label>Delegated ${card.totalPower} power (${card.quantity} card(s)) to ${card.delegatedTo}</label>
                </div>`
            }
        })
        if (html1 == '' && html2 == '') {
            $('#card_delegated_list').html('<p>No card delegation</p>')
            return
        }
        $('#card_delegated_list').html(
            '<div class="w-50">' + html1 + '</div>' + '<div class="w-50">' + html2 + '</div>'
        )
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

    $.getJSON('cardImgSrc.json', function (dt) {
        let html = ''
        cardData = dt
        cardData.forEach((card) => {
            let cid = card.url.split('/')
            let id = cid.at(-1).split('.')[0]
            html += `<div class="col-md-1 mb-3">
                <div class="card" click-emit="require_card.add:${id}">
                    <img class="card-image" style="width: 100%" src="${card.url}"/>
                </div>
                <p style="font-size: 12px">${capitalizeFirstLetter(card.name.toLowerCase())}</p>
            </div>`
        })

        document.getElementById('card_list').innerHTML = html
    })

    function capitalizeFirstLetter(str) {
        var splitStr = str.toLowerCase().split(' ')
        for (var i = 0; i < splitStr.length; i++) {
            // You do not need to check if i is larger than splitStr length, as your for does that for you
            // Assign it back to the array
            splitStr[i] = splitStr[i].charAt(0).toUpperCase() + splitStr[i].substring(1)
        }
        // Directly return the joined string
        return splitStr.join(' ')
    }

    event.listen('require_card.add', (id) => {
        let card = cardData.find((c) => c.id == id)
        if (requireCard.length && requireCard.findIndex((c) => c.id == id) > -1) {
            return
        }
        const rc = requireCard
        requireCard = []
        rc.forEach((c) => {
            const cardSelector = document.querySelector(`#${c.id}`)
            const maxDec = cardSelector.querySelector(`.max-dec-value`).value
            requireCard.push({
                id: c.id,
                maxDec: maxDec,
                name: capitalizeFirstLetter(c.name.toLowerCase()),
            })
        })
        requireCard.push({
            id: id,
            maxDec: 0,
            name: capitalizeFirstLetter(card.name.toLowerCase()),
        })
        let html = `<div class="row mb-3" id="${id}">
        <div class="col-md-2" style="padding: 0;padding-left: 12px;">
                        <div class="card" click-emit="require_card.add:${id}">
                            <img class="card-image" style="width: 100%" src="${card.url}"/>
                        </div>
                        </div>
                        <div class="col-md-8 require-card-dec">
                            <p style="font-size: 12px;margin: 0px">${capitalizeFirstLetter(card.name.toLowerCase())}</p>
                            <div class="d-flex">
                            <p class="max-dec">Max DEC: </p>
                                <input class="form-control max-dec-value">
                            </div>
                        </div>
                        <div class="col-md-1 d-flex justify-content-center align-items-center">
                            <button type="button" class="btn-close" click-emit="require_card.remove:${id}"></button>
                        </div>
                    </div>`
        document.getElementById('require_card_list').innerHTML += html
        requireCard.forEach((c) => {
            const card = document.querySelector(`#${c.id}`)
            card.querySelector(`.max-dec-value`).value = c.maxDec
        })
    })
    event.listen('require_card.remove', (id) => {
        const index = requireCard.findIndex((c) => c.id == id)
        if (index > -1) {
            requireCard.splice(index, 1)
            $(`#${id}`).remove()
        }
    })
    event.listen('require_card.save', () => {
        require_card.value = ''
        let res = []
        requireCard.forEach((c) => {
            if (require_card.value) {
                require_card.value += `, `
                require_card.value += c.name
            } else {
                require_card.value = c.name
            }
            const card = document.querySelector(`#${c.id}`)
            const maxDec = card.querySelector(`.max-dec-value`).value
            res.push({
                id: c.id,
                maxDec: maxDec,
                name: c.name,
            })
        })
        requireCard = res
    })
    event.listen('require_card.search', () => {
        const value = require_card_search.value
        let html = ''
        cardData.forEach((card) => {
            if (card.name.toLowerCase().includes(value)) {
                html += `<div class="col-md-1 mb-3">
                <div class="card" click-emit="require_card.add:${card.id}">
                    <img class="card-image" style="width: 100%" src="${card.url}"/>
                </div>
                <p style="font-size: 12px">${capitalizeFirstLetter(card.name.toLowerCase())}</p>
            </div>`
            }
        })
        document.getElementById('card_list').innerHTML = html
    })
    event.listen('foil', (foil) => {
        let html = ''
        if (foil == 'c') {
            $('.foil-classic').addClass('foil-selected')
            $('.foil-gold').removeClass('foil-selected')
        } else {
            $('.foil-gold').addClass('foil-selected')
            $('.foil-classic').removeClass('foil-selected')
        }
        cardData.forEach((card) => {
            let cid = card.url.split('/')
            let id = cid.at(-1).split('.')[0]
            const f = id.split('-').at(-1)
            if (f == foil) {
                html += `<div class="col-md-1 mb-3">
                <div class="card" click-emit="require_card.add:${id}">
                    <img class="card-image" style="width: 100%" src="${card.url}"/>
                </div>
                <p style="font-size: 12px">${capitalizeFirstLetter(card.name.toLowerCase())}</p>
            </div>`
            }
        })

        document.getElementById('card_list').innerHTML = html
    })
    event.listen('account.add_file', () => {
        //Reference the FileUpload element.
        var fileUpload = document.getElementById('fileUpload')

        //Validate whether File is valid Excel file.
        var regex = /^([a-zA-Z0-9\s_\\.\-:])+(.xls|.xlsx)$/
        if (regex.test(fileUpload.value.toLowerCase())) {
            if (typeof FileReader != 'undefined') {
                var reader = new FileReader()

                //For Browsers other than IE.
                if (reader.readAsBinaryString) {
                    reader.onload = function (e) {
                        GetTableFromExcel(e.target.result)
                    }
                    reader.readAsBinaryString(fileUpload.files[0])
                } else {
                    //For IE Browser.
                    reader.onload = function (e) {
                        var data = ''
                        var bytes = new Uint8Array(e.target.result)
                        for (var i = 0; i < bytes.byteLength; i++) {
                            data += String.fromCharCode(bytes[i])
                        }
                        GetTableFromExcel(data)
                    }
                    reader.readAsArrayBuffer(fileUpload.files[0])
                }
            } else {
                alert('This browser does not support HTML5.')
            }
        } else {
            alert('Please upload a valid Excel file.')
        }
    })
    async function GetTableFromExcel(data) {
        //Read the Excel File data in binary
        var workbook = XLSX.read(data, {
            type: 'binary',
        })

        //get the name of First Sheet.
        var Sheet = workbook.SheetNames[0]

        //Read all rows from First Sheet into an JSON array.
        var excelRows = XLSX.utils.sheet_to_row_object_array(workbook.Sheets[Sheet])
        console.log(excelRows)
        for (let i = 0; i < excelRows.length; i++) {
            let existed = false
            const name = excelRows[i]['Player/Email']
            const password = excelRows[i]['Posting Key/Password']
            const master_key = excelRows[i]['Master Key']
            let rowLength = account_table.rows.length
            for (x = 1; x < rowLength; x++) {
                let cells = account_table.rows.item(x).cells
                if (name == cells[1].innerHTML || name == cells[2].innerHTML) {
                    existed = true
                }
            }
            if (existed) {
                continue
            }
            ipc.send('account.add', {
                username: name,
                password: password,
                master_key: master_key,
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
            await delay(3000)
        }
    }
})
