var steem = require("steem");
const eosjs_ecc = require("eosjs-ecc");
const axios = require("axios").default;
const { parentPort } = require('worker_threads')
const qs = require("qs");
var md5 = require("md5");
const HttpsProxyAgent = require("https-proxy-agent");
const Config = {
  api_url: "https://api2.splinterlands.com",
  ws_url: "wss://ws.splinterlands.com",
  external_chain_api_url: "https://ec-api.splinterlands.com",
  tx_broadcast_urls: [
    "https://broadcast.splinterlands.com",
    "https://bcast.splinterlands.com",
  ],
  asset_location: "https://dstm6no41hr55.cloudfront.net/210817/",
  tutorial_asset_location:
    "https://d36mxiodymuqjm.cloudfront.net/website/ui_elements/tutorial/",
  card_image_url: "https://d36mxiodymuqjm.cloudfront.net",
  SE_RPC_URL: "https://api.steem-engine.net/rpc",
  HE_RPC_URL: "https://api.hive-engine.com/rpc",
  version: "0.7.133",
  rpc_nodes: [
    "https://api.hive.blog",
    "https://anyx.io",
    "https://hived.splinterlands.com",
    "https://api.openhive.network",
  ],
  splinterHosts: [
    'https://steemmonsters.com/',
    'https://api2.splinterlands.com/'
  ]
};

const log = true

steem.api.setOptions({
  transport: "http",
  uri: Config.rpc_nodes[0],
  url: Config.rpc_nodes[0],
  useAppbaseApi: true,
});

const ERROR_CODE = {
  INVALID_POSTING_KEY: 'INVALID_POSTING_KEY'
}

const STATUS = {
  ERROR: "ERROR",
  RUNNING: "RUNNING",
  DONE: "DONE",
}

const MATCH_STATUS = {
  MATCHING: 'MATCHING',
  MATCHED: 'MATCHED',
  SUBMITTING: 'SUBMITTING',
}

const TYPE = {
  INFO_UPDATE: "INFO_UPDATE",
  STATUS_UPDATE: "STATUS_UPDATE",
}

const quests = [
  { name: "Defend the Borders", element: "white" },
  { name: "Pirate Attacks", element: "blue" },
  { name: "High Priority Targets", element: "Snipe" },
  { name: "Lyanna's Call", element: "green" },
  { name: "Stir the Volcano", element: "red" },
  { name: "Rising Dead", element: "black" },
  { name: "Stubborn Mercenaries", element: "Neutral" },
  { name: "Gloridax Revenge", element: "gold" },
  { name: "Stealth Mission", element: "Sneak" },
];

steem.config.set(
  "chain_id",
  "beeab0de00000000000000000000000000000000000000000000000000000000"
);

function generatePassword(length, rng) {
  if (!rng) rng = Math.random;
  var charset =
      "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
    retVal = "";
  for (var i = 0, n = charset.length; i < length; ++i) {
    retVal += charset.charAt(Math.floor(rng() * n));
  }
  return retVal;
}

class SplinterLandsClient {
  constructor(proxy, config) {
    this.user = null;
    this.token = null;
    this.settings = null;
    this.key = null;
    this.in_battle = false;
    this._server_time_offset = null;
    this._transactions = {};
    this._currentBattle = null;
    this.balance_update_deferred = false;
    this._browser_id = null;
    this.proxy = proxy || null;
    this.config = config;
    this.gotReward = false
    this.status = ''
  }

  sendMessage = ({player,...data}) => {
    if (!this.user && !player) return;
    if ( !player ) {
      player = this.user.name.toLowerCase() || ''
    }
    parentPort.postMessage({...data, player})
  }

  updatePlayerInfo = (data) => {
    if (!this.user ) return;
    let player = this.user.name.toLowerCase() || ''
    parentPort.postMessage({
      type: "INFO_UPDATE",
      status: this.status,
      player,
      ecr: this.getEcr(),
      rating: this.getRating(),
      dec: this.getBalance("DEC"),
      lastRewardTime: this.getLastRewardTime(),
        matchStatus: MATCH_STATUS.MATCHING,
      ...data
    })
  }

  calculateECR(lastRewardTime = 0, ecr){
    const ONE_MINUTE = 60 * 1000
    const ONE_HOUR = 60 * ONE_MINUTE
    
    const now = Date.now()
    let recoverECR = 0

    if (lastRewardTime) {
        recoverECR = +(((now - lastRewardTime) / ONE_HOUR).toFixed(2))
    }

    return +(recoverECR + ecr).toFixed(2)
  }

