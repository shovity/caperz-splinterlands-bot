const WebSocket = require('ws')
const ask = require('../../worker/splinterlands/possibleTeams')
const { parentPort } = require('worker_threads')

const MATCH_STATUS = {
    MATCHING: 'MATCHING',
    MATCHED: 'MATCHED',
    SUBMITTING: 'SUBMITTING',
    NONE: 'NONE',
}

const Config = {
    api_url: 'https://api2.splinterlands.com',
    ws_url: 'wss://ws.splinterlands.com/',
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
}

const log = false

const activeObj = {
    gold: 'dragon',
    blue: 'water',
    red: 'fire',
    white: 'life',
    green: 'earth',
    black: 'death',
}

const getCardIdFromString = (str) => {
    let rs = {}
    if (str) {
        let [id, edition, type] = str.split('-')
        if (id) {
            id = +id
            rs = {
                id,
                edition,
            }
        }
    }
    return rs
}

const basicCards = require('../../worker/splinterlands/data/basicCards.js')
let baseCards = basicCards.map((card) => getCardIdFromString(card).id)

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms)
    })
}

function getFormatedTime() {
    var d = new Date()
    var res = [d.getHours(), d.getMinutes(), d.getSeconds()]
        .map(function (x) {
            return x < 10 ? '0' + x : x
        })
        .join(':')

    return res
}

function generatePassword(length, rng) {
    if (!rng) rng = Math.random
    var charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
        retVal = ''
    for (var i = 0, n = charset.length; i < length; ++i) {
        retVal += charset.charAt(Math.floor(rng() * n))
    }
    return retVal
}

class WSSplinterlandsClient {
    constructor(client, proxy, getUserQuestNew, config, spsToken, delegated) {
        this.ws = null
        this.ping_interval = null
        this.session_id = null
        this.player = null
        this._server_time_offset = null
        this.client = client
        this.proxy = proxy
        this.token = null
        this.getUserQuestNew = getUserQuestNew
        this.config = config || {}
        this.startQuest = false
        this.questClaimed = false
        this.spsToken = spsToken
        this.claimQuestError = false
        this.collectSeasonRewardDone = false
        this.retryTimeout = null
        this.delegated = delegated
        this.opponent = null
        this.initialDec = null
    }

    async Connect(player, token, new_account) {
        // const verifyRes = await this.client.verify(this.spsToken)
        // if (!verifyRes) {
        //     parentPort.postMessage({
        //         type: 'INFO_UPDATE',
        //         status: 'NOT IN WHITELIST',
        //         player: this.client.user.name,
        //         matchStatus: MATCH_STATUS.NONE,
        //     })
        //     return
        // }
        // process.send('start');
        if (this.ws && this.ws.readyState == 1 && this.player == player) return

        log && console.log('try connect', player)
        this.token = token
        this.player = player
        if (!this.session_id) this.session_id = generatePassword(10)
        const config = {
            origin: 'https://splinterlands.com',
        }
        // if (this.proxy) {
        //   config.agent = new HttpsProxyAgent(`https://${this.proxy}`)
        // }
        this.ws = new WebSocket(Config.ws_url, config)
        log && console.log('Opening socket connection...')
        this.ws.onopen = async () => {
            // log && console.log('ws open try');
            if (new_account)
                this.Send({
                    type: 'new_account',
                    player: player,
                    session_id: this.session_id,
                })
            else
                this.Send({
                    type: 'auth',
                    player: player,
                    access_token: token,
                    session_id: this.session_id,
                })
            // update ecr
            this.CheckCondition()
        }
        this.ws.onmessage = this.OnMessage.bind(this)
        this.ws.onerror = this.OnError.bind(this)
        this.ws.onclose = this.OnClose.bind(this)
        if (this.ping_interval) clearInterval(this.ping_interval)
        this.ping_interval = setInterval(() => this.Ping(), 60 * 1e3)
    }

