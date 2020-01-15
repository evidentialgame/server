const path = require('path')
const fs = require('fs')

const filterWords = fs.readFileSync(path.join(__dirname, 'censorWords.txt')).toString().split(/\n|\r/g).filter((word) => word.length > 0)

module.exports = {
	'censorMessage': (message) => {
		let censored = false
		
		for (let i = 0; i < filterWords.length; i++) {
			const wordRegex = new RegExp(filterWords[i], 'gi')
			const foundBadIndex = wordRegex.test(message)
			
			if (foundBadIndex !== -1) {
				censored = true
				
				message = message.replace(wordRegex, '*'.repeat(filterWords[i].length))
			}
		}
		
		return {
			censored,
			message
		}
	}
}