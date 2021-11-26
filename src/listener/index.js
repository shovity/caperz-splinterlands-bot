const account = require('./account')
const setting = require('./setting')
const worker = require('./worker')
const user = require('./user')
const table = require('./table')

const listener = (props) => {
    account(props)
    setting(props)
    worker(props)
    user(props)
    table(props)
}


module.exports = listener