    async CheckCondition() {
        await this.client.UpdatePlayerInfo()
        await this.client.updatePlayerInfo()
        let quest = await this.client.getQuest()
        const ECR = this.client.getEcr()
        const userName = this.client.getUserName()
        const currentTimestamp = new Date().getTime() / 1000
        log && console.log('CheckCondition->>', userName)
        if (this.config.modeRankup) {
            await this.client.rankup()
        }
        if (this.initialDec == null) {
            this.initialDec =
                this.client.getBalance('DEC') +
                this.config.maxDec * this.config.rentalDay -
                (this.config.maxDec *
                    this.config.rentalDay *
                    (this.config.expectedPower - this.client.user.collection_power)) /
                    this.config.expectedPower
        }
        if (
            this.client.masterKey &&
            this.config.modeRental &&
            this.config.expectedPower &&
            this.config.maxDec &&
            this.config.maxDec * this.config.rentalDay > this.initialDec - this.client.getBalance('DEC') &&
            this.config.rentalDay &&
            this.client.user.collection_power < this.config.expectedPower
        ) {
            parentPort.postMessage({
                type: 'INFO_UPDATE',
                status: 'RENTING',
                player: this.client.user.name,
                matchStatus: MATCH_STATUS.NONE,
            })

            let dec =
                (this.config.maxDec *
                    this.config.rentalDay *
                    (this.config.expectedPower - this.client.user.collection_power)) /
                this.config.expectedPower

            let r = await this.client.cardRental(
                this.client.user.collection_power,
                this.config.expectedPower,
                dec,
                [],
                this.config.rentalDay,
                this.initialDec,
                this.config.requireCard
            )
            this.CheckCondition()
            return
        }
        if (this.config.modeCollectSeasonReward && !this.collectSeasonRewardDone) {
            this.collectSeasonRewardDone = true
            try {
                log && console.log('claim season',this.config.season)
                await this.client.collectSeasonReward(this.config.season)
            } catch (error) {
                log && console.log('err', error)
            }
        }

        const NeWQuest = async () => {
            // Обновление квеста
            log && console.log('get new quest')
            const prm = new Promise((resolve, reject) => {
                this.client.StartDailyQuest(async (data) => {
                    if (data?.trx_info?.result) {
                        // обновление квеста если можно
                        const dt = data.trx_info.result
                        const newQuest = JSON.parse(dt)

                        await this.client.setNewQuest(newQuest)
                        quest = await this.client.getQuest()
                        this.questClaimed = false
                        resolve(true)
                    } else {
                        resolve(false)
                    }
                })
            })
            const r = await prm
            return r
        }

        if (quest && quest.claim_date) {
            this.questClaimed = true
            const createdDate = new Date(quest.created_date).getTime() / 1000
            if (currentTimestamp - createdDate > 24 * 60 * 60) {
                await NeWQuest()
            }
        } else {
            this.questClaimed = false
        }

        if (quest && quest.isComplete && !this.questClaimed && !this.claimQuestError && this.config.modeClaimQuest) {
            log && console.log('get reward --------->')
            try {
                let questReward = await this.client.claimReward(quest.id)
                log && console.log('quest was completed --------->', questReward)
                if (questReward) {
                    this.questClaimed = true
                    this.claimQuestError = false
                } else {
                    this.claimQuestError = true
                }
            } catch (e) {
                log && console.log('error', e)
            }
        }

        if (quest || ECR > this.config.ecr) {
            if (!(quest?.completed === quest?.total) && ECR <= this.config.questECR) {
                // start Quest
                this.startQuest = true
            } else {
                this.startQuest = false
            }

            this.client.updatePlayerInfo({
                matchStatus: MATCH_STATUS.MATCHING,
                questClaimed: this.questClaimed,
                quest: quest?.completed,
                maxQuest: quest?.total,
            })
            if (ECR > this.config.ecr && this.config.modePlay) {
                if (this.retryTimeout) {
                    clearTimeout(this.retryTimeout)
                }
                this.retryTimeout = setTimeout(() => {
                    this.CheckCondition()
                }, 1000 * 60 * 5)
                this.client.findMatch('Ranked')
            } else {
                //done
                if (this.retryTimeout) {
                    clearTimeout(this.retryTimeout)
                }
                await this.client.processDone()
                process.exit()
            }
        } else {
            setTimeout(() => {
                this.CheckCondition()
            }, 1000 * 60 * 1)
        }
    }

