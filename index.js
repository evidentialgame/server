const path = require('path')
const fs = require('fs')
const net = require('net')

const {Schema, StreamingAbstractor, types, protospec} = require('protocore')

const protocolSpec = fs.readFileSync(path.join(__dirname, 'protocol.pspec')).toString()

const abstractorFactory = () => protospec.importAbstractor(protocolSpec)

const fastMessage = (contents) => {
	return {
		'segments': contents.map((content) => {
			return {
				'text': content[0],
				'color': content[1]
			}
		})
	}
}

const gameState = {
	'mode': 'waitingForPlayers',
	'title': {
		'title': '',
		'subtitle': ''
	}
}

const clients = []

const sendAllClients = (name, data) => {
	for (let i = 0; i < clients.length; i++) {
		clients[i].abstractor.send(name, data)
	}
}

const updateClients = () => {
	sendAllClients('updateGame', {
		'players': clients.map((client) => {
			return {
				'name': client.data.username,
				'typing': client.data.typing
			}
		})
	})

	sendAllClients('title', gameState.title)
}

const gameLoop = () => {
	if (gameState.mode === 'waitingForPlayers') {
		gameState.title = {
			'title': 'Waiting to start.',
			'subtitle': clients.length + ' / 5 players'
		}

		if (clients.length >= 5) {
			gameState.mode = 'selecting'
		}
	}
	else if (gameState.mode === 'selecting') {
		gameState.title = {
			'title': 'Selecting.',
			'subtitle': 'A player is selecting.'
		}
	}

	updateClients()
}

setInterval(gameLoop, 1000)

const server = net.createServer((socket) => {
	const abstractor = abstractorFactory()
	
	socket.abstractor = abstractor
	
	socket.on('error', (err) => {
		console.log(err)
	})
	
	socket.on('data', (chunk) => {
		socket.data.transferredBytes += chunk.length
		
		//console.log('chunk ' + chunk.length + ' client => server')
	})
	
	abstractor.on('data', (chunk) => {
		socket.data.transferredBytes += chunk.length
		
		//console.log('chunk ' + chunk.length + ' server => client')
	})
	
	socket.pipe(abstractor)
	abstractor.pipe(socket)
	
	socket.data = {
		'loggedIn': false,
		'transferredBytes': 0
	}
	
	abstractor.send('message', fastMessage([['> ', '#FFDC00'], ['Welcome! Be friendly in-game.', '#EFEFE7']]))
	
	abstractor.on('login', (data) => {
		if (data.name.length < 1) {
			abstractor.send('loginStatus', {
				'success': false,
				'message': 'Please choose a name!'
			})

			return
		}

		if (data.name.length > 10) {
			abstractor.send('loginStatus', {
				'success': false,
				'message': 'That name is too long.'
			})

			return
		}

		if (clients.length >= 5) {
			abstractor.send('loginStatus', {
				'success': false,
				'message': 'This game is full.'
			})

			return
		}
		
		if (clients.findIndex((client) => client.data.username.toLowerCase() === data.name.toLowerCase()) !== -1) {
			abstractor.send('loginStatus', {
				'success': false,
				'message': 'That name is taken.'
			})
			
			return
		}
		
		if (/[^A-Za-z0-9]/g.test(data.name)) {
			abstractor.send('loginStatus', {
				'success': false,
				'message': 'Names cannot contain spaces or special characters.'
			})
			
			return
		}

		console.log('Login as \'' + data.name + '\' from user.')
		
		socket.data.username = data.name
		socket.data.loggedIn = true
		socket.data.typing = false

		abstractor.send('loginStatus', {
			'success': true,
			'message': ''
		})
		
		clients.push(socket)

		socket.once('close', () => {
			console.log('Socket disconnected.')
			
			clients.splice(clients.indexOf(socket), 1)

			updateClients()
		})
		
		sendAllClients('message', fastMessage([['+ ', '#FFDC00'], [socket.data.username, '#FFDC00'], [' has joined the game.', '#EFEFE7']]))
		
		updateClients()
	})
	
	abstractor.on('setTyping', (data) => {
		socket.data.typing = data.typing
		
		updateClients()
	})
	
	abstractor.on('sendChat', (data) => {
		if (!socket.data.loggedIn) {
			console.log('- ' + socket.data.username + ': ' + data.message)
			
			abstractor.send('message', fastMessage([['Error: Before chatting, you must choose your name.', '#E83338']]))
			
			return
		}
		
		if (data.message.length < 1 || data.message.length > 100) {
			return
		}
		
		data.message = data.message.trim()
		
		if (data.message.indexOf('/') === 0) {
			console.log('/ ' + socket.data.username + ': ' + data.message)
			
			const segs = data.message.substring(1).split(' ')
			const command = segs[0]
			
			if (command === 'data') {
				abstractor.send('message', fastMessage([['> ', '#FFDC00'], ['Transferred bytes: ' + socket.data.transferredBytes, '#FFFFFF']]))
			}
			else if (command === 'w' || command === 'whisper') {
				if (segs.length < 3) {
					abstractor.send('message', fastMessage([['> ', '#FFDC00'], ['Usage: /w [player] [message]', '#E83338']]))
					
					return
				}

				const destination = clients.find((client) => client.data.username.toLowerCase() === segs[1].toLowerCase())
				
				const messageContent = segs.slice(2).join(' ')
				
				if (destination) {
					if (destination === socket) {
						abstractor.send('message', fastMessage([['> ', '#FFDC00'], ['Error: You can\'t whisper to yourself!', '#E83338']]))

						return
					}

					destination.abstractor.send('message', fastMessage([[socket.data.username, '#FFDC00'], [' > ', '#EFEFE7'], ['me', '#FFDC00'], [': ' + messageContent, '#EFEFE7']]))
					
					abstractor.send('message', fastMessage([['me', '#FFDC00'], [' > ', '#EFEFE7'], [destination.data.username, '#FFDC00'], [': ' + messageContent, '#EFEFE7']]))
				}
				else {
					abstractor.send('message', fastMessage([['> ', '#FFDC00'], ['Error: That player doesn\'t exist.', '#E83338']]))
				}
			}
			else {
				abstractor.send('message', fastMessage([['> ', '#FFDC00'], ['Error: Unknown command.', '#E83338']]))
			}
			
			return
		}
		
		console.log('+ ' + socket.data.username + ': ' + data.message)
		
		for (let i = 0; i < clients.length; i++) {
			clients[i].abstractor.send('message', fastMessage([['[', '#FFFFFF'], [socket.data.username, '#FFDC00'], ['] ', '#FFFFFF'], [data.message, '#FFFFFF']]))
		}
	})
})

server.listen(8080, () => {
	console.log('> Server listening.')
})