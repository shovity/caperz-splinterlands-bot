var steem = require('steem')
const eosjs_ecc = require('eosjs-ecc')
const { parentPort } = require('worker_threads')
var md5 = require('md5')
const cardsDetail = require('../../worker/splinterlands/data/cardsDetails.json')
const Config = {
    api_url: 'https://api2.splinterlands.com',
    battle_url: 'https://battle.splinterlands.com',
    ws_url: 'wss://ws.splinterlands.com',
    external_chain_api_url: 'https://ec-api.splinterlands.com',
    tx_broadcast_urls: ['https://broadcast.splinterlands.com', 'https://bcast.splinterlands.com'],
    asset_location: 'https://dstm6no41hr55.cloudfront.net/210817/',
    tutorial_asset_location: 'https://d36mxiodymuqjm.cloudfront.net/website/ui_elements/tutorial/',
    card_image_url: 'https://d36mxiodymuqjm.cloudfront.net',
    SE_RPC_URL: 'https://api.steem-engine.net/rpc',
    HE_RPC_URL: 'https://api.hive-engine.com/rpc',
    version: '0.7.133',
    rpc_nodes: [
        'https://api.hive.blog',
        'https://anyx.io',
        'https://hived.splinterlands.com',
        'https://api.openhive.network',
    ],
    splinterHosts: ['https://steemmonsters.com/', 'https://api2.splinterlands.com/'],
}

const requester = require('../requester')

const log = false

steem.api.setOptions({
    transport: 'http',
    uri: Config.rpc_nodes[0],
    url: Config.rpc_nodes[0],
    useAppbaseApi: true,
})

const ERROR_CODE = {
    INVALID_POSTING_KEY: 'INVALID_POSTING_KEY',
}

const STATUS = {
    ERROR: 'ERROR',
    RUNNING: 'RUNNING',
    DONE: 'DONE',
}

const MATCH_STATUS = {
    MATCHING: 'MATCHING',
    MATCHED: 'MATCHED',
    SUBMITTING: 'SUBMITTING',
}

const TYPE = {
    INFO_UPDATE: 'INFO_UPDATE',
    STATUS_UPDATE: 'STATUS_UPDATE',
}

const quests = [
    { name: 'Defend the Borders', element: 'white' },
    { name: 'Pirate Attacks', element: 'blue' },
    { name: 'High Priority Targets', element: 'Snipe' },
    { name: "Lyanna's Call", element: 'green' },
    { name: 'Stir the Volcano', element: 'red' },
    { name: 'Rising Dead', element: 'black' },
    { name: 'Stubborn Mercenaries', element: 'Neutral' },
    { name: 'Gloridax Revenge', element: 'gold' },
    { name: 'Stealth Mission', element: 'Sneak' },
]

steem.config.set('chain_id', 'beeab0de00000000000000000000000000000000000000000000000000000000')

function generatePassword(length, rng) {
    if (!rng) rng = Math.random
    var charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
        retVal = ''
    for (var i = 0, n = charset.length; i < length; ++i) {
        retVal += charset.charAt(Math.floor(rng() * n))
    }
    return retVal
}

class SplinterLandsClient {
    constructor(proxy, config, masterKey) {
        this.user = null
        this.token = null
        this.settings = null
        this.key = null
        this.in_battle = false
        this._server_time_offset = null
        this._transactions = {}
        this._currentBattle = null
        this.balance_update_deferred = false
        this._browser_id = null
        this.proxy = proxy || null
        this.config = config
        this.gotReward = false
        this.status = ''
        this._active_auth_tx_callbacks = {}
        this.masterKey = masterKey
        this.rentRequireCardDone = false
    }
    sendMessage = ({ player, ...data }) => {
        if (!this.user && !player) return
        if (!player) {
            player = this.user.name.toLowerCase() || ''
        }
        parentPort.postMessage({ ...data, player })
    }

    updatePlayerInfo = (data) => {
        if (!this.user) return
        let player = this.user.name || ''
        parentPort.postMessage({
            type: 'INFO_UPDATE',
            status: this.status,
            player,
            ecr: this.getEcr(),
            rating: this.getRating(),
            dec: this.getBalance('DEC'),
            power: this.user.collection_power,
            lastRewardTime: this.getLastRewardTime(),
            quest: this.user.quest.completed_items,
            maxQuest: this.user.quest.total_items,
            ...data,
        })
    }

    calculateECR(lastRewardTime = 0, ecr) {
        const ONE_MINUTE = 60 * 1000
        const ONE_HOUR = 60 * ONE_MINUTE

        const now = Date.now()
        let recoverECR = 0

        if (lastRewardTime) {
            recoverECR = +((now - lastRewardTime) / ONE_HOUR).toFixed(2)
        }

        return +(recoverECR + ecr).toFixed(2)
    }

    processDone = async () => {
        if (!this.user) return
        let d = this.getBalance('DEC')
        if (
            this.config.modeTransfer &&
            this.config.majorAccount.player &&
            this.config.majorAccount.player != this.user.name.toLowerCase() &&
            this.config.transferStartDec &&
            this.config.transferKeepDec &&
            this.config.transferStartDec <= d
        ) {
            await this.transferDEC(d - this.config.transferKeepDec)
        }
        if (
            this.config.majorAccount.player &&
            this.config.modeTransfer &&
            this.config.majorAccount.player != this.user.name.toLowerCase()
        ) {
            await this.sendCardToMajorAccount()
        }
        await this.UpdatePlayerInfo()
        this.updatePlayerInfo()
        await this.createCollector()
        return true
    }

    async createCollector() {
        const delegatedCards = []
        let dlgPw = 0
        const result = await this.sendRequest(`cards/collection/${this.user.name}`, {
            username: this.user.name,
            token: this.token,
        })

        if (result) {
            result.cards
                .filter((c) => {
                    if (
                        this.config.majorAccount?.postingKey &&
                        c.delegated_to &&
                        c.player === this.config.majorAccount?.player &&
                        c.delegated_to == this.user.name
                    ) {
                        return true
                    }
                })
                .forEach((item) => {
                    dlgPw += this.calculateCP(item)
                    delegatedCards.push(item.uid)
                })
        }
        log && console.log('undelegatedCards', delegatedCards)

        parentPort.postMessage({
            type: TYPE.STATUS_UPDATE,
            status: STATUS.DONE,
            player: this.user.name.toLowerCase(),
            param: {
                cards: delegatedCards,
                proxy: this.proxy,
                power: this.user.collection_power - dlgPw,
                player: this.user.name,
                config: this.config,
            },
        })
    }
    async GetDetailEnemyFound(battle_queue) {
        const result = await this.sendRequest('players/details', {
            name: battle_queue.opponent_player,
            teams: true,
        })

        if (result) {
            return result
        }
    }

