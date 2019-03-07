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
}

const server = net.createServer((socket) => {
	const abstractor = abstractorFactory()
	
	socket.abstractor = abstractor
	
	socket.on('error', (err) => {
		console.log(err)
	})
	
	socket.on('data', (chunk) => {
		socket.data.transferredBytes += chunk.length
		
		console.log('chunk ' + chunk.length + ' client => server')
	})
	
	abstractor.on('data', (chunk) => {
		socket.data.transferredBytes += chunk.length
		
		console.log('chunk ' + chunk.length + ' server => client')
	})
	
	socket.pipe(abstractor)
	abstractor.pipe(socket)
	
	socket.data = {
		'loggedIn': false,
		'transferredBytes': 0
	}
	
	abstractor.send('message', fastMessage([['> ', '#FFDC00'], ['Welcome! Be friendly in-game.', '#EFEFE7']]))
	
	abstractor.on('login', (data) => {
		console.log('Login as ' + data.name + ' from user.')
		
		socket.data.username = data.name
		socket.data.loggedIn = true
		socket.data.typing = false
		
		clients.push(socket)
		
		sendAllClients('message', fastMessage([['+ ', '#FFDC00'], [socket.data.username, '#FFDC00'], [' has joined the game.', '#EFEFE7']]))
		
		updateClients()
		
		socket.on('close', () => {
			console.log('Socket disconnected.')
			
			clients.splice(clients.indexOf(socket), 1)
		})
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