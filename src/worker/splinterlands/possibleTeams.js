const requester = require('../../service/requester')
const basicCards = require('./data/basicCards.js')

let availabilityCheck = (myCards, team) => {
    let baseCards = basicCards.map((card) => getCardIdFromString(card).id)
    let cards = myCards.concat(baseCards)
    cards.push('')
    let teamCards = team.slice(0, 7)
    return teamCards.every((v) => cards.includes(v))
}

const log = false

const getBattlesWithRuleset = (matchDetails, account, spsToken, opponent) => {
    matchDetails.rules = encodeURIComponent(matchDetails.rules)
    matchDetails.player = account
    let params = `rules=${matchDetails.rules}`
    params += `&leaderboard=${matchDetails.leaderboard}`
    params += `&cards=${matchDetails.cards}`
    params += `&active=${matchDetails.active}`
    params += `&mana_cap=${matchDetails.mana_cap}`
    params += `&player=${account}`
    if (matchDetails.color) {
        params += `&color=${matchDetails.color}`
    }
    if (matchDetails.quest) {
        params += `&quest=${matchDetails.quest}`
    }
    if (opponent) {
        params += `&opponent=${opponent}`
    }
    const host = 'https://nftauto.online/'
    const url = `api/v2/splinterlands/teams?${params}`
    // console.log('API call: ', host+url)
    log && console.log('token header', spsToken)
    return requester.get(
        host + url,
        {},
        {
            header: {
                authorization: spsToken,
            },
        }
    )
}

const defaultDataForNoTeams = {
    fire: 'red_1_12_167-4-c::157-4-c:159-1-c',
    water: 'blue_0_12_437-7-c::168-4-c:169-4-c',
    earth: 'green_0_12_189-4-c::179-4-c:180-4-c',
    death: 'black_1_12_156-4-c::135-4-c:136-4-c',
    life: 'white_0_12_145-4-c::146-4-c:147-4-c',
    dragon: 'gold_0_12_224-4-c::190-4-c:191-4-c',

    red: 'red_1_12_167-4-c::157-4-c:159-1-c',
    blue: 'blue_0_12_437-7-c::168-4-c:169-4-c',
    green: 'green_0_12_189-4-c::179-4-c:180-4-c',
    black: 'black_1_12_156-4-c::135-4-c:136-4-c',
    white: 'white_0_12_145-4-c::146-4-c:147-4-c',
    gold: 'gold_0_12_224-4-c::190-4-c:191-4-c',
}

const getTeamDefault = (matchDetails) => {
    let rs = []
    if (matchDetails.active.length > 0) {
        matchDetails.active.split(',').forEach((splinter) => {
            if (defaultDataForNoTeams[splinter]) {
                rs.push(defaultDataForNoTeams[splinter])
            }
        })
    }
    return rs
}

const getTeamsFromAPI = async (matchDetails, account, config, ecr, spsToken, opponent) => {
    try {
        const { data } = await getBattlesWithRuleset(matchDetails, account, spsToken, opponent)
        const cards = matchDetails.cards.split(',')
        log && console.log('matchDetails', matchDetails)
        log && console.log('data', data)

        if (data && data.length > 0) {
            return data.map((d) => {
                const cardsNum = (d.match(/-/g) || []).length / 2
                if (cards.includes('131-3-c') && !d.includes('131-3-c') && cardsNum < 7) {
                    const newData = d.split('::')
                    return newData[0] + '::' + '131-3-c:' + newData[1]
                } else {
                    return d
                }
            })
        } else {
            return getTeamDefault(matchDetails)
        }
    } catch (e) {
        console.log('getTeamsFromAPI error',e)
        return getTeamDefault(matchDetails)
    }
}

//27-1-c
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