  processDone = () => {
    if (!this.user ) return;
    let player = this.user.name.toLowerCase() || ''
    parentPort.postMessage({
      type: TYPE.STATUS_UPDATE,
      status: STATUS.DONE,
      player
    })
  }

  async GetDetailEnemyFound(battle_queue) {
    const result = await this.sendRequest("players/details", {
      name: battle_queue.opponent_player,
      teams: true,
    });

    if (result) {
      return result;
    }
  }

  cancelMatch(callback) {
    this.broadcastCustomJson(
      "sm_cancel_match",
      "Steem Monsters Cancel Match",
      {},
      callback
    );
  }

  surrender(id, callback) {
    this.broadcastCustomJson(
      "sm_surrender",
      "Steem Monsters Surrender Match",
      {
        battle_queue_id: id,
      },
      callback
    );
  }

  async getPlayerCardsUID() {
    const result = await this.sendRequest(
      `cards/collection/${this.user.name}`,
      { username: this.user.name, token: this.token }
    );
    if (result) {
        return result.cards.filter(c => {
        // if (c.delegated_to && c.player === this.user.name && c.player !== c.delegated_to) {
        //   return false
        // }

        if (
          c.unlock_date &&
          new Date(c.unlock_date) >= Date.now()
        ) {
          return false
            }
            
            if (c.player != c.last_used_player && c.last_used_date && ((Date.now() - new Date(c.last_used_date)) < 1000*60*60*24 )) {
                if (c.last_transferred_date && ((Date.now() - new Date(c.last_used_date)) > (Date.now() - new Date(c.last_transferred_date)))) {
                    return false
                }
            }

        return true
      });
    } else {
      return [];
    }
  }

  getUIDbyId(items, id) {
    for (let i = 0; i < items.length; i++) {
      if (items[i].card_detail_id === id) {
        return items[i].uid;
      }
    }
  }

  getCardId = (card) => {
    if (card && card.card_detail_id ) {
      return `${card.card_detail_id}-${card.edition}-${card.gold ? 'g' : 'c'}`
    }
    return ''
  }

  async getPlayerCards() {
    // get basic
    // const basicCards = require("../data/basicCards");
    const advancedCards = [];
    const result = await this.sendRequest(
      `cards/collection/${this.user.name}`,
      { username: this.user.name, token: this.token }
    );

    if (result) {
      result.cards
        .filter(c => {
        //   if (c.delegated_to && c.player === this.user.name && c.player !== c.delegated_to) {
        //     return false
        //   }

          if (
            c.unlock_date &&
            new Date(c.unlock_date) >= Date.now()
          ) {
            return false
          }

            if (c.last_used_date && ((Date.now() - new Date(c.last_used_date)) < 1000*60*60*24 )) {
                if (c.last_transferred_date && ((Date.now() - new Date(c.last_used_date)) > (Date.now() - new Date(c.last_transferred_date)))) {
                    return false
                }
            }
          return true
        })
        .map((item) => {
          advancedCards.push(this.getCardId(item));
        });
      return advancedCards;
    } else {
      return [];
    }
  }

  async getSendCards() {
    try {
      const advancedCards = [];
      const result = await this.sendRequest(
        `cards/collection/${this.user.name}`,
        { username: this.user.name, token: this.token }
      );

      result.cards.map((item) => {
        advancedCards.push(item.uid);
      });

      if ( advancedCards.length > 0) {
        this.advancedCards = advancedCards
      }
      return advancedCards;
    }
    catch (e) {
      return this.advancedCards
    }
  }

  GiftCards(card_ids, recipient, callback) {
    var obj = {
      to: recipient,
      cards: card_ids,
    };
    this.broadcastCustomJson("sm_gift_cards", "Gift Cards", obj, (result) => {
      if (callback) callback(result);
    });
  }

  TransferDEC(to, qty, data, callback) {
    var obj = {
      to: to,
      qty: qty,
      token: "DEC",
    };
    if (data) obj = Object.assign(obj, data);
    this.broadcastCustomJson(
      "sm_token_transfer",
      "Transfer DEC",
      obj,
      (result) => {
        if (callback) callback(result);
      }
    );
  }