    OnMessage(m) {
        var message = JSON.parse(m.data)
        if (message && message.server_time) this._server_time_offset = Date.now() - message.server_time
        if (message.id && this[message.id]) this[message.id](message.data)
        if (message.ack)
            this.Send({
                type: 'ack',
                msg_id: message.msg_id,
            })
    }

    OnError(e) {}

    OnClose(e) {
        if (this.player) setTimeout(() => this.Connect(this.player, this.token), 1e3)
    }

    Ping() {
        if (this.ws.readyState !== 3) {
            this.Send({
                type: 'ping',
            })
        }
    }

    Send(message) {
        this.ws.send(JSON.stringify(message))
    }

    match_not_found(data) {
        if (this.client.in_battle) {
            this.client._currentBattle = null
            this.client.in_battle = false
        }
    }

    ecr_update(data) {
        if (!this.client.user) return
        if (!this.client.user.balances) this.client.user.balances = []

        let balance = this.client.user.balances.find((b) => b.token === 'ECR')
        if (!balance) {
            this.client.user.balances.push({
                player: data.player,
                token: 'ECR',
                balance: parseFloat(data.capture_rate),
                last_reward_block: data.last_reward_block,
                last_reward_time: data.last_reward_time,
            })
        } else {
            balance.balance = parseFloat(data.capture_rate)
            balance.last_reward_block = data.last_reward_block
            balance.last_reward_time = data.last_reward_time
        }
        this.balance_update_deferred = true

        // process.send({
        //   time: getFormatedTime(), events: [
        //     {key: 'ecr', value: this.client.getEcr(), param: 'set'},
        //   ]
        // });
    }

    async match_found(data) {
        parentPort.postMessage({
            type: 'INFO_UPDATE',
            status: this.client.status,
            player: this.client.user.name,
            ecr: this.client.getEcr(),
            rating: this.client.getRating(),
            dec: this.client.getBalance('DEC'),
            credits: this.client.getBalance('CREDITS'),
            lastRewardTime: this.client.getLastRewardTime(),
            matchStatus: MATCH_STATUS.MATCHED,
        })

        if (this.client.in_battle && data.status !== 6) {
            this.client._currentBattle = data
            //   this.client.GetDetailEnemyFound(data);
            // send team

            // get posible
            const idMatch = data.id
            const mana_cap = data.mana_cap
            let ruleset = data.ruleset || 'standard'
            const myCards = await this.client.getPlayerCards()
            const ecr = await this.client.getEcr()
            const myCardsUID = await this.client.getPlayerCardsUID()
            const quest = await this.client.getQuest()
            let leaderboard = 0
            if (this.client.user.league) {
                leaderboard = Math.floor((this.client.user.league - 1) / 3)
            }
            ruleset = ruleset.toLowerCase()
            ruleset = ruleset.trim()
            let rules = ruleset.split('|').join(',')
            rules = encodeURIComponent(rules)
            let inactive = data.inactive

            inactive = inactive.trim().toLowerCase().split(',')
            let active = []
            'gold,blue,red,white,green,black'.split(',').forEach((color) => {
                let splinter = activeObj[color]

                if (inactive.includes(color)) {
                    return
                }

                active.push(splinter)
            })
            let myFilteredCards = []
            myCards.forEach((e) => {
                if (!myFilteredCards.includes(e)) {
                    myFilteredCards.push(e)
                }
            })
            const matchDetails = {
                mana: mana_cap,
                rules: rules,
                active: active.join(','),
                myCards: myFilteredCards,
                leaderboard,
            }

            if (this.startQuest && quest) {
                // make the quest
                if (['Snipe', 'Neutral', 'Sneak'].indexOf(quest.splinter) > -1) {
                    matchDetails.quest = quest.splinter
                } else {
                    matchDetails.color = quest.splinter
                }
            }

            this.opponent = data.opponent_player
            const possibleTeams = await ask.possibleTeams({
                matchDetails,
                account: this.client.user.name,
                config: this.client.config,
                ecr,
                spsToken: this.spsToken,
                opponent: data.opponent_player,
            })

            if (possibleTeams && possibleTeams.length) {
                log && console.log('Possible Teams: ', possibleTeams.length)
                let teamToPlay = await ask.teamSelection(possibleTeams, matchDetails, quest)
                const monstersSliced = teamToPlay.cards

                const summoner = `starter-${teamToPlay.summoner}-${generatePassword(5)}`
                const monsters = []

                monstersSliced.map((item) => {
                    if (item !== '') {
                        if (baseCards.indexOf(item) !== -1) {
                            // starter
                            monsters.push(`starter-${item}-${generatePassword(5)}`)
                        } else {
                            // uid
                            monsters.push(this.client.getUIDbyId(myCardsUID, item))
                        }
                    }
                })

                log && console.log('current ECR', this.client.getEcr())
                //TODO Submit Team
                this.client.SubmitTeam(idMatch, null, summoner, monsters, 'Ranked')
                parentPort.postMessage({
                    type: 'INFO_UPDATE',
                    status: this.client.status,
                    player: this.client.user.name,
                    ecr: this.client.getEcr(),
                    rating: this.client.getRating(),
                    dec: this.client.getBalance('DEC'),
                    credits: this.client.getBalance('CREDITS'),
                    lastRewardTime: this.client.getLastRewardTime(),
                    matchStatus: MATCH_STATUS.SUBMITTING,
                })
            } else {
                log && console.log('Empty teams to play:', matchDetails)
                // empty result
                this.client.surrender(idMatch, () => {})
            }
        }
    }

