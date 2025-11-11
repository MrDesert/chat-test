const socket = io()
const messages = document.querySelector('.messages')
const form = document.querySelector('.form')
const input = document.querySelector('.input')
const nameBlock = document.querySelector('.name')

const userName = prompt('You name')
nameBlock.innerHTML = `${userName}`

form.addEventListener('submit', (e) => {
    e.preventDefault()

    if (input.value){
        socket.emit('chat massage', {
            message: input.value,
            name: userName
        })
        input.value = ''
    }
})

socket.on('chat massage', (data) => {
    const item = document.createElement('li') 
    if (data.name == userName){
        item.innerHTML = `<span style=color:red;>${data.name}</span>: ${data.message}`
    } else {
        item.innerHTML = `<span>${data.name}</span>: ${data.message}`
    }
    messages.appendChild(item)
})