    cancelMatch(callback) {
        this.broadcastCustomJson('sm_cancel_match', 'Steem Monsters Cancel Match', {}, callback)
    }

    surrender(id, callback) {
        this.broadcastCustomJson(
            'sm_surrender',
            'Steem Monsters Surrender Match',
            {
                battle_queue_id: id,
            },
            callback
        )
    }

    async getPlayerCardsUID() {
        const result = await this.sendRequest(`cards/collection/${this.user.name}`, {
            username: this.user.name,
            token: this.token,
        })
        if (result) {
            return result.cards.filter((c) => {
                if (c.delegated_to && c.player === this.user.name && c.player !== c.delegated_to) {
                    return false
                }

                if (c.unlock_date && new Date(c.unlock_date) >= Date.now()) {
                    return false
                }

                if (
                    c.player != c.last_used_player &&
                    c.last_used_date &&
                    Date.now() - new Date(c.last_used_date) < 1000 * 60 * 60 * 24
                ) {
                    if (
                        c.last_transferred_date &&
                        Date.now() - new Date(c.last_used_date) > Date.now() - new Date(c.last_transferred_date)
                    ) {
                        return false
                    }
                }

                return true
            })
        } else {
            return []
        }
    }

    getUIDbyId(items, id) {
        for (let i = 0; i < items.length; i++) {
            if (items[i].card_detail_id === id) {
                return items[i].uid
            }
        }
    }

    getCardId = (card) => {
        if (card && card.card_detail_id) {
            return `${card.card_detail_id}-${card.edition}-${card.gold ? 'g' : 'c'}`
        }
        return ''
    }

    async getPlayerCards() {
        // get basic
        // const basicCards = require("../data/basicCards");
        const advancedCards = []
        const result = await this.sendRequest(`cards/collection/${this.user.name}`, {
            username: this.user.name,
            token: this.token,
        })

        if (result) {
            result.cards
                .filter((c) => {
                    if (c.delegated_to && c.player === this.user.name && c.player !== c.delegated_to) {
                        return false
                    }

                    if (c.unlock_date && new Date(c.unlock_date) >= Date.now()) {
                        return false
                    }

                    if (c.last_used_date && Date.now() - new Date(c.last_used_date) < 1000 * 60 * 60 * 24) {
                        if (
                            c.last_transferred_date &&
                            Date.now() - new Date(c.last_used_date) > Date.now() - new Date(c.last_transferred_date)
                        ) {
                            return false
                        }
                    }
                    return true
                })
                .map((item) => {
                    advancedCards.push(this.getCardId(item))
                })
            return advancedCards
        } else {
            return []
        }
    }

    async getSendCards() {
        try {
            const advancedCards = []
            const result = await this.sendRequest(`cards/collection/${this.user.name}`, {
                username: this.user.name,
                token: this.token,
            })

            result.cards.map((item) => {
                advancedCards.push(item.uid)
            })

            if (advancedCards.length > 0) {
                this.advancedCards = advancedCards
            }
            return advancedCards
        } catch (e) {
            return this.advancedCards
        }
    }

    GiftCards(card_ids, recipient, callback) {
        var obj = {
            to: recipient,
            cards: card_ids,
        }
        this.broadcastCustomJson('sm_gift_cards', 'Gift Cards', obj, (result) => {
            if (callback) callback(result)
        })
    }

    TransferDEC(to, qty, data, callback) {
        var obj = {
            to: to,
            qty: qty,
            token: 'DEC',
        }
        if (data) obj = Object.assign(obj, data)
        this.broadcastCustomJson('sm_token_transfer', 'Transfer DEC', obj, (result) => {
            if (callback) callback(result)
        })
    }

    async getRewards() {
        try {
            const res = await this.sendRequest('players/rewards_revealed', {
                username: this.user.name,
                token: this.token,
            })

            if (res) {
                this.gotReward = true
                return res
            } else {
                return null
            }
        } catch (e) {
            return null
        }
    }

    setNewQuest(data) {
        this.user.quest = data
        log && console.log('user: ', this.user)
    }

    getUserName() {
        if (!this.user) {
            return null
        }

        if (this.user) {
            return this.user.name
        }
    }

    getQuest() {
        if (!this.user) return null

        if (this.user.quest) {
            let quest = {
                id: this.user.quest.id,
                claim_date: this.user.quest.claim_date,
                created_date: this.user.quest.created_date,
                rewards: this.user.quest.rewards,
                name: this.user.quest.name,
                splinter: this.getElementQuest(this.user.quest.name),
                total: this.user.quest.total_items,
                completed: this.user.quest.completed_items,
                isComplete: this.user.quest.completed_items / this.user.quest.total_items === 1,
            }

            return quest
        } else {
            return null
        }
    }

    StartDailyQuest(callback) {
        this.broadcastCustomJson(
            'sm_start_quest',
            'Start Quest',
            {
                type: 'daily',
            },
            callback
        )
    }

    RefreshDailyQuest(callback) {
        this.broadcastCustomJson(
            'sm_refresh_quest',
            'Steem Monsters Refresh Quest',
            {
                type: 'daily',
            },
            callback
        )
    }

    getElementQuest(questName) {
        const playerQuest = quests.find((quest) => quest.name === questName)
        return playerQuest.element
    }

    async SubmitTeam(queue_trx, submit_expiration_date, summoner, monsters, match_type, extra_data) {
        log && console.log('submit team')
        var secret = generatePassword(10)
        var team_hash = md5(summoner + ',' + monsters.join() + ',' + secret)
        var team = {
            summoner: summoner,
            monsters: monsters,
            secret: secret,
        }
        // var is_swiss = extra_data && extra_data.format && extra_data.format === "swiss";
        var data = {
            trx_id: queue_trx,
            team_hash: team_hash,
        }
        // var submit_and_reveal = (match_type == "Practice" || match_type == "Ranked") && !this.user.settings.submit_hashed_team;
        // if (match_type === "Tournament" && is_swiss) {
        //     var params = {
        //         trx_id: queue_trx,
        //         summoner: summoner,
        //         monsters: monsters.join(),
        //         secret: secret
        //     };
        //     var team_result = await this.sendRequest("battle/send_team", params);
        //     if (!team_result || team_result.error) {
        //         log && console.log("There was an error submitting your team, please try again. Error: " + (team_result ? team_result.error : "unknown"));
        //         return
        //     }
        // } else if (submit_and_reveal) {
        //     data.summoner = team.summoner;
        //     data.monsters = team.monsters;
        //     data.secret = team.secret
        // }
        data.summoner = team.summoner
        data.monsters = team.monsters
        data.secret = team.secret

        this.broadcastCustomJson('sm_submit_team', 'Steem Monsters Submit Team', data, (result) => {
            // log && console.log(result)
            if (result && !result.error && result.trx_info && result.trx_info.success) {
                log && console.log('sm_submit_team', result.trx_info.id)
            } else {
                if (result) {
                    log && console.log('An error has occurred submitting your team - Error: ' + result.error)
                }
            }
        })
    }

