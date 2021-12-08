var steem = require('steem')
const eosjs_ecc = require('eosjs-ecc')
const axios = require('axios').default
const qs = require('qs')

const utils = {}

const splinterHosts = [
    'https://steemmonsters.com/',
    'https://api2.splinterlands.com/'
]

const sendRequest = async (url, params, method = 'get') => {
    let host = 'https://api2.splinterlands.com/'

    if (url === 'players/balances') {
        host = splinterHosts[Math.floor(Math.random() * 2)]
    }

    try {
        let objectAxios = {
            method: method,
            url: host + url,
            proxy: false,
            // httpsAgent: new HttpsProxyAgent(
            //   `http://${this.proxy.login}:${this.proxy.pass}@${this.proxy.ip}:${this.proxy.port}`
            // ),
            timeout: 15000,
            headers: {
                authority: 'api2.splinterlands.com',
                method: method.toUpperCase(),
                path: url,
                scheme: 'https',
                accept: method === 'post' ? '*/*' : 'application/json, text/javascript, */*; q=0.01',
                'accept-encoding': 'gzip, deflate, br',
                'accept-language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
                'content-type': method === 'post' ? 'application/x-www-form-urlencoded' : '',
                origin: 'https://splinterlands.com',
                referer: 'https://splinterlands.com',
                'sec-ch-ua': '" Not A;Brand";v="99", "Chromium";v="90", "Google Chrome";v="90"',
                'sec-ch-ua-mobile': '?0',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-origin',
                'user-agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.93 Safari/537.36',
            },
        }

        if (method === 'get') {
            params.v = new Date().getTime()
            objectAxios.params = params
        } else {
            objectAxios.data = qs.stringify(params)
        }

        let res = await axios(objectAxios)

        return res.data
    } catch (e) {
        console.log(e)
        return null
    }
}
const generatePassword = (length, rng) => {
    if (!rng) rng = Math.random
    var charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
        retVal = ''
    for (var i = 0, n = charset.length; i < length; ++i) {
        retVal += charset.charAt(Math.floor(rng() * n))
    }
    return retVal
}

utils.login = async (username, posting_key, re) => {
    const browserId = 'bid_' + generatePassword(20)
    const sessionId = 'sid_' + generatePassword(20)

    let params = {
        name: username?.toLowerCase(),
        ref: '',
        browser_id: browserId,
        session_id: sessionId,
        ts: Date.now(),
    }

    steem.auth.wifToPublic(posting_key)
    params.sig = eosjs_ecc.sign(username + params.ts, posting_key)
    const result = await sendRequest('players/login', params)

    return {
        ...result,
        posting_key
    }
}

utils.auth = async (username, token) => {
    // players/authenticate
    const params = {
        username,
        token,
    }

    return await sendRequest('players/authenticate', params)
}

utils.loginEmail = async (email, password) => {
    email = email.toLowerCase()
    let params = {
        email: email,
    }

    let password_key = steem.auth.getPrivateKeys(email, password).owner

    params.ts = Date.now()
    params.sig = eosjs_ecc.sign((email + params.ts).toString(), password_key)

    // send to api login through email
    const result = await sendRequest('players/login_email', params)
    if (!result?.username) {
        throw new Error('Login by email failed!')
    }
    const user = await utils.login(result.username, result.posting_key)
    const resAuth = await utils.auth(user.name, user.token)

    if (!resAuth?.success) {
        throw new Error('Login failed!')
    }

    return user
}

utils.statusMapping = (status) => {
    switch (status) {
        case 'PENDING':
            return "<span class='status_pending'>Pending</span>"
        case 'PAUSED':
            return "<span class='status_paused'>Paused</span>"
        case 'STOPPED':
            return "<span class='status_stopped'>Stopped</span>"
        case 'DONE':
            return "<span class='status_done'>Done</span>"
        default:
            return "<span class='status_none'>None</span>"
    }
}

utils.getBalances = async (username) => {
    const params =  {
        username,
    }

    return await sendRequest('players/balances', params)
}

utils.getDetails = async (username) => {
    const params = {
        name: username,
    }

    return await sendRequest('players/details', params)
}

utils.updatePathArraySetting = async ({ array, name, settings, updatedAt }) => {
    for (let i = 0; i < array.length; i++) {
        if (name === 'account_list') {
            const accountIndex = settings.data[name].findIndex(a => a.username === array[i].username)

            for (let key in array[i]) {
                settings.data.account_list[accountIndex][key] = array[i][key]
            }
        
            settings.data.account_list[accountIndex].updatedAt = updatedAt
        }
    }
}


module.exports = utils
