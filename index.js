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
		'subtitle': '',
		'boardText': '',
		'titleColor': '#FFFFFF',
		'subtitleColor': '#FFFFFF',
		'displayMode': 0
	},
	'background': 'images/backgrounds/station.png',
	'weather': 0,
	'vignette': 120,
	'selecting': 0,
	'teams': [
		{
			'size': 2,
			'requiredToTamper': 1,
			'members': []
		},
		{
			'size': 3,
			'requiredToTamper': 1,
			'members': []
		},
		{
			'size': 2,
			'requiredToTamper': 1,
			'members': []
		},
		{
			'size': 3,
			'requiredToTamper': 2,
			'members': []
		},
		{
			'size': 3,
			'requiredToTamper': 1,
			'members': []
		}
	],
	'currentTeam': 0
}

const clients = []

const sendAllClients = (name, data) => {
	for (let i = 0; i < clients.length; i++) {
		clients[i].abstractor.send(name, data)
	}
}

const updateClients = () => {
	sendAllClients('updateGame', {
		'players': (gameState.mode === 'crimeScene' || gameState.mode === 'showInvestigationResults' ? clients.filter((client) => client.data.selected === true) : clients).map((client) => client.data),
		'background': gameState.background,
		'weather': gameState.weather,
		'vignette': gameState.vignette
	})

	if (gameState.mode !== 'setRoles') {
		sendAllClients('title', gameState.title)
	}
}

// Reset votes and selections
const resetSelecting = () => {
	for (let i = 0; i < clients.length; i++) {
		clients[i].data.selected = false
		clients[i].data.vote = null
		clients[i].data.tampering = null
	}
}

let lastMode = gameState.mode
let currentModeState = {}

const getRandomClients = (count = 2) => {
	if (count > clients.length) {
		return clients
	}
	
	let selected = []
	let selectFrom = clients.slice(0)
	
	for (let i = 0; i < count; i++) {
		const randomIndex = Math.floor(Math.random() * selectFrom.length)
		
		selected.push(selectFrom[randomIndex])
		
		selectFrom.splice(randomIndex, 1)
	}
	
	return selected
}