    getRuleset(ruleset) {
        return this.settings.battles.rulesets.find((r) => r.name == ruleset) || {}
    }

    removeTxPrefix(tx_name) {
        return tx_name.replace(this.settings.test_mode ? `${this.settings.prefix}sm_` : 'sm_', '')
    }

    trxLookup(trx_id, details, callback, timeout, suppressError) {
        if (this._transactions[trx_id]) {
            if (this._transactions[trx_id].status == 'complete') {
                if (callback(this._transactions[trx_id].data)) {
                    setTimeout(callback(this._transactions[trx_id].data), 6000)
                }
                delete this._transactions[trx_id]
            }
            return
        }
        if (timeout == null || timeout == undefined) timeout = 60
        this._transactions[trx_id] = {
            details: details,
            callback: callback,
            suppressError: suppressError,
        }
        if (timeout > 0) {
            this._transactions[trx_id].timeout = setTimeout(() => {
                if (this._transactions[trx_id] && this._transactions[trx_id].status != 'complete') {
                    log &&
                        console.log(
                            'Your transaction could not be found. This may be an issue with the game server. Please try refreshing the site to see if the transaction went through.'
                        )
                    delete this._transactions[trx_id]
                    if (callback) callback(null)
                }
            }, timeout * 1e3)
        }
    }

    async login(username, posting_key, re) {
        log && console.log('login====')
        const browserId = 'bid_' + generatePassword(20)
        const sessionId = 'sid_' + generatePassword(20)

        this._browser_id = browserId

        let params = {
            name: username.toLowerCase(),
            ref: '',
            browser_id: browserId,
            session_id: sessionId,
            ts: Date.now(),
        }

        try {
            steem.auth.wifToPublic(posting_key)
        } catch (e) {
            log && console.log(e)
            this.sendMessage({
                player: username.toLowerCase(),
                status: STATUS.ERROR,
                message: 'Posting key invalid',
                code: ERROR_CODE.INVALID_POSTING_KEY,
            })
        }
        params.sig = eosjs_ecc.sign(username + params.ts, posting_key)

        this.key = posting_key

        const result = await this.sendRequest('players/login', params)

        if (result && !!re === false) {
            this.user = result
            this.token = result.token
            this.user.league = result.league
            return result
        } else {
            this.user = {
                ...this.user,
                quest: result?.quest,
                league: result?.league,
            }.quest = result?.quest
            this.token = result?.token
        }
    }

    async updateSettings() {
        const result = await this.sendRequest('settings', {
            token: this.token,
            username: this.user.name,
        })

        this.settings = result

        if (this.settings.rpc_nodes && Array.isArray(this.settings.rpc_nodes) && this.settings.rpc_nodes.length > 0) {
            Config.rpc_nodes = this.settings.rpc_nodes.filter((n) => n.startsWith('https://'))
            let rpc_index = 0
            if (Config.rpc_nodes.length > 1) rpc_index = Math.floor(Math.random() * 2)
            steem.api.setOptions({
                transport: 'http',
                uri: Config.rpc_nodes[rpc_index],
                url: Config.rpc_nodes[rpc_index],
                useAppbaseApi: true,
            })
            log && console.log(`Set node to ${Config.rpc_nodes[rpc_index]}`)
        }

        return result
    }

    async UpdatePlayerInfo() {
        if (!this.user) return
        const balances = await this.sendRequestUrl(`https://api2.splinterlands.com/players/balances`, {
            username: this.user.name,
        })
        const res = await this.sendRequestUrl(`https://api2.splinterlands.com/players/details`, {
            name: this.user.name,
        })
        const quest = await this.sendRequestUrl(`https://api.splinterlands.io/players/quests`, {
            username: this.user.name,
        })

        this.user = Object.assign(this.user, res)

        if (quest) {
            this.user.quest = quest[0]
        }

        if (balances) {
            this.user.balances = balances
        }

        return
    }

