const EventEmitter = require('events')

class Bot extends EventEmitter {
	constructor (dataStart) {
		super()
		
		this.data = dataStart
		this.partialGameState = {}
		
		this.abstractor = new EventEmitter()
		
		this.incomingAbstractor = new EventEmitter()
		
		this.abstractor.send = (type, data) => this.incomingAbstractor.emit(type, data)
		
		this.incomingAbstractor.on('botReady', () => {
			console.log('Bot ready!')
			
			if (typeof this.data.name === 'undefined') {
				this.abstractor.emit('login', {
					'name': 'bot' + Math.floor(Math.random() * 100000)
				})
			}
			
			this.abstractor.emit('sendChat', {
				'message': 'Hello, I\'m a bot.'
			})
		})
		
		this.incomingAbstractor.on('updateGame', (data) => {
			this.partialGameState = data
		})
		
		this.incomingAbstractor.on('setTamperUI', (data) => {
			setTimeout(() => {
				if (data.display === true) {
					if (data.canTamper === true) {
						this.abstractor.emit('setTampering', {
							'tampering': true
						})
					}
					else {
						this.abstractor.emit('setTampering', {
							'tampering': false
						})
					}
				}
			}, 3000 + Math.floor(Math.random() * 1000))
		})
		
		this.incomingAbstractor.on('setVoteUI', (data) => {
			if (data.display === true) {
				let myIndex = this.partialGameState.players.findIndex((player) => player.name === this.data.name)
				
				if (this.partialGameState.players[myIndex].selected === true) {
					this.abstractor.emit('vote', {
						'value': true
					})
				}
				else {
					this.abstractor.emit('vote', {
						'value': false
					})
				}
			}
		})
		
		let nowSelecting = false
		
		this.incomingAbstractor.on('title', (data) => {
			if (data.title === 'YOU ARE SELECTING' && nowSelecting === false) {
				console.log('Bot selecting...')
				
				nowSelecting = true
				
				const selectCount = Number(data.boardText.split('/ ')[1])
				
				let currentSelectIndex = this.partialGameState.players.findIndex((player) => player.name === this.data.name)
				
				console.log('Will select ' + selectCount + ' players...')
				
				for (let i = 0; i < selectCount; i++) {
					currentSelectIndex %= this.partialGameState.players.length
					
					console.log(currentSelectIndex)
					
					this.abstractor.emit('select', {
						'index': currentSelectIndex
					})
					
					currentSelectIndex++
				}
				
				nowSelecting = false
			}
		})
	}
}

module.exports = Bot