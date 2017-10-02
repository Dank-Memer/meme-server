const express = require('express')
const app = express()
const hb = require('handlebars')
const fs = require('fs')

const source = hb.compile(fs.readFileSync('./index.html').toString())

const endpoints = {}
const stats = {
	requests: 0,
	cmds: {}
}

const cluster = require('cluster');
const http = require('http');
const numCPUs = require('os').cpus().length;

if (cluster.isMaster) {
  console.log(`Master ${process.pid} is running`);

  // Fork workers.
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.log(`worker ${worker.process.pid} died`);
  });
} else {
	fs.readdir('./assets/', async (err, files) => {
		files.forEach(file => {
			file = file.replace('.js', '')
			try {
				endpoints[file] = require(`./assets/${file}`).run
				stats.cmds[file] = 0
			} catch (err) {
				console.warn(`There was an error with '${file}': ${err.message} | ${err.stack}`)
			}
		})
	})

	app.get('/api/*', async (req, res) => {
		stats.requests++

		let keys = require('./keys.json')
		delete require.cache[require.resolve('./keys.json')]

		if (!req.headers['api-key'] || !keys.includes(req.headers['api-key']))
			return res.status(401).send('<h1>401 - Unauthorized</h1><br>You are not authorized to access this endpoint, dummy.')

		const endpoint = req.originalUrl.slice(req.originalUrl.lastIndexOf('/') + 1)
		if (!endpoints[endpoint])
			return res.status(404).send('<h1>404 - Not Found</h1><br>Endpoint not found.')

		stats.cmds[endpoint]++
		try {
			const data = await endpoints[endpoint](req.headers['data-src'])
			res.status(200).send(data)
		} catch (err) {
			console.warn(`There was an error: ${err.message} | ${err.stack}`)
			return res.status(400).send(`${err.message} | ${err.stack}`)
		}

	})

	app.get('/', (req, res) => {
		let data = {
			'uptime': formatTime(process.uptime()),
			'ram': (process.memoryUsage().rss / 1024 / 1024).toFixed(2),
			'requests': stats.requests,
			'usage': Object.keys(stats.cmds).sort((a, b) => stats.cmds[b] - stats.cmds[a]).map(c => `${c} - ${stats.cmds[c]} hits`).join('<br>')
		}
		res.status(200).send(source(data))
	})

	app.listen('80', console.log('Server ready.'))


	function formatTime(time) {
		let days = Math.floor(time % 31536000 / 86400),
			hours = Math.floor(time % 31536000 % 86400 / 3600),
			minutes = Math.floor(time % 31536000 % 86400 % 3600 / 60),
			seconds = Math.round(time % 31536000 % 86400 % 3600 % 60)
		days = days > 9 ? days : '0' + days
		hours = hours > 9 ? hours : '0' + hours
		minutes = minutes > 9 ? minutes : '0' + minutes
		seconds = seconds > 9 ? seconds : '0' + seconds
		return `${days > 0 ? `${days}:` : ``}${(hours || days) > 0 ? `${hours}:` : ``}${minutes}:${seconds}`
	}
}