    async broadcastCustomJson(id, title, data, callback, retries, supressErrors) {
        if (this.settings.test_mode && !id.startsWith(this.settings.prefix)) id = this.settings.prefix + id

        let active_auth =
            this.user.require_active_auth && this.settings.active_auth_ops.includes(id.slice(id.indexOf('sm_') + 3))

        data.app = 'steemmonsters/' + this.settings.version
        data.n = generatePassword(10)
        if (this.settings.test_mode) data.app = this.settings.prefix + data.app

        let bcast_url = Config.tx_broadcast_urls[Math.floor(Math.random() * Config.tx_broadcast_urls.length)]
        let tx = {
            operations: [
                [
                    'custom_json',
                    {
                        required_auths: active_auth ? [this.user.name] : [],
                        required_posting_auths: active_auth ? [] : [this.user.name],
                        id: id,
                        json: JSON.stringify(data),
                    },
                ],
            ],
        }

        if (this.user.use_proxy) {
            let op_name = this.removeTxPrefix(id)
            if (this.settings.api_ops.includes(op_name)) {
                const response = await this.sendRequestUrl(
                    `${Config.api_url}/battle/battle_tx`,
                    {
                        signed_tx: JSON.stringify(tx),
                    },
                    'post'
                )

                if (response && response.id) this.trxLookup(response.id, null, callback, 10, supressErrors)
                else log && console.log(`Error sending transaction: ${response ? response.error : 'Unknown error'}`)

                return
            }

            const response = await this.sendRequestUrl(
                `${bcast_url}/proxy`,
                {
                    player: this.user.name,
                    access_token: this.token,
                    id: id,
                    json: data,
                },
                'post'
            )
            log && console.log('response && response.id', response && response.id)
            if (response && response.id) {
                // this.trxLookup(response.id, null, callback, 10);
            } else {
                log && console.log(`Error sending transaction: ${response ? response.error : 'Unknown error'}`)
            }
        }
        if (!active_auth) {
            try {
                let response = await this.serverBroadcastTx(tx, active_auth)
                log && console.log('response ------------ > 381', response)
                if (response && response?.id) return this.trxLookup(response?.id, null, callback, 10, supressErrors)
                if (response?.error == 'user_cancel') {
                    log && console.log('Transaction was cancelled.')
                } else if (response?.error && JSON.stringify(response?.error).indexOf('Please wait to transact') >= 0) {
                    log && console.log('request delegation')
                    return null
                } else {
                    setTimeout(() => this.broadcastCustomJsonLocal(id, title, data, callback, 2, supressErrors), 3e3)
                }
            } catch (err) {
                log && console.log(111, err)
                this.broadcastCustomJsonLocal(id, title, data, callback, 2, supressErrors)
            }
        } else {
            let mKey
            if (!steem.auth.isWif(this.masterKey)) {
                try {
                    mKey = steem.auth.getPrivateKeys(this.user.name, this.masterKey, ['active']).active
                } catch (err) {
                    return log && console.log('The key entered was not a valid private key or master password.')
                }
            }
            var that = this
            steem.broadcast.customJson(mKey, [this.user.name], [], id, JSON.stringify(data), (err, result) => {
                log && console.log('3', err)
                log && console.log('result 21', result)
                if (result && !err) {
                    that.trxLookup(result.id, null, callback, 10, supressErrors)
                } else {
                    if (err && JSON.stringify(err).indexOf('Please wait to transact') >= 0) {
                        // this.RequestDelegation(id, title, data, callback, retries);
                        log && console.log('request delegation 123')
                        return
                    } else if (retries > 0) {
                        let rpc_node = Config.rpc_nodes[++that._rpc_index % Config.rpc_nodes.length]
                        steem.api.setOptions({
                            transport: 'http',
                            uri: rpc_node,
                            url: rpc_node,
                            useAppbaseApi: true,
                        })
                        log && console.log(`SWITCHED TO NEW RPC NODE: ${rpc_node}`)
                        setTimeout(
                            () => that.broadcastCustomJsonLocal(id, title, data, callback, retries - 1, supressErrors),
                            3e3
                        )
                        return
                    } else if (!supressErrors) {
                        log &&
                            console.log(
                                'There was an error publishing this transaction to the Hive blockchain. Please try again in a few minutes. Error: ' +
                                    err
                            )
                    }
                    if (callback) callback(result)
                }
            })
        }
    }
    async broadcastCustomJsonLocal(id, title, data, callback, retries, supressErrors) {
        if (this.settings.test_mode && !id.startsWith(this.settings.prefix)) id = this.settings.prefix + id
        let active_auth =
            this.user.require_active_auth && this.settings.active_auth_ops.includes(id.slice(id.indexOf('sm_') + 3))
        data.app = 'splinterlands/' + Config.version
        if (this.settings.test_mode) data.app = this.settings.prefix + data.app
        if (isNaN(retries)) retries = 2
        let bcast_url = Config.tx_broadcast_urls[Math.floor(Math.random() * Config.tx_broadcast_urls.length)]
        if (this.user.use_proxy) {
            jQuery.post(
                `${bcast_url}/proxy`,
                {
                    player: this.user.name,
                    access_token: this.user.token,
                    id: id,
                    json: data,
                },
                (response) => {
                    if (response && response.id) this.trxLookup(response.id, null, callback, 10, supressErrors)
                    // else
                    //     alert(`Error sending transaction: ${response ? response.error : "Unknown error"}`)
                }
            )
            return
        }

        if (active_auth) {
            let mKey
            if (!steem.auth.isWif(this.masterKey)) {
                try {
                    mKey = steem.auth.getPrivateKeys(this.user.name, this.masterKey, ['active']).active
                } catch (err) {
                    return log && console.log('The key entered was not a valid private key or master password.')
                }
            }
            steem.broadcast.customJson(mKey, [this.user.name], [], id, JSON.stringify(data), (err, result) => {
                log && console.log('3', err)
                log && console.log('result 22', result)
                if (result && !err) {
                    that.trxLookup(result.id, null, callback, 10, supressErrors)
                } else {
                    if (err && JSON.stringify(err).indexOf('Please wait to transact') >= 0) {
                        // this.RequestDelegation(id, title, data, callback, retries);
                        log && console.log('request delegation 123')
                        return
                    } else if (retries > 0) {
                        let rpc_node = Config.rpc_nodes[++that._rpc_index % Config.rpc_nodes.length]
                        steem.api.setOptions({
                            transport: 'http',
                            uri: rpc_node,
                            url: rpc_node,
                            useAppbaseApi: true,
                        })
                        log && console.log(`SWITCHED TO NEW RPC NODE: ${rpc_node}`)
                        setTimeout(
                            () => that.broadcastCustomJsonLocal(id, title, data, callback, retries - 1, supressErrors),
                            3e3
                        )
                        return
                    } else if (!supressErrors) {
                        log &&
                            console.log(
                                'There was an error publishing this transaction to the Hive blockchain. Please try again in a few minutes. Error: ' +
                                    err
                            )
                    }
                    if (callback) callback(result)
                }
            })
            return
        }
        var that = this
        steem.broadcast.customJson(this.key, [], [this.user.name], id, JSON.stringify(data), (err, result) => {
            log && console.log('334', err)
            log && console.log('result 23', result)
            if (result && !err) {
                that.trxLookup(result.id, null, callback, 10, supressErrors)
            } else {
                if (err && JSON.stringify(err).indexOf('Please wait to transact') >= 0) {
                    // this.RequestDelegation(id, title, data, callback, retries);
                    log && console.log('request delegation 123')
                    if (callback) {
                        callback(result)
                    }
                    return
                } else if (retries > 0) {
                    let rpc_node = Config.rpc_nodes[++that._rpc_index % Config.rpc_nodes.length]
                    steem.api.setOptions({
                        transport: 'http',
                        uri: rpc_node,
                        url: rpc_node,
                        useAppbaseApi: true,
                    })
                    log && console.log(`SWITCHED TO NEW RPC NODE: ${rpc_node}`)
                    setTimeout(
                        () => that.broadcastCustomJsonLocal(id, title, data, callback, retries - 1, supressErrors),
                        3e3
                    )
                    return
                } else if (!supressErrors) {
                    log &&
                        console.log(
                            'There was an error publishing this transaction to the Hive blockchain. Please try again in a few minutes. Error: ' +
                                err
                        )
                    if (callback) {
                        callback(result)
                    }
                }
            }
        })
    }

    prepareTx(tx) {
        return Object.assign(
            {
                ref_block_num: this.settings.chain_props.ref_block_num & 65535,
                ref_block_prefix: this.settings.chain_props.ref_block_prefix,
                expiration: new Date(new Date(this.settings.chain_props.time + 'Z').getTime() + 600 * 1e3),
            },
            tx
        )
    }

