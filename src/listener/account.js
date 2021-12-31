const master = require('../master')
const utils = require('../utils')
const accountService = require('../service/account')

const account = ({ win, ipc, settings }) => {

    ipc.on('account.delete', async (event, data) => {
        let list = settings.data.account_list
        let newList = list.filter((account) => account.username != data && account.email != data)
        
        master.change('account_list', { account_list: newList})
    })
    
    ipc.on('account.start', async (event, account) => {
        accountService.beforeEnqueue(account)

        const account_list = settings.data.account_list
        const accountIndex = account_list.findIndex((a) => a.username == account)

        if (account_list[accountIndex].status === 'WAITING_ECR') {
            await master.changePath('account_list', [{ ...account_list[accountIndex] }])
            return
        }

        master.priorityQueue.enqueue(
            account_list[accountIndex],
            master.calculatePriority(account_list[accountIndex], accountIndex)
        )
        
        settings.data.account_list[accountIndex].status = 'PENDING'
        account_list[accountIndex].status = 'PENDING'

        win.onChangeAccount(account_list[accountIndex])

        await master.dequeue()
    })

    ipc.on('account.stop', async (event, account) => {
        const account_list = settings.data.account_list
        const accountIndex = account_list.findIndex((a) => a.username === account)

        accountService.beforePausedOrStopped(account_list[accountIndex])

        if (account_list[accountIndex].status === 'DONE' || account_list[accountIndex].status === 'DELEGATING') {
            settings.data.account_list[accountIndex].status = 'PAUSED'

            account_list[accountIndex].status = 'PAUSED'

            win.onChangeAccount(account_list[accountIndex])

            return
        }

        await master.remove(account)
    })

    ipc.on('account.add', async (event, data) => {
        let res
        const emailRegex = /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/
        try {
            if (emailRegex.test(data.username)) {
                res = await utils.loginEmail(data.username, data.password)
            } else {
                res = await utils.login(data.username, data.password)
            }
        } catch (error) {
            win.webContents.send('account.add_failed', {
                byEmail: emailRegex.test(data.username),
                player: data.username,
                email: data.username || '',
            })
            return
        }
        let list = settings.data.account_list
        let newList = list || []
        let ecr = res.balances.find((b) => b.token == 'ECR').balance
    
        if (ecr === null) {
            ecr = 10000
        }
    
        newList.push({
            username: res.name,
            email: res.email || '',
            power: res.collection_power,
            postingKey: res.posting_key,
            masterKey: data.master_key,
            updatedAt: Date.now(),
            lastRewardTime: new Date(res.last_reward_time).getTime(),
            token: res.token,
            ecr: master.calculateECR(new Date(res.last_reward_time).getTime(), ecr / 100),
            dec: res.balances.find((b) => b.token == 'DEC') ? res.balances.find((b) => b.token == 'DEC').balance : null,
            status: 'NONE',
        })
        settings.data.account_list = newList
        win.webContents.send('account.add_success', {
            byEmail: emailRegex.test(data.username),
            player: res.name,
            email: res.email || '',
        })
    
        if (master.state === 'RUNNING') {
            const account = {
                username: res.name,
                email: res.email || '',
                power: res.collection_power,
                postingKey: res.posting_key,
                masterKey: data.master_key,
                updatedAt: Date.now(),
                lastRewardTime: new Date(res.last_reward_time).getTime(),
                token: res.token,
                ecr: master.calculateECR(new Date(res.last_reward_time).getTime(), ecr / 100),
                dec: res.balances.find((b) => b.token == 'DEC').balance,
                status: 'PENDING',
            }
    
            const now = Date.now()
    
            master.priorityQueue.enqueue(account, master.calculatePriority(account, now))
    
            await master.dequeue()
        }
    })
}


module.exports = account