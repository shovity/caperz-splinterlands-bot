const SplinterLandsClient = require('./src/SplinterlandsClient');
const WSSplinterlandsClient = require('./src/SplinterlandsClientWS');

function getFormatedTime() {
  var d = new Date();
  var res = [d.getHours(), d.getMinutes(), d.getSeconds()].map(function (x) {
    return x < 10 ? "0" + x : x
  }).join(":")

  return res;
}

let username, password, account, emailPass, proxy;

async function main() {
  // create new client

  process.send('start');
  process.send({
    time: getFormatedTime(), events: [
      {key: 'status', value: `START`, param: 'set'},
    ]
  });

  const api = new SplinterLandsClient(proxy);
  // const data = await api.login(username, password, false);
  // console.log(data)
  if (username && password) {
    const user = await api.login(username, password);
    // auth
    const resAuth = await api.auth(user.name, user.token);

    if (resAuth && resAuth.success) {
      console.log('success login', user.name, api.getEcr(), api.getBalance('DEC'));

      process.send({
        time: getFormatedTime(), events: [
          {key: 'dec', value: api.getBalance('DEC'), param: 'set'},
          {key: 'ecr', value: api.getEcr(), param: 'set'},
          {key: 'collection_power', value: user.collection_power, param: 'set'},
          {key: 'rating', value: user.rating, param: 'set'},
          {key: 'starter', value: user.starter_pack_purchase, param: 'set'},
        ]
      });
      // update settings
      await api.updateSettings();

      if (api.user.starter_pack_purchase) {

        const getUserQuestNew = async () => {
          return await api.login(username, password, true);
        }

        const WSApi = new WSSplinterlandsClient(api, proxy, getUserQuestNew);
        WSApi.Connect(user.name, user.token);

      }
    }
  }
}

process.on('message', (message) => {
  if (message.event === 'start') {
    // set
    console.log(`process.on('message'`, message)
    username = message.data.username;
    password = message.data.password;
    account = message.data.account;
    proxy = message.data.proxy;
    main();
  }
});