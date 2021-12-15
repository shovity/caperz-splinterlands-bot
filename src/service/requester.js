const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args))
const HttpsProxyAgent = require('https-proxy-agent')
const SocksProxyAgent = require('socks-proxy-agent')
// process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;


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


requester.fetch = async ({ url, method, body, param, option }) => {
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
        if (option.proxy) {
            switch (option.proxy.protocol) {
                case 'https':
                    arg.agent = new HttpsProxyAgent('http://' + option.proxy.url)
                    break
                case 'socks5':
                    arg.agent = new SocksProxyAgent(option.proxy.protocol + '://' + option.proxy.url)
                    break
                case 'socks4':
                    arg.agent = new SocksProxyAgent(option.proxy.protocol + '://' + option.proxy.url)
                    break            
                case 'http':
                    arg.agent = new HttpsProxyAgent(option.proxy.protocol + '://' + option.proxy.url)
                    break
                default:
                    arg.agent = new HttpsProxyAgent('http://' + option.proxy.url)
            }
        }
    }

    if (param) {
        url += (url.indexOf('?') !== 0? '?' : '&')
            + Object.keys(param).map(k => `${encodeURIComponent(k)}=${encodeURIComponent(param[k])}`).join('&')
    }

    const res = await fetch(url, arg)

    if (!res.ok) {
        throw new Error(res)
    }

    const data = await res.json()

    return data
}

requester.get = async (url, param, option) => {
    return requester.fetch({
        method: 'GET',
        url,
        param,
        option,
    })
}

requester.post = async (url, body, option) => {

    return requester.fetch({
        method: 'POST',
        url,
        body,
        option,
    })
}

requester.put = async (url, body, option) => {
    
    return requester.fetch({
        method: 'PUT',
        url,
        body,
        option,
    })
}

requester.patch = async (url, body, option) => {
    
    return requester.fetch({
        method: 'PATCH',
        url,
        body,
        option,
    })
}

requester.delete = async (url, body, option) => {
    
    return requester.fetch({
        method: 'DELETE',
        url,
        body,
        option,
    })
}


module.exports = requester