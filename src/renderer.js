ipc.on('run', (event, arg) => {
    console.log(arg)
})

ipc.send('run', 'sho')

window.btn_add.addEventListener('click', () => {
    ipc.send('worker.add')
})

window.btn_remove_all.addEventListener('click', () => {
    ipc.send('worker.remove_all')
})

window.btn_logout.addEventListener('click', () => {
    console.log('click logout')
    // console.log(storage.get('user'))
    storage.remove('user')
    location.href = './sign-in.html'
})

window.addEventListener('DOMContentLoaded', () => {
    storage.get('user', (error, user)=> {
        console.log(user)
        // console.log(arguments)

        if (!user.token) {
            location.href = './sign-in.html'
        }
    })


})