    async signTx(tx, use_active) {
        return new Promise(async (resolve, reject) => {
            try {
                if (!tx.expiration) tx = this.prepareTx(tx)

                let signed_tx = null

                let key = this.key
                if (!key)
                    return reject({
                        error: 'Key not found.',
                    })

                signed_tx = steem.auth.signTransaction(tx, [key])
                signed_tx.expiration = signed_tx.expiration.split('.')[0]
                resolve(signed_tx)
            } catch (err) {
                reject(err)
            }
        })
    }

    async serverBroadcastTx(tx, use_active) {
        return new Promise(async (resolve, reject) => {
            try {
                let signed_tx = await this.signTx(tx, use_active)
                if (!signed_tx) return
                let op_name = this.removeTxPrefix(tx.operations[0][1].id)
                if (this.settings.api_ops && this.settings.api_ops.includes(op_name)) {
                    const resultBattleTx = await this.sendRequestBattle(
                        'battle/battle_tx',
                        {
                            signed_tx: JSON.stringify(signed_tx),
                        },
                        'post'
                    )

                    log && console.log('resultBattleTx', resultBattleTx)

                    if (resultBattleTx) {
                        resolve(resultBattleTx)
                    } else {
                        reject(resultBattleTx)
                    }
                    return
                }
                let bcast_url = Config.tx_broadcast_urls[Math.floor(Math.random() * Config.tx_broadcast_urls.length)]

                const dataSend = this.sendRequestUrl(
                    `${bcast_url}/send`,
                    {
                        signed_tx: JSON.stringify(signed_tx),
                    },
                    'post'
                )

                if (dataSend) {
                    resolve(dataSend)
                } else {
                    reject(null)
                }
            } catch (err) {
                reject(err)
            }
        })
    }

    async getBattleResult() {
        // battle/result
        const params = {
            id,
            token,
            username,
        }
    }

    async claimReward(id) {
        // type quest
        // quest id
        const prm = new Promise((resolve, reject) => {
            this.broadcastCustomJson(
                'sm_claim_reward',
                '',
                {
                    type: 'quest',
                    quest_id: id,
                },
                (result) => {
                    if (result && !result.error && result.trx_info && result.trx_info.success) {
                        resolve(result)
                    } else {
                        resolve(null)
                    }
                }
            )
        })
        const r = await prm
        return r
    }

    async auth(username, token) {
        // players/authenticate
        const params = {
            username,
            token,
        }

        return await this.sendRequest('players/authenticate', params)
    }

