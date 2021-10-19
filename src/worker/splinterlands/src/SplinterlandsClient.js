var steem = require("steem");
const eosjs_ecc = require("eosjs-ecc");
const axios = require("axios").default;
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
};

steem.api.setOptions({
  transport: "http",
  uri: Config.rpc_nodes[0],
  url: Config.rpc_nodes[0],
  useAppbaseApi: true,
});

const quests = [
  { name: "Defend the Borders", element: "life" },
  { name: "Pirate Attacks", element: "water" },
  { name: "High Priority Targets", element: "snipe" },
  { name: "Lyanna's Call", element: "earth" },
  { name: "Stir the Volcano", element: "fire" },
  { name: "Rising Dead", element: "death" },
  { name: "Stubborn Mercenaries", element: "neutral" },
  { name: "Gloridax Revenge", element: "dragon" },
  { name: "Stealth Mission", element: "sneak" },
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
  constructor(proxy) {
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
      return result.cards;
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
      result.cards.map((item) => {
        advancedCards.push(this.getCardId(item));
      });
      return advancedCards;
    } else {
      return [];
    }
  }

  async getSendCards() {
    const advancedCards = [];
    const result = await this.sendRequest(
      `cards/collection/${this.user.name}`,
      { username: this.user.name, token: this.token }
    );

    result.cards.map((item) => {
      advancedCards.push(item.uid);
    });

    return advancedCards;
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

  getRevards() {
    const res = this.sendRequest("players/rewards_revealed", {
      username: this.user.name,
      token: this.token,
    });

    if (res) {
      return res;
    } else {
      return null;
    }
  }

  setNewQuest(data) {
    this.user.quest = data;
    console.log("user: ", this.user);
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
    console.log('submit team')
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
          console.log("sm_submit_team", result.trx_info.id);
        } else {
          if (result) {
            console.log(
              "An error has occurred submitting your team - Error: " +
                result.error
            );
          }
        }
      }
    );
    //if (!submit_and_reveal && !is_swiss)
    // setTimeout(()=>SM.CheckBattleStatus(queue_trx, team), 10 * 1e3);
    // localStorage.setItem("sm_submit_team", JSON.stringify(team))
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
          console.log(
            "Your transaction could not be found. This may be an issue with the game server. Please try refreshing the site to see if the transaction went through."
          );
          delete this._transactions[trx_id];
          if (callback) callback(null);
        }
      }, timeout * 1e3);
    }
  }

  async login(username, posting_key, re) {
    console.log('login====')
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
      console.log(e);
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
      this.user.quest = result.quest;
      this.user.league = result.league
      this.token = result.token;
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
      // console.log(`Set node to ${Config.rpc_nodes[rpc_index]}`)
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
          console.log(
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
      console.log("response && response.id", response && response.id);
      if (response && response.id)
        this.trxLookup(response.id, null, callback, 10);
      else
        console.log(
          `Error sending transaction: ${
            response ? response.error : "Unknown error"
          }`
        );
    }
    console.log(!active_auth || active_auth);
    if (!active_auth || active_auth) {
      try {
        let response = await this.serverBroadcastTx(tx, active_auth);
        console.log("response ------------ > 381", response);
        if (response && response.id)
          return this.trxLookup(response.id, null, callback, 10, supressErrors);
        if (response.error == "user_cancel")
          console.log("Transaction was cancelled.");
        else if (
          response.error &&
          JSON.stringify(response.error).indexOf("Please wait to transact") >= 0
        ) {
          console.log("request delegation");
        } else {
          //setTimeout(()=>SM.BroadcastCustomJsonLocal(id, title, data, callback, 2, supressErrors), 3e3)
        }
      } catch (err) {
        console.log(111, err);
        // SM.BroadcastCustomJsonLocal(id, title, data, callback, 2, supressErrors)
      }
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

          console.log("resultBattleTx", resultBattleTx);

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
          `http://${this.proxy.login}:${this.proxy.pass}@${this.proxy.ip}:${this.proxy.port}`
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
      console.log(e);
      return null;
    }
  }

  async sendRequest(url, params, method = "get") {
    try {
      let objectAxios = {
        method: method,
        url: "https://api2.splinterlands.com/" + url,
        proxy: false,
        // httpsAgent: new HttpsProxyAgent(
        //   `http://${this.proxy.login}:${this.proxy.pass}@${this.proxy.ip}:${this.proxy.port}`
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
      console.log(e);
      return null;
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
              console.log(111111, result.error);
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
      console.log("response", response);
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
      console.log(e);
      return null;
    }
  }

  getBalance(token) {
    for (let i = 0; i < this.user.balances.length; i++) {
      if (this.user.balances[i].token === token) {
        return this.user.balances[i].balance;
      }
    }
    return 0;
  }

  getEcr() {
    if (!this.user) return 0;

    return this.getBalance("ECR") / 100;
  }

  getRating() {
    if (!this.user) return 0;

    return this.user.rating;
  }

  async loginEmail(email, password) {
    let params = {
      email: email,
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
