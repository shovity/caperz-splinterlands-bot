const fetch = require("node-fetch");
const basicCards = require('./data/basicCards.js');

let availabilityCheck = (myCards, team) => {
    let baseCards = basicCards.map(card => getCardIdFromString(card).id)
    let cards = myCards.concat(baseCards)
    cards.push('')
    let teamCards = team.slice(0, 7)
    return teamCards.every(v => cards.includes(v))
};

const getBattlesWithRuleset = (matchDetails, account) => {

    matchDetails.rules = encodeURIComponent(matchDetails.rules);
    // matchDetails.rules = matchDetails.rules.
    matchDetails.player = account
    let params = `rules=${matchDetails.rules}`
    params += `&leaderboard=${matchDetails.leaderboard}`
    params += `&cards=${matchDetails.cards}`
    params += `&active=${matchDetails.active}`
    params += `&mana_cap=${matchDetails.mana_cap}`
    params += `&player=${account}`
    if ( matchDetails.color ) {
        params += `&color=${matchDetails.color}`
    }
    if ( matchDetails.quest ) {
        params += `&quest=${matchDetails.quest}`
    }
    params += `&bypass=phamkhangZa-23basdhadZ0@-a`
    const host = 'https://nftauto.online/'
    const url = `api/v2/splinterlands/teams?${params}`;
    console.log('API call: ', host+url)
    return fetch(host+url)
        .then(x => x && x.json())
        .then(data => data)
        .catch((e) => console.log('fetch ', e))
}

const getTeamsFromAPI = async (matchDetails, account) => {

    let {data} = await getBattlesWithRuleset(matchDetails, account);

    if ( data && data.length > 0) {
        return data
    }
    else {
        return []
    }
}

//27-1-c
const getCardIdFromString = (str) => {
    let rs = {}
    if ( str) {
        let [id, edition, type] = str.split('-')
        if (id) {
            id = +id
            rs = {
                id,
                edition
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
        color: ''
    }
    let arr = str.split('_')
    if (arr && arr.length > 0) {
        let color = arr[0]
        let rex = new RegExp(/^[a-z]/)
        if ( !rex.test(color)) {
            color = ''
        }
        let match = arr[arr.length - 1]
        //27-1-c::180-4-c:29-1-c:179-4-c:185-4-c:24-1-c
        let [summoner, monsters] = match.split('::')
        monsters = monsters.split(':')
        let team = []
        if (monsters.length > 0) {
            monsters.forEach(mon => {
                let obj = getCardIdFromString(mon)
                //{id, edition}
                if ( obj.id ) {
                    team.push(obj)
                }
            })
        }
        if (summoner && monsters.length > 0) {

            data = {
                summoner: getCardIdFromString(summoner),
                monsters: team,
                color
            }
        }
    }
    return data
}

const cardsIdsforSelectedBattles = (matchDetails, account, config, ecr) => getTeamsFromAPI(matchDetails, account, config, ecr)
    .then(x => {
        //[
        //     "green_0_20_27-1-c::180-4-c:29-1-c:179-4-c:185-4-c:24-1-c"
        //   ]
        return x.map(
            (team) => {
                let teamData = getTeamFromString(team)
                let arr = new Array(8).fill('')
                if ( teamData.summoner.id ) {
                    arr[0] = teamData.summoner.id
                }
                if ( teamData.monsters.length > 0 ) {
                    teamData.monsters.forEach((mon, index) => {
                        arr[index+1] = mon.id ? mon.id : ''
                    })
                }
                arr[7] = teamData.color

                return arr
            }
        )
    })

const askFormation = function ({matchDetails, account, config, ecr}) {
    const cards = matchDetails.myCards || basicCards;
    let cardIds = cards.map(card => card.split('-')[0] ? (+card.split('-')[0]) : '')

    matchDetails.cards = cards.join(',')
    matchDetails.mana_cap = matchDetails.mana
    delete matchDetails.myCards
    //arr(8) = [sum, team(6), color]
    //[ 145, 50, 51, 52, 141, '', '', 'black' ]
    return cardsIdsforSelectedBattles(matchDetails, account, config, ecr)
        .then(x => x.filter(team => availabilityCheck(cardIds, team))
            .map(element => element)//cards.cardByIds(element)
        )

}

const possibleTeams = async ({matchDetails, account, config, ecr}) => {
    let possibleTeams = [];
    possibleTeams = await askFormation({matchDetails, account, config, ecr});

    if (possibleTeams.length > 0) {
        return possibleTeams;
    }
    return possibleTeams;
}

const teamSelection = async (possibleTeams, matchDetails, quest) => {
    //check if daily quest is not completed
    if(possibleTeams.length > 0 ) {
        let team = possibleTeams[0]
        const filteredTeams = possibleTeams.filter(team=> team[7] !== 'gold')

        if (filteredTeams.length > 0) {
            team = filteredTeams[0]
        }

        let summoner = team[0]
        let arr = team.slice(1, 7)
        return { summoner, cards: arr, color: team[team.length - 1]};
    }

    throw new Error('NO TEAM available to be played.');
}


module.exports.possibleTeams = possibleTeams;
module.exports.teamSelection = teamSelection;


// const summoners = history.map(x => x.summoner_id);

// // console.log([...new Set(summoners)])
// console.log(summonerColor(27))

// // TO TEST uncomment below:
// const matchDetails = { mana: 30, rules: '', active: ['fire','water','life','earth','death'],
//     cards: ['242-3-c', '248-3-c', '250-3-c', '251-3-c', '281-3-c', '331-3-c', '334-3-c', '334-3-c', '337-3-c', '337-3-c', '337-3-c', '338-3-c', '340-3-c', '340-3-c', '340-3-c', '345-3-c', '345-3-c', '345-3-c', '345-3-c', '346-3-c', '347-3-c', '349-3-c', '349-3-c', '349-3-c', '349-3-c']
// }
// console.log(possibleTeams(matchDetails))