const gameLoop = () => {
	let firstForMode = false
	
	if (lastMode !== gameState.mode) {
		firstForMode = true
		
		currentModeState = {
			'repeated': 0
		}
	}
	else currentModeState.repeated++
	
	lastMode = gameState.mode
	
	if (gameState.mode === 'waitingForPlayers') {
		gameState.title = {
			'title': 'Waiting to start.',
			'subtitle': clients.length + ' / 5 players',
			'boardText': 'Waiting...',
			'titleColor': '#EFEFE7',
			'subtitleColor': '#EFEFE7',
			'displayMode': 0
		}

		gameState.vignette = 120
		
		gameState.background = 'images/backgrounds/station.png'

		if (clients.length >= 5) {
			gameState.mode = 'setRoles'
		}
	}
	else if (gameState.mode === 'setRoles') {
		if (firstForMode) {
			const selectedMafia = getRandomClients(2)
			
			for (let i = 0; i < selectedMafia.length; i++) {
				selectedMafia[i].data.role = 'mafia'
			}
		}

		gameState.title = {
			'title': '',
			'subtitle': '',
			'boardText': '',
			'titleColor': '#EFEFE7',
			'subtitleColor': '#EFEFE7',
			'displayMode': 0
		}
		
		for (let i = 0; i < clients.length; i++) {
			if (clients[i].data.role === 'mafia') {
				if (firstForMode) {
					clients[i].abstractor.send('message', fastMessage([['> ', '#FFDC00'], ['You are a member of the mafia.', '#ED553B']]))
				}

				clients[i].abstractor.send('title', {
					'title': 'MAFIA',
					'subtitle': 'You are a corrupt officer.',
					'boardText': '',
					'titleColor': '#ED553B',
					'subtitleColor': '#EFEFE7',
					'displayMode': 1
				})
			}
			else {
				if (firstForMode) {
					clients[i].abstractor.send('message', fastMessage([['> ', '#FFDC00'], ['You are an innocent police officer.', '#47AB6C']]))
				}

				clients[i].abstractor.send('title', {
					'title': 'Officer',
					'subtitle': 'You are an innocent police officer.',
					'boardText': 'Find the mafia!',
					'titleColor': '#47AB6C',
					'subtitleColor': '#EFEFE7',
					'displayMode': 1
				})
			}
		}
		
		if (currentModeState.repeated > 5) {
			gameState.mode = 'selecting'
		}
	}
	else if (gameState.mode === 'selecting') {
		if (firstForMode) {
			resetSelecting() // Reset votes + selections
			
			gameState.selecting++
			
			gameState.selecting %= clients.length
		}
		
		gameState.vignette = 120
		gameState.background = 'images/backgrounds/station.png'
		
		const selectedClients = clients.filter((client) => client.data.selected === true)
		const requiredCount = Math.min(gameState.teams[gameState.currentTeam].size, clients.length)
		
		gameState.title = {
			'title': 'Selecting.',
			'subtitle': clients[gameState.selecting].data.name + ' is selecting.',
			'boardText': selectedClients.length + ' / ' + requiredCount,
			'titleColor': '#EFEFE7',
			'subtitleColor': '#EFEFE7',
			'displayMode': 0
		}
		
		if (selectedClients.length >= requiredCount) {
			gameState.mode = 'voting'
		}
	}
	else if (gameState.mode === 'voting') {
		if (firstForMode) {
			sendAllClients('setVoteUI', {
				'display': true
			})
			
			sendAllClients('message', fastMessage([['> ', '#FFDC00'], ['Voting on team ', '#EFEFE7'], [clients.filter((client) => client.data.selected).map((client) => client.data.name).join(', '), '#FFDC00'], [' proposed by ', '#EFEFE7'], [clients[gameState.selecting].data.name, '#FFDC00'], ['.', '#EFEFE7']]))
		}
		
		const votedClients = clients.filter((client) => client.data.vote !== null)
		
		gameState.title = {
			'title': 'Voting.',
			'subtitle': 'This team proposed by ' + clients[gameState.selecting].data.name + '.',
			'boardText': votedClients.length + ' / ' + clients.length,
			'titleColor': '#EFEFE7',
			'subtitleColor': '#EFEFE7',
			'displayMode': 0
		}
		
		if (votedClients.length >= clients.length) {
			gameState.title = {
				'title': 'Voting complete.',
				'subtitle': '',
				'boardText': votedClients.length + ' / ' + clients.length,
				'titleColor': '#EFEFE7',
				'subtitleColor': '#EFEFE7',
				'displayMode': 0
			}
			
			gameState.mode = 'voteResults'
			
			sendAllClients('setVoteUI', {
				'display': false
			})
		}
	}
	else if (gameState.mode === 'voteResults') {
		const forVoters = clients.filter((client) => client.data.vote === true)
		const againstVoters = clients.filter((client) => client.data.vote === false)
		
		const passed = forVoters.length > againstVoters.length
		
		if (firstForMode) {
			sendAllClients('message', fastMessage([['> ', '#FFDC00'], ['The vote ', '#EFEFE7'], (passed ? ['passed', '#47AB6C'] : ['failed', '#ED553B']), ['.', '#EFEFE7']]))
			sendAllClients('message', fastMessage([['> ', '#FFDC00'], ['The vote was rejected by ', '#EFEFE7'], [(againstVoters.length > 0 ? againstVoters.map((client) => client.data.name).join(', ') : 'no one'), '#FFDC00'], ['.', '#EFEFE7']]))
		}
		
		gameState.title = {
			'title': 'Voting complete.',
			'subtitle': 'The vote ' + (passed ? 'has succeeded.' : 'did not pass.'),
			'boardText': 'For: ' + forVoters.length + '\nAgainst: ' + againstVoters.length,
			'titleColor': '#EFEFE7',
			'subtitleColor': '#EFEFE7',
			'displayMode': 0
		}
		
		if (currentModeState.repeated > 4) {
			if (passed) {
				gameState.mode = 'transition'
				
				sendAllClients('transition', {
					'ms': 3000
				})
				
				setTimeout(() => {
					gameState.mode = 'crimeScene'
					
					gameLoop()
				}, 1000)
			}
			else {
				gameState.mode = 'selecting'
			}
		}
	}
	else if (gameState.mode === 'crimeScene') {
		gameState.title = {
			'title': '',
			'subtitle': '',
			'boardText': '',
			'titleColor': '#EFEFE7',
			'subtitleColor': '#EFEFE7',
			'displayMode': 0
		}
		
		gameState.vignette = 130
		gameState.background = 'images/backgrounds/crimescene1.png'
		gameState.weather = 1
		
		const selectedClients = clients.filter((client) => client.data.selected === true)
		const specifiedSelectedClients = selectedClients.filter((client) => client.data.tampering !== null)
		
		if (firstForMode) {
			for (let i = 0; i < selectedClients.length; i++) {
				selectedClients[i].abstractor.send('setTamperUI', {
					'display': true,
					'canTamper': selectedClients[i].data.role === 'mafia'
				})
			}
			
			gameState.teams[gameState.currentTeam].members = selectedClients
		}
		
		if (specifiedSelectedClients.length >= selectedClients.length) {
			console.log(specifiedSelectedClients.map((client) => client.data.tampering))
			
			console.log('Showing investigation results...')
			
			gameState.mode = 'showInvestigationResults'
		}
	}
	else if (gameState.mode === 'showInvestigationResults') {
		const currentTeam = gameState.teams[gameState.currentTeam]
		const teamMembers = currentTeam.members
		
		const tampers = teamMembers.filter((client) => client.data.tampering === true)
		
		if (firstForMode) {
			currentTeam.victor = tampers.length >= currentTeam.requiredToTamper ? 'mafia' : 'officers'
			
			console.log('Team victor: ' + currentTeam.victor)
			
			sendAllClients('setTamperUI', {
				'display': false,
				'canTamper': true
			})
		}

		gameState.vignette = 100
		gameState.weather = 0
		
		if (currentTeam.victor === 'mafia') {
			gameState.title = {
				'title': 'TAMPERED',
				'subtitle': 'The evidence has been tampered with by ' + tampers.length + ' mafia ' + (tampers.length === 1 ? 'member' : 'members') + '.',
				'boardText': '',
				'titleColor': '#ED553B',
				'subtitleColor': '#EFEFE7',
				'displayMode': 1
			}
		}
		else gameState.title = {
			'title': 'Evidence Secure',
			'subtitle': 'The evidence is secure.',
			'boardText': '',
			'titleColor': '#47AB6C',
			'subtitleColor': '#EFEFE7',
			'displayMode': 1
		}
		
		if (currentModeState.repeated > 7) {
			gameState.currentTeam++

			gameState.weather = 0
			
			sendAllClients('transition', {
				'ms': 2000
			})
			
			gameState.mode = 'transition'
			
			setTimeout(() => {
				gameState.mode = 'selecting'
			}, 1000)
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
		'transferredBytes': 0,
		'selected': false,
		'vote': null,
		'role': 'officer',
		'tampering': null
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

		if (gameState.mode !== 'waitingForPlayers') {
			abstractor.send('loginStatus', {
				'success': false,
				'message': 'This game has started.'
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

		if (data.name.length > 10) {
			abstractor.send('loginStatus', {
				'success': false,
				'message': 'That name is too long.'
			})

			return
		}
		
		if (clients.findIndex((client) => client.data.name.toLowerCase() === data.name.toLowerCase()) !== -1) {
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
		
		socket.data.name = data.name
		socket.data.loggedIn = true
		socket.data.skin = ['officer', 'detective'][Math.floor(Math.random() * 2)]
		socket.data.typing = false
		
		abstractor.send('transition', {
			'ms': 500
		})

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
		
		sendAllClients('message', fastMessage([['+ ', '#FFDC00'], [socket.data.name, '#FFDC00'], [' has joined the game.', '#EFEFE7']]))
		
		updateClients()
	})
	
	abstractor.on('setTyping', (data) => {
		socket.data.typing = data.typing
		
		updateClients()
	})
	
	abstractor.on('sendChat', (data) => {
		if (!socket.data.loggedIn) {
			console.log('- ' + socket.data.name + ': ' + data.message)
			
			abstractor.send('message', fastMessage([['Error: Before chatting, you must choose your name.', '#E83338']]))
			
			return
		}
		
		if (data.message.length < 1 || data.message.length > 100) {
			return
		}
		
		data.message = data.message.trim()
		
		if (data.message.indexOf('/') === 0) {
			console.log('/ ' + socket.data.name + ': ' + data.message)
			
			const segs = data.message.substring(1).split(' ')
			const command = segs[0]
			
			if (command === 'data') {
				abstractor.send('message', fastMessage([['> ', '#FFDC00'], ['Transferred bytes: ' + socket.data.transferredBytes, '#EFEFE7']]))
			}
			else if (command === 'w' || command === 'whisper') {
				if (segs.length < 3) {
					abstractor.send('message', fastMessage([['> ', '#FFDC00'], ['Usage: /w [player] [message]', '#E83338']]))
					
					return
				}

				const destination = clients.find((client) => client.data.name.toLowerCase() === segs[1].toLowerCase())
				
				const messageContent = segs.slice(2).join(' ')
				
				if (destination) {
					if (destination === socket) {
						abstractor.send('message', fastMessage([['> ', '#FFDC00'], ['Error: You can\'t whisper to yourself!', '#E83338']]))

						return
					}
					
					sendAllClients('message', fastMessage([[socket.data.name, '#FFDC00'], [' whispers to ', '#EFEFE7'], [destination.data.name, '#FFDC00'], ['.', '#EFEFE7']]))

					destination.abstractor.send('message', fastMessage([[socket.data.name, '#FFDC00'], [' > ', '#EFEFE7'], ['me', '#FFDC00'], [': ' + messageContent, '#EFEFE7']]))
					
					abstractor.send('message', fastMessage([['me', '#FFDC00'], [' > ', '#EFEFE7'], [destination.data.name, '#FFDC00'], [': ' + messageContent, '#EFEFE7']]))
				}
				else {
					abstractor.send('message', fastMessage([['> ', '#FFDC00'], ['Error: That player doesn\'t exist.', '#E83338']]))
				}
			}
			else if (command === 'stage') {
				if (socket.data.name === 'ethan') {
					gameState.mode = segs[1]
					
					abstractor.send('message', fastMessage([['DEBUG: Updated stage', '#EFEFE7']]))
				}
			}
			else {
				abstractor.send('message', fastMessage([['> ', '#FFDC00'], ['Error: Unknown command.', '#E83338']]))
			}
			
			return
		}
		
		console.log('+ ' + socket.data.name + ': ' + data.message)
		
		for (let i = 0; i < clients.length; i++) {
			clients[i].abstractor.send('message', fastMessage([['[', '#EFEFE7'], [socket.data.name, '#FFDC00'], ['] ', '#EFEFE7'], [data.message, '#EFEFE7']]))
		}
	})
	
	abstractor.on('select', (data) => {
		if (data.index > clients.length - 1) {
			socket.abstractor.send('message', fastMessage([['> ', '#FFDC00'], ['Error: Player index ' + data.index + ' ( / ' + clients.length + ') out of bounds! Are you experiencing latency?', '#E83338']]))
			
			return
		}

		if (gameState.mode !== 'selecting') {
			return
		}
		
		if (clients.indexOf(socket) !== gameState.selecting) {
			socket.abstractor.send('message', fastMessage([['> ', '#FFDC00'], ['Error: You aren\'t able to select currently.', '#E83338']]))
			
			return
		}
		
		const selectClient = clients[data.index]
		
		if (selectClient.selected) {
			selectClient.data.selected = false
		}
		else {
			selectClient.data.selected = true
		}
		
		gameLoop()
	})
	
	abstractor.on('setTampering', (data) => {
		if (socket.data.tampering !== null) {
			socket.abstractor.send('message', fastMessage([['> ', '#FFDC00'], ['Error: You\'ve already selected.', '#E83338']]))
			
			return
		}
		
		console.log(socket.data.name + ' set tamper status to ' + data.tampering)
		
		if (socket.data.role !== 'mafia' && data.tampering === true) {
			socket.abstractor.send('message', fastMessage([['> ', '#FFDC00'], ['You are an innocent officer and don\'t want to tamper.', '#E83338']]))
			
			return
		}
		
		socket.data.tampering = data.tampering

		if (data.tampering === true) {
			socket.abstractor.send('message', fastMessage([['> ', '#FFDC00'], ['You will tamper with the evidence tonight.', '#ED553B']]))
		}
		else {
			socket.abstractor.send('message', fastMessage([['> ', '#FFDC00'], ['You will investigate tonight.', '#47AB6C']]))
		}
		
		abstractor.send('setTamperUI', {
			'display': false,
			'canTamper': true
		})
	})
	
	abstractor.on('vote', (data) => {
		if (socket.data.vote !== null) {
			socket.abstractor.send('message', fastMessage([['> ', '#FFDC00'], ['Error: You\'ve already voted.', '#E83338']]))
			
			return
		}
		
		console.log(socket.data.name + ' voted ' + data.value)
		
		socket.data.vote = data.value
		
		socket.abstractor.send('setVoteUI', {
			'display': false
		})
		
		gameLoop()
	})
})

server.listen(8080, () => {
	console.log('> Server listening.')
})