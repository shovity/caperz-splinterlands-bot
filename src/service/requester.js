const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args))
const HttpsProxyAgent = require('https-proxy-agent');


const requester = {
    setting: {
        header: {
        },
        option: {
            timeout: 30000,
        },
    }
}

const setting = requester.setting


requester.fetch = ({ url, method, body, param, option }) => {
    option = option || {}
    
    const arg = {
        // defaut node-fetch option
        // https://www.npmjs.com/package/node-fetch#options
        ...setting.option,

        method,
        headers: {
            ...setting.header,
            ...option.header,
        }
    }
    if (body) {
        if (option.formData) {
            delete arg.headers['Content-Type']
            arg.body = body
        } else {
            arg.headers['Content-Type'] = 'application/json'
            arg.body = JSON.stringify(body)
        }
    }

    if (option.proxy) {
        arg.agent = new HttpsProxyAgent('http://' + option.proxy)
    }

    if (param) {
        url += (url.indexOf('?') !== 0? '?' : '&')
            + Object.keys(param).map(k => `${encodeURIComponent(k)}=${encodeURIComponent(param[k])}`).join('&')
    }

    return fetch(url, arg).then((res) => {

        if (option.parse === 'text') {
            return res.text()
        }

        return res.json()
    }).then(res => {
        if (res.error) {
            return Promise.reject(res.error)
        }

        return Promise.resolve(res)
    })
}

requester.get = (url, param, option) => {
    return requester.fetch({
        method: 'GET',
        url,
        param,
        option,
    })
}

requester.post = (url, body, option) => {

    return requester.fetch({
        method: 'POST',
        url,
        body,
        option,
    })
}

requester.put = (url, body, option) => {
    
    return requester.fetch({
        method: 'PUT',
        url,
        body,
        option,
    })
}

requester.patch = (url, body, option) => {
    
    return requester.fetch({
        method: 'PATCH',
        url,
        body,
        option,
    })
}

requester.delete = (url, body, option) => {
    
    return requester.fetch({
        method: 'DELETE',
        url,
        body,
        option,
    })
}


module.exports = requester