    async sendRequestUrl(url, params, method = 'get') {
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

            if (this.proxy) {
                option.proxy = {
                    url: `${this.proxy.host}:${this.proxy.port}`,
                    protocol: `${this.proxy.protocol}`,
                }
                if (this.proxy.account) {
                    option.proxy.url = `${this.proxy.account}:${this.proxy.password}@${this.proxy.host}:${this.proxy.port}`
                }
                // objectAxios.httpsAgent = new HttpsProxyAgent(
                //   `https://${this.proxy.account}:${this.proxy.password}@${this.proxy.host}:${this.proxy.port}`
                // )
            }

            if (method === 'get') {
                params.v = new Date().getTime()
            }

            let res = await requester[method](url, params, option)

            return res
        } catch (e) {
            return null
        }
    }

    async sendRequest(url, params, method = 'get') {
        let host = 'https://api2.splinterlands.com/'

        if (url === 'players/details') {
            host = Config.splinterHosts[Math.floor(Math.random() * 2)]
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
            if (this.proxy) {
                option.proxy = {
                    url: `${this.proxy.host}:${this.proxy.port}`,
                    protocol: `${this.proxy.protocol}`,
                }
                if (this.proxy.account) {
                    option.proxy.url = `${this.proxy.account}:${this.proxy.password}@${this.proxy.host}:${this.proxy.port}`
                }
                // objectAxios.httpsAgent = new HttpsProxyAgent(
                //   `${this.proxy}`
                // )
            }
            let res = await requester[method](host + url, params, option)

            return res
        } catch (error) {
            // throw error
        }
    }
    async sendRequestBattle(url, params, method = 'get') {
        let host = 'https://battle.splinterlands.com/'

        try {
            let option = {
                headers: {
                    authority: 'battle.splinterlands.com',
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
            if (this.proxy) {
                option.proxy = {
                    url: `${this.proxy.host}:${this.proxy.port}`,
                    protocol: `${this.proxy.protocol}`,
                }
                if (this.proxy.account) {
                    option.proxy.url = `${this.proxy.account}:${this.proxy.password}@${this.proxy.host}:${this.proxy.port}`
                }
                // objectAxios.httpsAgent = new HttpsProxyAgent(
                //   `${this.proxy}`
                // )
            }

            let res = await requester[method](host + url, params, option)

            return res
        } catch (error) {
            throw error
        }
    }

    async verify(token) {
        let res = await requester['post']('https://sps.nftauto.online/api/v1/users/verify', {
            player: this.user.name,
            token: token,
        })
        return res.code == 1
    }

    async findMatch(match_type, opponent, settings) {
        this.in_battle = true
        return new Promise((resolve, reject) => {
            this.broadcastCustomJson(
                'sm_find_match',
                'Steem Monsters Find Match',
                {
                    match_type: match_type,
                    opponent: opponent,
                    settings: settings,
                },
                (result) => {
                    if (result && !result.error && result.trx_info && result.trx_info.success) {
                        resolve(result)
                    } else if (result) {
                        if (result && result.error && result.error.indexOf('Please refresh the page to resume') >= 0) {
                            this.in_battle = false
                        } else {
                            if (result.error) {
                                this.in_battle = false
                            }
                        }
                        resolve(null)
                    } else {
                        resolve(null)
                    }
                }
            )
        })
    }

    async CreateAccountEmail(email, password, proxy, subscribe, is_test) {
        email = email.toLowerCase()
        let password_pub_key = steem.auth.getPrivateKeys(email, password).ownerPubkey
        let params = {
            purchase_id: 'new-' + generatePassword(6),
            email: email,
            password_pub_key: password_pub_key,
            subscribe: subscribe,
            is_test: is_test,
            ref: 'vanz-2008',
            ref_url: '',
            browser_id: this._browser_id,
        }

        const response = await this.sendRequestProxy('players/create_email', params, 'get', proxy)

        if (response && !response.error) {
        }
        return response
    }

    async sendRequestProxy(url, params, method = 'get', proxy) {
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

            if (this.proxy) {
                option.proxy = {
                    url: `${this.proxy.host}:${this.proxy.port}`,
                    protocol: `${this.proxy.protocol}`,
                }
                if (this.proxy.account) {
                    option.proxy.url = `${this.proxy.account}:${this.proxy.password}@${this.proxy.host}:${this.proxy.port}`
                }
                // objectAxios.httpsAgent = new HttpsProxyAgent(
                //   `${this.proxy}`
                // )
            }

            if (method === 'get') {
                params.v = new Date().getTime()
            }

            let res = await requester[method](url, params, option)

            return res
        } catch (e) {
            throw e
        }
    }

    getBalance(token) {
        if (!this.user.balances) {
            log && console.log(this.user)
            return 0
        }
        for (let i = 0; i < this.user.balances.length; i++) {
            if (this.user.balances[i].token === token) {
                return this.user.balances[i].balance
            }
        }
        return 0
    }

    getEcr() {
        if (!this.user) return 0

        const ecr = this.getBalance('ECR') / 100
        const lastRewardTime = new Date(this.user.balances.find((b) => b.token == 'ECR').last_reward_time).getTime()

        return this.calculateECR(lastRewardTime, ecr)
    }

    getRating() {
        if (!this.user) return 0

        return this.user.rating
    }

    getLastRewardTime() {
        if (!this.user?.last_reward_time) {
            return null
        }

        return new Date(this.user.last_reward_time).getTime()
    }

    async loginEmail(email, password) {
        let params = {
            email: email.toLowerCase(),
        }

        let password_key = steem.auth.getPrivateKeys(email, password).owner

        params.ts = Date.now()
        params.sig = eosjs_ecc.sign((email + params.ts).toString(), password_key)

        // send to api login through email

        const result = await this.sendRequest('players/login_email', params)

        if (result) {
            return result
        }
    }
    calculateCPOld(card) {
        const details = cardsDetail.find((o) => o.id === card.card_detail_id)
        const SM_dec = {
            gold_burn_bonus_2: 25,
            alpha_bonus: 0.1,
            gold_bonus: 0.1,
            burn_rate: [15, 60, 300, 1500],
            untamed_burn_rate: [10, 40, 200, 1000],
            alpha_burn_bonus: 2,
            promo_burn_bonus: 2,
            gold_burn_bonus: 50,
            max_burn_bonus: 1.05,
        }
        let burn_rate =
            card.edition == 4 || details.tier >= 4
                ? SM_dec.untamed_burn_rate[details.rarity - 1]
                : SM_dec.burn_rate[details.rarity - 1]
        var bcx = 1
        var dec = burn_rate * bcx
        if (card.gold) {
            const gold_burn_bonus_prop = details.tier >= 7 ? 'gold_burn_bonus_2' : 'gold_burn_bonus'
            dec *= SM_dec[gold_burn_bonus_prop]
        }
        if (card.edition == 0) dec *= SM_dec.alpha_burn_bonus
        if (card.edition == 2) dec *= SM_dec.promo_burn_bonus
        var total_dec = dec
        if (details.tier >= 7) total_dec = total_dec / 2
        return +total_dec
    }

    calculateCP(c) {
        const card = c.xp > 1 ? { ...c, alpha_xp: 0 } : { ...c, alpha_xp: null }
        const details = cardsDetail.find((o) => o.id === card.card_detail_id)
        var alpha_bcx = 0,
            alpha_dec = 0
        var xp = Math.max(card.xp - card.alpha_xp, 0)
        let burn_rate =
            card.edition == 4 || details.tier >= 4
                ? this.settings.dec.untamed_burn_rate[details.rarity - 1]
                : this.settings.dec.burn_rate[details.rarity - 1]
        if (card.alpha_xp) {
            var alpha_bcx_xp = this.settings[card.gold ? 'gold_xp' : 'alpha_xp'][details.rarity - 1]
            alpha_bcx = Math.max(card.gold ? card.alpha_xp / alpha_bcx_xp : card.alpha_xp / alpha_bcx_xp, 1)
            alpha_dec = burn_rate * alpha_bcx * this.settings.dec.alpha_burn_bonus
            if (card.gold) alpha_dec *= this.settings.dec.gold_burn_bonus
        }
        var xp_property =
            card.edition == 0 || (card.edition == 2 && details.id < 100)
                ? card.gold
                    ? 'gold_xp'
                    : 'alpha_xp'
                : card.gold
                ? 'beta_gold_xp'
                : 'beta_xp'
        var bcx_xp = this.settings[xp_property][details.rarity - 1]
        var bcx = Math.max(card.gold ? xp / bcx_xp : (xp + bcx_xp) / bcx_xp, 1)
        if (card.edition == 4 || details.tier >= 4) bcx = card.xp
        if (card.alpha_xp) bcx--
        var dec = burn_rate * bcx
        if (card.gold) {
            const gold_burn_bonus_prop = details.tier >= 7 ? 'gold_burn_bonus_2' : 'gold_burn_bonus'
            dec *= this.settings.dec[gold_burn_bonus_prop]
        }
        if (card.edition == 0) dec *= this.settings.dec.alpha_burn_bonus
        if (card.edition == 2) dec *= this.settings.dec.promo_burn_bonus
        var total_dec = dec + alpha_dec
        if (card.xp >= this.getMaxXp(details, card.edition, card.gold)) total_dec *= this.settings.dec.max_burn_bonus
        if (details.tier >= 7) total_dec = total_dec / 2
        return total_dec
    }
    getMaxXp(details, edition, gold) {
        let rarity = details.rarity
        let tier = details.tier
        if (edition == 4 || tier >= 4) {
            let rates = gold ? this.settings.combine_rates_gold[rarity - 1] : this.settings.combine_rates[rarity - 1]
            return rates[rates.length - 1]
        } else return this.settings.xp_levels[rarity - 1][this.settings.xp_levels[rarity - 1].length - 1]
    }
    async cardRental(curPower, expectedPower, maxDec, bl, rentalDay = 1, initialDec, requireCard) {
        let retry = false
        let blackList = bl
        let gainedPower = 0
        let remainingPower = expectedPower - curPower
        let remainingDec = remainingPower <= 100 ? 1 * rentalDay : maxDec
        let weight = remainingDec / rentalDay / remainingPower
        let cardRemaining = []
        log && console.log('weight ', weight)
        log && console.log('remainingPower', remainingPower)

        const getCardMarketIdArray = async (card) => {
            if (!card) {
                return []
            }
            let result = []
            const res = await this.sendRequest('market/for_rent_by_card', {
                card_detail_id: card.card_detail_id,
                gold: card.gold,
                edition: card.edition,
                v: Date.now(),
                username: this.user.name,
                token: this.token,
            })
            if (!res) {
                return []
            }
            res.sort((a, b) => {
                return +a.buy_price - +b.buy_price
            })
            if (res[0].buy_price / this.calculateCP(res[0]) > weight) {
                blackList.push(card.formated)
                retry = true
                return []
            }
            res.every((c) => {
                if (
                    c.buy_price / this.calculateCP(c) > weight ||
                    gainedPower + this.calculateCP(c) > remainingPower + 100
                ) {
                    return false
                } else {
                    log && console.log('card power', this.calculateCP(c))
                    result.push(c.market_id)
                    gainedPower += this.calculateCP(c)
                    log && console.log('price', c.buy_price)
                    return true
                }
            })
            return result
        }
        if (requireCard?.length) {
            const pc = await this.getPlayerCardsUID()
            const playerCards = pc.map((c) => this.getCardId(c))
            requireCard.forEach((c) => {
                const cid = c.id.split('_')[1]
                if (!playerCards.includes(cid)) {
                    cardRemaining.push({
                        id: cid,
                        dec: c.maxDec,
                    })
                }
            })
        }
        if (cardRemaining.length) {
            await Promise.all(
                cardRemaining.map(async (card) => {
                    const res = await this.sendRequest('market/for_rent_by_card', {
                        card_detail_id: card.id.split('-')[0],
                        gold: card.id.split('-')[2] == 'c' ? false : true,
                        edition: card.id.split('-')[1],
                        v: Date.now(),
                        username: this.user.name,
                        token: this.token,
                    })
                    if (!res) {
                        return
                    }
                    const cardsList = res
                        .sort((a, b) => {
                            return +a.buy_price - +b.buy_price
                        })
                        .filter((c) => {
                            if (c.delegated_to && c.player === this.user.name && c.player !== c.delegated_to) {
                                return false
                            }

                            if (c.unlock_date && new Date(c.unlock_date) >= Date.now()) {
                                return false
                            }

                            if (
                                c.player != c.last_used_player &&
                                c.last_used_date &&
                                Date.now() - new Date(c.last_used_date) < 1000 * 60 * 60 * 24
                            ) {
                                if (
                                    c.last_transferred_date &&
                                    Date.now() - new Date(c.last_used_date) >
                                        Date.now() - new Date(c.last_transferred_date)
                                ) {
                                    return false
                                }
                            }
                            if (parseFloat(c.buy_price) > card.dec) {
                                return false
                            }
                            return true
                        })
                    if (cardsList) {
                        const id = res[0].market_id
                        const prm = new Promise((resolve, reject) => {
                            this.broadcastCustomJson(
                                'sm_market_rent',
                                '',
                                {
                                    items: [id],
                                    currency: 'DEC',
                                    days: rentalDay,
                                },
                                (result) => {
                                    if (result && !result.error && result.trx_info && result.trx_info.success) {
                                        resolve(result)
                                    } else {
                                        resolve(null)
                                    }
                                }
                            )
                        })
                        return prm
                    }
                })
            )
            return
        } else {
            this.rentRequireCardDone = true
        }
        if (remainingPower <= 0) {
            parentPort.postMessage({
                type: 'INFO_UPDATE',
                status: 'RUNNING',
                player: this.user.name,
                matchStatus: 'NONE',
            })
            log && console.log('done ne')
            return
        }
        const res = await this.sendRequest('market/for_rent_grouped', {
            v: Date.now(),
            username: this.user.name,
            token: this.token,
        })
        if (!res) {
            return
        }
        const data = res
            .map((e) => {
                return {
                    ...e,
                    power: this.calculateCPOld({ ...e, xp: 1, alpha_xp: null }),
                    weight: e.low_price / this.calculateCPOld({ ...e, xp: 1, alpha_xp: null }),
                    formated: `${e.card_detail_id}-${e.edition}-${e.gold}`,
                }
            })
            .filter((e) => {
                if (blackList.includes(e.formated)) {
                    return false
                }
                if (e.weight > weight) {
                    return false
                }
                if (e.power > remainingPower + 200) {
                    return false
                }
                return true
            })
            .sort((a, b) => {
                return b.power - a.power
            })

        let r
        if (data.length > 0) {
            const marketIdArray = await getCardMarketIdArray(data[0])
            const ids = marketIdArray.filter((e) => e != 0)
            if (ids.length > 0) {
                const prm = new Promise((resolve, reject) => {
                    this.broadcastCustomJson(
                        'sm_market_rent',
                        '',
                        {
                            items: marketIdArray.filter((e) => e != 0),
                            currency: 'DEC',
                            days: rentalDay,
                        },
                        (result) => {
                            if (result && !result.error && result.trx_info && result.trx_info.success) {
                                resolve(result)
                            } else {
                                resolve(null)
                            }
                        }
                    )
                })
                r = await prm
            }
        } else {
            retry = true
        }
        if (retry) {
            await this.cardRental(curPower + gainedPower, expectedPower, remainingDec, blackList, rentalDay, initialDec)
            return
        }
        parentPort.postMessage({
            type: 'INFO_UPDATE',
            status: 'RUNNING',
            player: this.user.name,
            matchStatus: 'NONE',
        })
        log && console.log('done ne')
        return r
    }
    async transferDEC(dec) {
        try {
            parentPort.postMessage({
                type: 'INFO_UPDATE',
                status: 'TRANSFERRING',
                player: this.user.name,
                matchStatus: 'NONE',
            })
            const prm = new Promise((resolve, reject) => {
                this.broadcastCustomJson(
                    'sm_token_transfer',
                    '',
                    {
                        to: this.config.majorAccount.player,
                        qty: dec,
                        token: 'DEC',
                        type: 'withdraw',
                        memo: this.config.majorAccount.player,
                    },
                    (result) => {
                        if (result && !result.error && result.trx_info && result.trx_info.success) {
                            resolve(result)
                        } else {
                            resolve(null)
                        }
                    }
                )
            })
            const r = await prm

            return r
        } catch (error) {
            log && console.log(error)
        }
    }
    async sendCardToMajorAccount() {
        try {
            parentPort.postMessage({
                type: 'INFO_UPDATE',
                status: 'TRANSFERRING',
                player: this.user.name,
                matchStatus: 'NONE',
            })
            const result = await this.sendRequest(`cards/collection/${this.user.name}`, {
                username: this.user.name,
                token: this.token,
            })
            const cards = []
            result.cards.forEach((e) => {
                if (this.user.name == e.player) {
                    cards.push(e.uid)
                }
            })
            if (cards.length == 0) {
                return null
            }
            const prm = new Promise((resolve, reject) => {
                this.broadcastCustomJson(
                    'sm_gift_cards',
                    '',
                    {
                        to: this.config.majorAccount.player,
                        cards: cards,
                    },
                    (result) => {
                        if (result && !result.error && result.trx_info && result.trx_info.success) {
                            resolve(result)
                        } else {
                            resolve(null)
                        }
                    }
                )
            })
            const r = await prm
            return r
        } catch (error) {
            log && console.log(error)
        }
    }

    async delegatePower(player, power, currentPower) {
        let remainingPw = power
        let smallCurrentPower = false
        let dlgPw = 0
        if (currentPower <= 100) {
            smallCurrentPower = true
        }
        try {
            const result = await this.sendRequest(`cards/collection/${this.user.name}`, {
                username: this.user.name,
                token: this.token,
            })
            let formattedCards = []
            let cards = []
            result.cards.forEach((e) => {
                if (e.delegated_to != null) {
                    return null
                }
                if (this.user.name.toLowerCase().trim() == e.player.toLowerCase().trim()) {
                    let pw = this.calculateCP(e)
                    if (pw < 100) {
                        return null
                    }

                    formattedCards.push({
                        uid: e.uid,
                        power: this.calculateCP(e),
                    })
                }
            })
            if (smallCurrentPower) {
                formattedCards.sort((a, b) => {
                    return a.power - b.power
                })
                formattedCards.forEach((e) => {
                    if (remainingPw <= 0 || remainingPw - e.power > 0) {
                        return
                    }
                    cards.push(e.uid)
                    remainingPw -= e.power
                    dlgPw += e.power
                })
            }
            formattedCards.sort((a, b) => {
                return b.power - a.power
            })

            formattedCards.forEach((e) => {
                if (remainingPw <= 0 || remainingPw - e.power < 0) {
                    return
                }
                cards.push(e.uid)
                remainingPw -= e.power
                dlgPw += e.power
            })

            if (remainingPw > 0) {
                formattedCards.sort((a, b) => {
                    return a.power - b.power
                })

                formattedCards.every((e) => {
                    if (remainingPw <= 0) {
                        return false
                    }
                    if (!cards.includes(e.uid)) {
                        cards.push(e.uid)
                        remainingPw -= e.power
                        dlgPw += e.power
                    }
                    return true
                })
            }

            if (cards.length == 0) {
                return null
            }
            log && console.log('card for delegate', cards)
            const prm = new Promise((resolve, reject) => {
                this.broadcastCustomJson(
                    'sm_delegate_cards',
                    'Delegate Cards',
                    {
                        to: player,
                        cards: cards,
                    },
                    (result) => {
                        log && console.log('delegate ->', result)
                        if (result && !result.error && result.trx_info && result.trx_info.success) {
                            resolve(result)
                        } else {
                            resolve(null)
                        }
                    }
                )
            })
            const r = await prm
            return r
        } catch (error) {
            log && console.log(error)
        }
    }
    async undelegatePower(cards) {
        try {
            if (cards.length == 0) {
                return null
            }
            const prm = new Promise((resolve, reject) => {
                this.broadcastCustomJson(
                    'sm_undelegate_cards',
                    'Delegate Cards',
                    {
                        cards: cards,
                    },
                    (result) => {
                        log && console.log('undelegate ->', result)
                        if (result && !result.error && result.trx_info && result.trx_info.success) {
                            resolve(result)
                        } else {
                            resolve(null)
                        }
                    }
                )
            })

            const r = await prm
            return r
        } catch (error) {
            log && console.log(error)
        }
    }

    async collectSeasonReward(season) {
        try {
            parentPort.postMessage({
                type: 'INFO_UPDATE',
                status: 'COLLECTING',
                player: this.user.name,
                matchStatus: 'NONE',
            })
            const prm = new Promise((resolve, reject) => {
                this.broadcastCustomJson(
                    'sm_claim_reward',
                    '',
                    {
                        type: 'league_season',
                        season: season,
                    },
                    (result) => {
                        if (result && !result.error && result.trx_info && result.trx_info.success) {
                            resolve(result)
                        } else {
                            resolve(null)
                        }
                    }
                )
            })
            const r = await prm
            if (r != null) {
                await this.UpdatePlayerInfo()
                await this.updatePlayerInfo()
            }
            parentPort.postMessage({
                type: 'INFO_UPDATE',
                status: 'RUNNING',
                player: this.user.name,
                matchStatus: 'NONE',
            })
            return r
        } catch (error) {
            log && console.log(error)
        }
    }
    async sendOpponentHistory(player, token) {
        try {
            const res = await this.sendRequest(`battle/history2`, {
                player: player,
                limit: 50,
            })
            if (res.battles) {
                const battles = res.battles
                const r = await requester.post(
                    'https://nftauto.online/api/v2/teams',
                    {
                        battles: battles,
                    },
                    {
                        header: {
                            token: token,
                        },
                    }
                )
            }
        } catch (error) {
            log && console.log(error)
        }
    }
    async rankup() {
        const leagueData = [
            {
                minRating: 0,
                minPower: 0,
            },
            {
                minRating: 100,
                minPower: 0,
            },
            {
                minRating: 400,
                minPower: 1000,
            },
            {
                minRating: 700,
                minPower: 5000,
            },
            {
                minRating: 1000,
                minPower: 15000,
            },
            {
                minRating: 1300,
                minPower: 40000,
            },
            {
                minRating: 1600,
                minPower: 70000,
            },
            {
                minRating: 1900,
                minPower: 100000,
            },
            {
                minRating: 2200,
                minPower: 150000,
            },
            {
                minRating: 2500,
                minPower: 200000,
            },
            {
                minRating: 2800,
                minPower: 250000,
            },
            {
                minRating: 3100,
                minPower: 325000,
            },
            {
                minRating: 3400,
                minPower: 400000,
            },
            {
                minRating: 3700,
                minPower: 500000,
            },
            {
                minRating: 4200,
                minPower: 500000,
            },
            {
                minRating: 4700,
                minPower: 500000,
            },
        ]
        try {
            const power = this.user.collection_power
            const rating = this.user.rating
            let rank = -1
            leagueData.forEach((league) => {
                if (power >= league.minPower && rating >= league.minRating) {
                    rank++
                }
            })
            if (rank > this.user.season_max_league) {
                const prm = new Promise((resolve, reject) => {
                    this.broadcastCustomJson('sm_advance_league', 'Advance League', {}, (result) => {
                        if (result && !result.error && result.trx_info && result.trx_info.success) {
                            resolve(result)
                        } else {
                            resolve(null)
                        }
                    })
                })
                const r = await prm
                return r
            } else {
                return
            }
        } catch (error) {
            log && console.log(error)
            return error
        }
    }
}
module.exports = SplinterLandsClient