  getRewards() {
    try {
      const res = this.sendRequest("players/rewards_revealed", {
        username: this.user.name,
        token: this.token,
      });

      if (res) {
        return res;
        this.gotReward = true
      } else {
        return null;
      }
    }
    catch (e) {
      return null
    }
  }

  setNewQuest(data) {
    this.user.quest = data;
    log && console.log("user: ", this.user);
  }

  getUserName() {
    if (!this.user) {
      return null;
    }

    if (this.user) {
      return this.user.name;
    }
  }

  getQuest() {
    if (!this.user) return null;

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
        isComplete: this.user.quest.completed_items/this.user.quest.total_items === 1
      };

      return quest;
    } else {
      return null;
    }
  }

  StartDailyQuest(callback) {
    this.broadcastCustomJson(
      "sm_start_quest",
      "Start Quest",
      {
        type: "daily",
      },
      callback
    );
  }

  RefreshDailyQuest(callback) {
    this.broadcastCustomJson(
      "sm_refresh_quest",
      "Steem Monsters Refresh Quest",
      {
        type: "daily",
      },
      callback
    );
  }

  getElementQuest(questName) {
    const playerQuest = quests.find((quest) => quest.name === questName);
    return playerQuest.element;
  }

  async SubmitTeam(
    queue_trx,
    submit_expiration_date,
    summoner,
    monsters,
    match_type,
    extra_data
  ) {
    log && console.log('submit team')
    var secret = generatePassword(10);
    var team_hash = md5(summoner + "," + monsters.join() + "," + secret);
    var team = {
      summoner: summoner,
      monsters: monsters,
      secret: secret,
    };
    // var is_swiss = extra_data && extra_data.format && extra_data.format === "swiss";
    var data = {
      trx_id: queue_trx,
      team_hash: team_hash,
    };
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
    //         console.log("There was an error submitting your team, please try again. Error: " + (team_result ? team_result.error : "unknown"));
    //         return
    //     }
    // } else if (submit_and_reveal) {
    //     data.summoner = team.summoner;
    //     data.monsters = team.monsters;
    //     data.secret = team.secret
    // }
    data.summoner = team.summoner;
    data.monsters = team.monsters;
    data.secret = team.secret;

    this.broadcastCustomJson(
      "sm_submit_team",
      "Steem Monsters Submit Team",
      data,
      (result) => {
        if (
          result &&
          !result.error &&
          result.trx_info &&
          result.trx_info.success
        ) {
          log && console.log("sm_submit_team", result.trx_info.id);
        } else {
          if (result) {
            log && console.log(
              "An error has occurred submitting your team - Error: " +
                result.error
            );
          }
        }
      }
    );
  }

  getRuleset(ruleset) {
    return this.settings.battles.rulesets.find((r) => r.name == ruleset) || {};
  }

  removeTxPrefix(tx_name) {
    return tx_name.replace(
      this.settings.test_mode ? `${this.settings.prefix}sm_` : "sm_",
      ""
    );
  }

  trxLookup(trx_id, details, callback, retries, suppressError, timeout) {

    if (this._transactions[trx_id]) {
      if (this._transactions[trx_id].status == "complete") {
        if (callback) callback(this._transactions[trx_id].data);
        delete this._transactions[trx_id];
      }
      return;
    }
    if (timeout == null || timeout == undefined) timeout = 60;
    this._transactions[trx_id] = {
      details: details,
      callback: callback,
      suppressError: suppressError,
    };
    if (timeout > 0) {
      this._transactions[trx_id].timeout = setTimeout(() => {
        if (
          this._transactions[trx_id] &&
          this._transactions[trx_id].status != "complete"
        ) {
          log && console.log(
            "Your transaction could not be found. This may be an issue with the game server. Please try refreshing the site to see if the transaction went through."
          );
          delete this._transactions[trx_id];
          if (callback) callback(null);
        }
      }, timeout * 1e3);
    }
  }

  async login(username, posting_key, re) {
    log && console.log('login====')
    const browserId = "bid_" + generatePassword(20);
    const sessionId = "sid_" + generatePassword(20);

    this._browser_id = browserId;

    let params = {
      name: username.toLowerCase(),
      ref: "",
      browser_id: browserId,
      session_id: sessionId,
      ts: Date.now(),
    };

    try {
      steem.auth.wifToPublic(posting_key);
    } catch (e) {
      log && console.log(e);
      this.sendMessage({
        player: username.toLowerCase(),
        status: STATUS.ERROR,
        message: "Posting key invalid",
        code: ERROR_CODE.INVALID_POSTING_KEY
      })
    }
    params.sig = eosjs_ecc.sign(username + params.ts, posting_key);

    this.key = posting_key;

    const result = await this.sendRequest("players/login", params);

    if (result && !!re === false) {
      this.user = result;
      this.token = result.token;
      this.user.league = result.league
      return result;
    } else {
      this.user = {
        ...this.user,
        quest: result?.quest,
        league: result?.league,
      }.quest = result?.quest;
      this.token = result?.token;
    }
  }

  async updateSettings() {
    const result = await this.sendRequest("settings", {
      token: this.token,
      username: this.user.username,
    });

    this.settings = result;

    if (
      this.settings.rpc_nodes &&
      Array.isArray(this.settings.rpc_nodes) &&
      this.settings.rpc_nodes.length > 0
    ) {
      Config.rpc_nodes = this.settings.rpc_nodes.filter((n) =>
        n.startsWith("https://")
      );
      let rpc_index = 0;
      if (Config.rpc_nodes.length > 1)
        rpc_index = Math.floor(Math.random() * 2);
      steem.api.setOptions({
        transport: "http",
        uri: Config.rpc_nodes[rpc_index],
        url: Config.rpc_nodes[rpc_index],
        useAppbaseApi: true,
      });
      log && console.log(`Set node to ${Config.rpc_nodes[rpc_index]}`)
    }

    return result;
  }

  async UpdatePlayerInfo() {
    if (!this.user) return;

    const res = await this.sendRequestUrl(
      `https://api2.splinterlands.com/players/details`,
      {
        name: this.user.name,
      }
    );

    this.user = Object.assign(this.user, res);
  }

  async broadcastCustomJson(id, title, data, callback, retries, supressErrors) {
    if (this.settings.test_mode && !id.startsWith(this.settings.prefix))
      id = this.settings.prefix + id;

    let active_auth =
      this.user.require_active_auth &&
      this.settings.active_auth_ops.includes(id.slice(id.indexOf("sm_") + 3));

    data.app = "steemmonsters/" + this.settings.version;
    data.n = generatePassword(10);
    if (this.settings.test_mode) data.app = this.settings.prefix + data.app;

    let bcast_url =
      Config.tx_broadcast_urls[
        Math.floor(Math.random() * Config.tx_broadcast_urls.length)
      ];
    let tx = {
      operations: [
        [
          "custom_json",
          {
            required_auths: active_auth ? [this.user.name] : [],
            required_posting_auths: active_auth ? [] : [this.user.name],
            id: id,
            json: JSON.stringify(data),
          },
        ],
      ],
    };

    if (this.user.use_proxy) {
      let op_name = this.removeTxPrefix(id);
      if (this.settings.api_ops.includes(op_name)) {
        const response = await this.sendRequestUrl(
          `${Config.api_url}/battle/battle_tx`,
          {
            signed_tx: JSON.stringify(tx),
          },
          "post"
        );

        if (response && response.id)
          this.trxLookup(response.id, null, callback, 10, supressErrors);
        else
          log && console.log(
            `Error sending transaction: ${
              response ? response.error : "Unknown error"
            }`
          );

        return;
      }

      const response = await this.sendRequestUrl(
        `${bcast_url}/proxy`,
        {
          player: this.user.name,
          access_token: this.token,
          id: id,
          json: data,
        },
        "post"
      );
      log && console.log("response && response.id", response && response.id);
      if (response && response.id) {
        // this.trxLookup(response.id, null, callback, 10);
      } else {
        log && console.log(
          `Error sending transaction: ${
            response ? response.error : "Unknown error"
          }`
        );
      }
    }
    log && console.log(!active_auth || active_auth);
    if (!active_auth || active_auth) {
      try {
        let response = await this.serverBroadcastTx(tx, active_auth);
        log && console.log("response ------------ > 381", response);
        if (response && response.id)
          return this.trxLookup(response.id, null, callback, 10, supressErrors);
        if (response.error == "user_cancel") {
          log && console.log("Transaction was cancelled.");
        }
        else if (
          response.error &&
          JSON.stringify(response.error).indexOf("Please wait to transact") >= 0
        ) {
          log && console.log("request delegation");
        } else {
            console.log('run claim reward')
          setTimeout(()=>this.broadcastCustomJsonLocal(id, title, data, callback, 2, supressErrors), 3e3)
        }
      } catch (err) {
        log && console.log(111, err);
        this.broadcastCustomJsonLocal(id, title, data, callback, 2, supressErrors)
      }
    }
    }
    async broadcastCustomJsonLocal(id, title, data, callback, retries, supressErrors) {
        if (this.settings.test_mode && !id.startsWith(this.settings.prefix))
            id = this.settings.prefix + id;
        let active_auth = this.user.require_active_auth && this.settings.active_auth_ops.includes(id.slice(id.indexOf("sm_") + 3));
        data.app = "splinterlands/" + Config.version;
        if (this.settings.test_mode)
            data.app = this.settings.prefix + data.app;
        if (isNaN(retries))
            retries = 2;
        let bcast_url = Config.tx_broadcast_urls[Math.floor(Math.random() * Config.tx_broadcast_urls.length)];
        if (this.user.use_proxy) {
            jQuery.post(`${bcast_url}/proxy`, {
                player: this.user.name,
                access_token: this.user.token,
                id: id,
                json: data
            }, response=>{
                if (response && response.id)
                    this.trxLookup(response.id, false, null, callback, 10, supressErrors);
                // else
                //     alert(`Error sending transaction: ${response ? response.error : "Unknown error"}`)
            }
            );
            return
        }
        if (this._use_keychain || active_auth && window.hive_keychain) {
            let rpc_node = Config.rpc_nodes[this._rpc_index % Config.rpc_nodes.length];
            hive_keychain.requestCustomJson(this.user.name, id, active_auth ? "Active" : "Posting", JSON.stringify(data), title, function(response) {
                if (response.success) {
                    this.trxLookup(response.result.id, false, null, callback, 10, supressErrors)
                } else {
                    if (response.error == "user_cancel")
                        alert("Transaction was cancelled.");
                    else if (response.error && JSON.stringify(response.error).indexOf("Please wait to transact") >= 0) {
                        // this.RequestDelegation(id, title, data, callback, retries);
                        log && console.log("request delegation 12");
                        return
                    } else if (response.error != "ignored" && retries > 0) {
                        rpc_node = Config.rpc_nodes[++this._rpc_index % Config.rpc_nodes.length];
                        steem.api.setOptions({
                            transport: "http",
                            uri: rpc_node,
                            url: rpc_node,
                            useAppbaseApi: true
                        });
                        console.log(`SWITCHED TO NEW RPC NODE: ${rpc_node}`);
                        console.log("Retrying failed keychain transaction...");
                        setTimeout(()=>this.broadcastCustomJsonLocal(id, title, data, callback, retries - 1, supressErrors), 3e3);
                        return
                    } else if (!supressErrors) {
                        alert(`There was an error publishing this transaction to the Hive blockchain. Please check to see if it went through or try again in a few minutes. Error: ${response && response.error ? response.error : "Unknown"}`)
                    }
                    this.LogEvent("custom_json_failed", {
                        response: JSON.stringify(response)
                    });
                    if (callback)
                        callback(response)
                }
            }, rpc_node)
        } else {
            if (active_auth) {
                let callback_id = `cb_${generatePassword(10)}`;
                this._active_auth_tx_callbacks[callback_id] = callback;
                this.ShowDialog("active_auth", {
                    id: id,
                    title: title,
                    data: data,
                    callback_id: callback_id
                });
                return
            }
            var that = this
            steem.broadcast.customJson(this.key, [], [this.user.name], id, JSON.stringify(data), (err, result) => {
                if (result && !err) {
                    that.trxLookup(result.id, false, null, callback, 10, supressErrors)
                } else {
                    if (err && JSON.stringify(err).indexOf("Please wait to transact") >= 0) {
                        // this.RequestDelegation(id, title, data, callback, retries);
                        log && console.log("request delegation 123");
                        return
                    } else if (retries > 0) {
                        let rpc_node = Config.rpc_nodes[++that._rpc_index % Config.rpc_nodes.length];
                        steem.api.setOptions({
                            transport: "http",
                            uri: rpc_node,
                            url: rpc_node,
                            useAppbaseApi: true
                        });
                        console.log(`SWITCHED TO NEW RPC NODE: ${rpc_node}`);
                        setTimeout(()=>that.broadcastCustomJsonLocal(id, title, data, callback, retries - 1, supressErrors), 3e3);
                        return
                    } else if (!supressErrors) {
                        alert("There was an error publishing this transaction to the Hive blockchain. Please try again in a few minutes. Error: " + err)
                    }
                    that.LogEvent("custom_json_failed", {
                        response: JSON.stringify(err)
                    });
                    if (callback)
                        callback(result)
                }
            })
        }
    }

  prepareTx(tx) {
    return Object.assign(
      {
        ref_block_num: this.settings.chain_props.ref_block_num & 65535,
        ref_block_prefix: this.settings.chain_props.ref_block_prefix,
        expiration: new Date(
          new Date(this.settings.chain_props.time + "Z").getTime() + 600 * 1e3
        ),
      },
      tx
    );
  }

  async signTx(tx, use_active) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!tx.expiration) tx = this.prepareTx(tx);

        let signed_tx = null;

        let key = this.key;
        if (!key)
          return reject({
            error: "Key not found.",
          });

        signed_tx = steem.auth.signTransaction(tx, [key]);
        signed_tx.expiration = signed_tx.expiration.split(".")[0];
        resolve(signed_tx);
      } catch (err) {
        reject(err);
      }
    });
  }

  async serverBroadcastTx(tx, use_active) {
    return new Promise(async (resolve, reject) => {
      try {
        let signed_tx = await this.signTx(tx, use_active);
        if (!signed_tx) return;
        let op_name = this.removeTxPrefix(tx.operations[0][1].id);
        if (this.settings.api_ops && this.settings.api_ops.includes(op_name)) {
          const resultBattleTx = await this.sendRequest(
            "battle/battle_tx",
            {
              signed_tx: JSON.stringify(signed_tx),
            },
            "post"
          );

          log && console.log("resultBattleTx", resultBattleTx);

          if (resultBattleTx) {
            resolve(resultBattleTx);
          } else {
            reject(resultBattleTx);
          }
          return;
        }
        let bcast_url =
          Config.tx_broadcast_urls[
            Math.floor(Math.random() * Config.tx_broadcast_urls.length)
          ];

        const dataSend = this.sendRequestUrl(
          `${bcast_url}/send`,
          {
            signed_tx: JSON.stringify(signed_tx),
          },
          "post"
        );

        if (dataSend) {
          resolve(dataSend);
        } else {
          reject(null);
        }
      } catch (err) {
        reject(err);
      }
    });
  }

  async getBattleResult() {
    // battle/result
    const params = {
      id,
      token,
      username,
    };
  }

  async claimReward(type, data, callback) {
    // type quest
    // quest id

    var obj = Object.assign(
      {
        type: type,
      },
      data
      );
    this.broadcastCustomJson(
      "sm_claim_reward",
      "Steem Monsters Reward Claim",
      obj,
      callback
    );
  }

  async auth(username, token) {
    // players/authenticate
    const params = {
      username,
      token,
    };

    return await this.sendRequest("players/authenticate", params);
  }

  async sendRequestUrl(url, params, method = "get") {
    try {
      let objectAxios = {
        method: method,
        url: url,
        proxy: false,
        timeout: 10000,
        headers: {
          authority: "api2.splinterlands.com",
          method: method.toUpperCase(),
          path: url,
          scheme: "https",
          accept:
            method === "post"
              ? "*/*"
              : "application/json, text/javascript, */*; q=0.01",
          "accept-encoding": "gzip, deflate, br",
          "accept-language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
          "content-type":
            method === "post" ? "application/x-www-form-urlencoded" : "",
          origin: "https://splinterlands.com",
          referer: "https://splinterlands.com",
          "sec-ch-ua":
            '" Not A;Brand";v="99", "Chromium";v="90", "Google Chrome";v="90"',
          "sec-ch-ua-mobile": "?0",
          "sec-fetch-dest": "empty",
          "sec-fetch-mode": "cors",
          "sec-fetch-site": "same-origin",
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.93 Safari/537.36",
        },
      };

      if ( this.proxy ) {
        objectAxios.proxy = true
        objectAxios.httpsAgent = new HttpsProxyAgent(
          `${this.proxy}`
        )
      }

      if (method === "get") {
        params.v = new Date().getTime();
        objectAxios.params = params;
      } else {
        objectAxios.data = qs.stringify(params);
      }

      let res = await axios(objectAxios);

      return res.data;
    } catch (e) {
      log && console.log(e);
      return null;
    }
  }

  async sendRequest(url, params, method = "get") {
    let host = 'https://api2.splinterlands.com/'

    if (host === 'players/details') {
      host = Config.splinterHosts[Math.floor(Math.random() * 2)]
    }
    try {
        let objectAxios = {
            method: method,
            url: host + url,
            proxy: false,
            // httpsAgent: new HttpsProxyAgent(
            //   `http://${this.proxy.login}:${this.proxy.pass}@${this.proxy.ip}:${this.proxy.port}`
            // ),
            timeout: 10000,
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

  async findMatch(match_type, opponent, settings) {
    this.in_battle = true;
    return new Promise((resolve, reject) => {
      this.broadcastCustomJson(
        "sm_find_match",
        "Steem Monsters Find Match",
        {
          match_type: match_type,
          opponent: opponent,
          settings: settings,
        },
        (result) => {
          if (result && !result.error && result.trx_info && result.trx_info.success) {
            resolve(result);
          }
          else if (result) {
            if (result && result.error && result.error.indexOf("Please refresh the page to resume") >= 0) {
              this.in_battle = false;
            }
            else {
              if (result.error) {
                this.in_battle = false;
              }
            }
            resolve(null);
          }
          else {
            resolve(null);
          }
        }
      );
    });
  }

  async CreateAccountEmail(email, password, proxy, subscribe, is_test) {
    email = email.toLowerCase();
    let password_pub_key = steem.auth.getPrivateKeys(
      email,
      password
    ).ownerPubkey;
    let params = {
      purchase_id: "new-" + generatePassword(6),
      email: email,
      password_pub_key: password_pub_key,
      subscribe: subscribe,
      is_test: is_test,
      ref: "vanz-2008",
      ref_url: "",
      browser_id: this._browser_id,
    };

    const response = await this.sendRequestProxy(
      "players/create_email",
      params,
      "get",
      proxy
    );

    if (response && !response.error) {
      log && console.log("response", response);
    }
    return response;
  }

  async sendRequestProxy(url, params, method = "get", proxy) {
    try {
      let objectAxios = {
        method: method,
        url: "https://api2.splinterlands.com/" + url,
        proxy: false,
        // httpsAgent: new HttpsProxyAgent(
        //   `http://${proxy.login}:${proxy.pass}@${proxy.ip}:${proxy.port}`
        // ),
        timeout: 10000,
        headers: {
          authority: "api2.splinterlands.com",
          method: method.toUpperCase(),
          path: url,
          scheme: "https",
          accept:
            method === "post"
              ? "*/*"
              : "application/json, text/javascript, */*; q=0.01",
          "accept-encoding": "gzip, deflate, br",
          "accept-language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
          "content-type":
            method === "post" ? "application/x-www-form-urlencoded" : "",
          origin: "https://splinterlands.com",
          referer: "https://splinterlands.com",
          "sec-ch-ua":
            '" Not A;Brand";v="99", "Chromium";v="90", "Google Chrome";v="90"',
          "sec-ch-ua-mobile": "?0",
          "sec-fetch-dest": "empty",
          "sec-fetch-mode": "cors",
          "sec-fetch-site": "same-origin",
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.93 Safari/537.36",
        },
      };

      if (method === "get") {
        params.v = new Date().getTime();
        objectAxios.params = params;
      } else {
        objectAxios.data = qs.stringify(params);
      }

      let res = await axios(objectAxios);

      return res.data;
    } catch (e) {
      log && console.log(e);
      return null;
    }
  }

    getBalance(token) {
        if (!this.user.balances) {
            console.log(this.user)
            return 0;
        }
    for (let i = 0; i < this.user.balances.length; i++) {
      if (this.user.balances[i].token === token) {
        return this.user.balances[i].balance;
      }
    }
    return 0;
  }

  getEcr() {
    if (!this.user) return 0;

    const ecr = this.getBalance("ECR") / 100
    const lastRewardTime = new Date(this.user.balances.find((b) => b.token == 'ECR').last_reward_time).getTime()

    return this.calculateECR(lastRewardTime, ecr)
  }

  getRating() {
    if (!this.user) return 0;

    return this.user.rating;
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
    };

    let password_key = steem.auth.getPrivateKeys(email, password).owner;

    params.ts = Date.now();
    params.sig = eosjs_ecc.sign((email + params.ts).toString(), password_key);

    // send to api login through email

    const result = await this.sendRequest("players/login_email", params);

    if (result) {
      return result;
    }
  }
}
module.exports = SplinterLandsClient;