// example "green_0_20_27-1-c::180-4-c:29-1-c:179-4-c:185-4-c:24-1-c"
const getTeamFromString = (str) => {
    let data = {
        summoner: {},
        monsters: [],
        color: '',
    }
    let arr = str.split('_')
    if (arr && arr.length > 0) {
        let color = arr[0]
        let rex = new RegExp(/^[a-z]/)
        if (!rex.test(color)) {
            color = ''
        }
        let match = arr[arr.length - 1]
        //27-1-c::180-4-c:29-1-c:179-4-c:185-4-c:24-1-c
        let [summoner, monsters] = match.split('::')
        monsters = monsters.split(':')
        let team = []
        if (monsters.length > 0) {
            monsters.forEach((mon) => {
                let obj = getCardIdFromString(mon)
                //{id, edition}
                if (obj.id) {
                    team.push(obj)
                }
            })
        }
        if (summoner && monsters.length > 0) {
            data = {
                summoner: getCardIdFromString(summoner),
                monsters: team,
                color,
            }
        }
    }
    return data
}

const cardsIdsforSelectedBattles = (matchDetails, account, config, ecr, spsToken, opponent) =>
    getTeamsFromAPI(matchDetails, account, config, ecr, spsToken, opponent).then((x) => {
        return x.map((team) => {
            let teamData = getTeamFromString(team)
            let arr = new Array(8).fill('')
            if (teamData.summoner.id) {
                arr[0] = teamData.summoner.id
            }
            if (teamData.monsters.length > 0) {
                teamData.monsters.forEach((mon, index) => {
                    arr[index + 1] = mon.id ? mon.id : ''
                })
            }
            arr[7] = teamData.color

            return arr
        })
    })

const askFormation = function ({ matchDetails, account, config, ecr, spsToken, opponent }) {
    const cards = matchDetails.myCards || basicCards
    let cardIds = cards.map((card) => (card.split('-')[0] ? +card.split('-')[0] : ''))

    matchDetails.cards = cards.join(',')
    matchDetails.mana_cap = matchDetails.mana
    delete matchDetails.myCards
    //arr(8) = [sum, team(6), color]
    //[ 145, 50, 51, 52, 141, '', '', 'black' ]
    return cardsIdsforSelectedBattles(matchDetails, account, config, ecr, spsToken, opponent).then(
        (x) => x.filter((team) => availabilityCheck(cardIds, team)).map((element) => element) //cards.cardByIds(element)
    )
}

const possibleTeams = async ({ matchDetails, account, config, ecr, spsToken, opponent }) => {
    let possibleTeams = []
    possibleTeams = await askFormation({ matchDetails, account, config, ecr, spsToken, opponent })

    if (possibleTeams.length > 0) {
        return possibleTeams
    }
    return possibleTeams
}

const teamSelection = async (possibleTeams, matchDetails, quest) => {
    //check if daily quest is not completed
    if (possibleTeams.length > 0) {
        let team = possibleTeams[0]
        // const filteredTeams = possibleTeams.filter(team=> team[7] !== 'gold')
        const filteredTeams = possibleTeams

        if (filteredTeams.length > 0) {
            team = filteredTeams[0]
        }

        let summoner = team[0]
        let arr = team.slice(1, 7)
        return { summoner, cards: arr, color: team[team.length - 1] }
    }

    throw new Error('NO TEAM available to be played.')
}

module.exports.possibleTeams = possibleTeams
module.exports.teamSelection = teamSelection

// const summoners = history.map(x => x.summoner_id);

// // console.log([...new Set(summoners)])
// console.log(summonerColor(27))

// // TO TEST uncomment below:
// const matchDetails = { mana: 30, rules: '', active: ['fire','water','life','earth','death'],
//     cards: ['242-3-c', '248-3-c', '250-3-c', '251-3-c', '281-3-c', '331-3-c', '334-3-c', '334-3-c', '337-3-c', '337-3-c', '337-3-c', '338-3-c', '340-3-c', '340-3-c', '340-3-c', '345-3-c', '345-3-c', '345-3-c', '345-3-c', '346-3-c', '347-3-c', '349-3-c', '349-3-c', '349-3-c', '349-3-c']
// }
// console.log(possibleTeams(matchDetails))