    async battle_result(data) {
        log && console.log('battle_result', data.id, '; winner = ', data.winner)
        this.client._currentBattle = null
        this.client.in_battle = false
        this.client.sendOpponentHistory(this.opponent, this.spsToken)
        this.CheckCondition()

        if (this.client.user.battles === 0) {
            log && console.log('completed_first_battle')
        }
    }

    opponent_submit_team(data) {
        if (
            this.client.in_battle &&
            (!this.client._currentBattle ||
                (![6, 7].includes(this.client._currentBattle.status) && ![6, 7].includes(data.status)))
        ) {
            this.client._currentBattle = data
        }
    }

    system_message(data) {
        log && console.log('system_message', data)
    }

    quest_progress(data) {
        this.client.user.quest = data
    }

    rating_update(data) {
        if (this.client.user) {
            this.client.user.rating = data.new_rating
            this.client.user.league = data.new_league
            if (
                data.new_collection_power !== undefined &&
                this.client.user.collection_power != data.new_collection_power
            ) {
                this.client.user.collection_power = data.new_collection_power
                this.client.user.collection_dirty = true
            }
            if (data.new_max_league !== undefined) {
                this.client.user.season_max_league = data.new_max_league
            }
        }
    }

    balance_update(data) {
        if (!this.client.user) return
        if (data.player != this.client.user.name) return
        if (!this.client.user.balances) this.client.user.balances = []
        let balance = this.client.user.balances.find((b) => b.token == data.token)
        if (!balance)
            this.client.user.balances.push({
                player: data.player,
                token: data.token,
                balance: parseFloat(data.balance_end),
            })
        else {
            balance.balance = parseFloat(data.balance_end)

            // process.send({
            //   time: getFormatedTime(), events: [
            //     {key: 'dec', value: this.client.getBalance('DEC'), param: 'set'},
            //   ]
            // });
        }

        if (data.type === 'dec_reward') {
            this.client.balance_update_deferred = true
            return
        }
    }

    transaction_complete(data) {
        let id = data.sm_id || data.trx_info.id
        var trx = this.client._transactions[id]
        if (trx) {
            if (data.error && !trx.suppressError) {
                // new Noty({
                //     type: "alert",
                //     theme: "sm",
                //     timeout: 3e4,
                //     text: "There was an error completing this transaction: " + data.error
                // }).show()
                log && console.log('There was an error completing this transaction: ' + data.error)
            }
            clearTimeout(trx.timeout)
            if (trx.callback) trx.callback(data)
            delete this.client._transactions[id]
        } else if (!data.trx_info.id.startsWith('sm_'))
            this.client._transactions[id] = {
                status: 'complete',
                data: data,
            }
    }
}

module.exports = WSSplinterlandsClient
