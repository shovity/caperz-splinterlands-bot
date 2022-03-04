'use strict'
const fetch = require('node-fetch')

async function getCards() {
    return await fetch('https://api2.splinterlands.com/cards/get_details?v=1582322601277', {
        credentials: 'omit',
        headers: {
            accept: 'application/json, text/javascript, */*; q=0.01',
            'accept-language': 'en-GB,en-US;q=0.9,en;q=0.8',
        },
        referrer: 'https://splinterlands.io/?p=collection&a=a1492dc',
        referrerPolicy: 'no-referrer-when-downgrade',
        body: null,
        method: 'GET',
        mode: 'cors',
    })
        .then((response) => {
            if (!response.ok) {
                throw new Error('Network response was not ok')
            }
            return response
        })
        .then((cards) => {
            return cards.json()
        })
        .catch((error) => {
            console.error('There has been a problem with your fetch operation:', error)
        })
}

const cardByIds = (ids = []) => {
    return getCards()
        .then((inventory) => inventory.filter((card) => ids.includes(card.id)))
        .then((x) =>
            x.map((y) => ({
                id: y.id,
                name: y.name,
                color: y.color,
            }))
        )
        .then((x) => console.log(x))
}

const downloadFunc = () => {
    var promise = Promise.resolve()
    const cards = document.querySelectorAll('.card')
    cards.forEach((card) => {
        promise = promise.then(function () {
            let image = card.querySelector('.card-img')
            fetch(image.src)
                .then((response) => {
                    response.arrayBuffer().then(function (buffer) {
                        const url = window.URL.createObjectURL(new Blob([buffer]))
                        const link = document.createElement('a')
                        link.href = url
                        console.count()
                        link.setAttribute('download', card.id + '.' + image.src.split('.').at(-1)) //or any other extension
                        document.body.appendChild(link)
                        link.click()
                        document.body.removeChild(link)
                    })
                })
                .catch((err) => {
                    console.log(err)
                })
            return new Promise(function (resolve) {
                setTimeout(resolve, 1000)
            })
        })
    })
}
const getJsonFunc = () => {
    var promise = Promise.resolve()
    const res = []
    const cards = document.querySelectorAll('.card')
    cards.forEach((card) => {
        promise = promise.then(function () {
            let image = card.querySelector('.card-img')
            let name = card.querySelector('.card-name-name')
            res.push({
                url: 'src/assets/img/cardList/' + card.id + '.' + image.src.split('.').at(-1),
                name: name.innerText,
                id: card.id,
            })
        })
    })
    return res
}
//example get card id [1,145,167]
//cards([1,145,167]);

exports.cardByIds = cardByIds
