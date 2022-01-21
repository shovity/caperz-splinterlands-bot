var steem = require('steem')
const eosjs_ecc = require('eosjs-ecc')
const qs = require('qs')
const requester = require('./service/requester')
const cardsDetail = require('../src/worker/splinterlands/data/cardsDetails.json')
const gameSettings = require('../src/worker/splinterlands/data/settings.json')
const utils = {}

const splinterHosts = ['https://steemmonsters.com/', 'https://api2.splinterlands.com/']

const sendRequestProxy = async (url, params, method = 'get', proxy, settings) => {
    if (!proxy) {
        const proxies = settings.data.app_setting.proxies
        const proxyIndex = Math.floor(Math.random() * (proxies.length - 1))

        if (app_setting.proxies[proxyIndex].ip === 'Default IP') {
            proxy = null
        } else {
            const [auth, address] = app_setting.proxies[proxyIndex].ip.split('@')

            if (auth && address) {
                const [account, password] = auth.split(':')
                const [host, port] = address.split(':')

                proxy = {
                    account,
                    password,
                    host,
                    port,
                }

                proxy.protocol = app_setting.proxies[proxyIndex].protocol || 'https://'
            } else {
                const [host, port] = account_list[accountIndex].ip.split(':')
                proxy = { host, port }
                proxy.protocol = app_setting.proxies[proxyIndex].protocol || 'https://'
            }
        }
    }

    sendRequest(url, param, method, proxy)
}

const sendRequest = async (url, params, method = 'get', proxy) => {
    let host = 'https://api2.splinterlands.com/'

    if (url === 'players/balances') {
        host = splinterHosts[Math.floor(Math.random() * 2)]
    }

    try {
        let option = {
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
        }
        if (proxy) {
            option.proxy = {
                url: `${proxy.host}:${proxy.port}`,
                protocol: `${proxy.protocol}`,
            }
            if (proxy.account) {
                option.proxy.url = `${proxy.account}:${proxy.password}@${proxy.host}:${proxy.port}`
            }
            // objectAxios.httpsAgent = new HttpsProxyAgent(
            //   `${this.proxy}`
            // )
        }

        let res = await requester[method](host + url, params, option)
        return res
    } catch (err) {
        console.error('utils ', url, err.status || err.code, err.statusText || '')
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
        posting_key,
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
            return "<span class='status_light_blue'>Pending</span>"
        case 'PAUSED':
            return "<span class='status_yellow'>Paused</span>"
        case 'STOPPED':
            return "<span class='status_red'>Stopped</span>"
        case 'DONE':
            return "<span class='status_green'>Done</span>"
        default:
            return "<span class='status_gray'>None</span>"
    }
}

utils.getBalances = async (username, proxy) => {
    const params = {
        username,
    }

    const method = 'get'

    return await sendRequest('players/balances', params, method, proxy)
}

utils.getDetails = async (username, proxy) => {
    const params = {
        name: username,
    }

    const method = 'get'

    return await sendRequest('players/details', params, method, proxy)
}

utils.getCollection = async (username, proxy) => {
    const res = await sendRequest(`cards/collection/${username}`, {}, 'get', proxy)
    return res ? res.cards : null
}
utils.getQuestDetails = async (username, proxy) => {
    const params = {
        username: username,
    }

    const method = 'get'

    return await sendRequest('players/quests', params, method, proxy)
}

utils.updatePathArraySetting = async ({ array, name, settings, updatedAt }) => {
    for (let i = 0; i < array.length; i++) {
        if (name === 'account_list') {
            const accountIndex = settings.data[name].findIndex((a) => a.username === array[i].username)

            for (let key in array[i]) {
                settings.data.account_list[accountIndex][key] = array[i][key]
            }

            settings.data.account_list[accountIndex].updatedAt = updatedAt
        }
    }
}

utils.calculateCP = (c) => {
    const settings = gameSettings
    function getMaxXp(details, edition, gold) {
        let rarity = details.rarity
        let tier = details.tier
        if (edition == 4 || tier >= 4) {
            let rates = gold ? settings.combine_rates_gold[rarity - 1] : settings.combine_rates[rarity - 1]
            return rates[rates.length - 1]
        } else return settings.xp_levels[rarity - 1][settings.xp_levels[rarity - 1].length - 1]
    }
    const card = c.xp > 1 ? { ...c, alpha_xp: 0 } : { ...c, alpha_xp: null }
    const details = cardsDetail.find((o) => o.id === card.card_detail_id)
    var alpha_bcx = 0,
        alpha_dec = 0
    var xp = Math.max(card.xp - card.alpha_xp, 0)
    let burn_rate =
        card.edition == 4 || details.tier >= 4
            ? settings.dec.untamed_burn_rate[details.rarity - 1]
            : settings.dec.burn_rate[details.rarity - 1]
    if (card.alpha_xp) {
        var alpha_bcx_xp = settings[card.gold ? 'gold_xp' : 'alpha_xp'][details.rarity - 1]
        alpha_bcx = Math.max(card.gold ? card.alpha_xp / alpha_bcx_xp : card.alpha_xp / alpha_bcx_xp, 1)
        alpha_dec = burn_rate * alpha_bcx * settings.dec.alpha_burn_bonus
        if (card.gold) alpha_dec *= settings.dec.gold_burn_bonus
    }
    var xp_property =
        card.edition == 0 || (card.edition == 2 && details.id < 100)
            ? card.gold
                ? 'gold_xp'
                : 'alpha_xp'
            : card.gold
            ? 'beta_gold_xp'
            : 'beta_xp'
    var bcx_xp = settings[xp_property][details.rarity - 1]
    var bcx = Math.max(card.gold ? xp / bcx_xp : (xp + bcx_xp) / bcx_xp, 1)
    if (card.edition == 4 || details.tier >= 4) bcx = card.xp
    if (card.alpha_xp) bcx--
    var dec = burn_rate * bcx
    if (card.gold) {
        const gold_burn_bonus_prop = details.tier >= 7 ? 'gold_burn_bonus_2' : 'gold_burn_bonus'
        dec *= settings.dec[gold_burn_bonus_prop]
    }
    if (card.edition == 0) dec *= settings.dec.alpha_burn_bonus
    if (card.edition == 2) dec *= settings.dec.promo_burn_bonus
    var total_dec = dec + alpha_dec
    if (card.xp >= getMaxXp(details, card.edition, card.gold)) total_dec *= settings.dec.max_burn_bonus
    if (details.tier >= 7) total_dec = total_dec / 2
    return total_dec
}

module.exports = utils
