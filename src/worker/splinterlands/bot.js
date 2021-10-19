const {fork} = require('child_process');
const fs = require('fs');
const WebSocket = require('ws');

// читаем из файла
const data = fs.readFileSync(`./accounts.json`, 'utf8');
let bots = JSON.parse(data);

// const proxyList = fs.readFileSync(`./data.json`, 'utf8');
// let proxies = JSON.parse(proxyList);


// run worker
async function runWorker(path, cb, workerData = null) {
  return new Promise((resolve, reject) => {

    const child = fork(path);

    let firstStart = true;

    child.on('message', (data) => {
      //console.log('get message' ,data);
      if (data === 'start') {
        if (firstStart) {
          //console.log('fork started');
          resolve(child);
          firstStart = false;
        }
      } else {
        cb(data)
      }
    });

    child.send({event: 'start', data: workerData});
  });
}

var d = new Date();
var res = [d.getHours(), d.getMinutes(), d.getSeconds()].map(function (x) {
  return x < 10 ? "0" + x : x
}).join(":")

//init bots
let defaultData = {
  last_update: res,
  time: "13:45:25",
  dec: 0,
  ecr: 0,
  collection_power: 0,
  rating: 0,
  starter: null,
}
for (let i = 0; i < bots.length; i++) {

  bots[i] = {
    ...bots[i],
    ...defaultData
  }
}

let wsExt = null;
const wss = new WebSocket.Server({port: 7339});

wss.on('connection', function connection(ws) {
  wsExt = ws;
  for (let i = 0; i < bots.length; i++) {

    let bot = bots[i]
    // init
    wsExt.send(JSON.stringify({
      data: {
        last_update: bot.last_update,
        time: bot.time,
        account: bot.account,
        // starter: bot.starter,
        status: bot.status,
        starter: bot.starter,
        dec: bot.dec,
        ecr: bot.ecr,
        collection_power: bot.collection_power,
        rating: bot.rating,
      }, i
    }));
  }
});

(async function main() {
  for (let i = 0; i < bots.length; i++) {
    // assing
    let bot = bots[i]
    await runWorker('./index.js', (data) => {
      // update time
      bot.last_update = data.time;
      // for events
      if (data.events) {
        for (let g = 0; g < data.events.length; g++) {
          const event = data.events[g];
          switch (event.param) {
            case "set":
              // if claim successful
              bot[event.key] = event.value;
              break;
          }
        }
      }

      // update
      if (wsExt)
        wsExt.send(JSON.stringify({
          data: {
            last_update: bot.last_update,
            time: bot.time,
            account: bot.account,
            status: bot.status,
            starter: bot.starter,
            dec: bot.dec,
            ecr: bot.ecr,
            collection_power: bot.collection_power,
            rating: bot.rating,
          }, i
        }));
    }, {
      username: bot.username,
      password: bot.password,
      account: bot.account,
      // proxy: {ip: proxies.proxies[i], port: 8000, login: 'ps8537', pass: 'dygxhDuJvtt7bSr7D7sB'},
    });
    // sleep
  }
}())
