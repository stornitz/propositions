'use strict';

global.Log = require('better-logger');
var socketio = require('socket.io');
var Session = require('express-session');
var fs = require('fs');
var http = require('http');

var MySQL = require('./MySQL').MySQL;
var ExpressServer = require('./ExpressServer').ExpressServer;
var config = require('./config');

Log.enableDebug(config.debug);

var expServer;
var server;
var io;
var sql;

var cleanIdRegex = /[^a-zA-Z0-9-]+/g;

var users;				// {socketid : {id,name,pool}}
var usersCount;

var polls;            // {id: {id, name, type_big}}
var suggestionsPolls; // {id: poll_id}
var suggestions;      // {poll_id: {id: {title, desc, author, score}}}
var votes;            // {suggestion_id: {voter_id: value}}

function INIT() {
	Log.debug('Preparing server...');
	prepareServer(config, function afterPrepare() {
		Log.debug('Server prepared.');

		startServer(config.port);
	});
}

function setupPolls(afterPrepare) {
	Log.debug('Setting polls');
	sql.getPolls(function getPollsCB(sqlPolls) {
		sqlPolls.forEach(function forEachPolls(o) {
			polls[o.id] = {
				id: o.id,
				name: o.name,
				type_big: o.type_big
			};
		})

		setupSuggestions(afterPrepare);
	});
}

function setupSuggestions(afterPrepare) {
	Log.debug('Setting suggestions');
	sql.getSuggestions(function getSuggestionsCB(sqlSuggestions) {
		sqlSuggestions.forEach(function forEachSuggestions(o) {
			suggestionsPolls[o.id] = o.poll_id;

			if(!(o.poll_id in suggestions))
				suggestions[o.poll_id] = {};

			suggestions[o.poll_id][o.id] = {
				id: o.id,
				title: o.title,
				description: o.description,
				author: o.author,
				score: o.score
			}
		});
			
		setupVotes(afterPrepare);
	});
}

function setupVotes(afterPrepare) {
	Log.debug('Setting votes');
	sql.getVotes(function getVotesCB(sqlVotes) {
		sqlVotes.forEach(function forEachVotes(o) {
			if(!(o.suggestion_id in votes))
				votes[o.suggestion_id] = {};

			votes[o.suggestion_id][o.voter_id] = o.value;
		})

		afterPrepare();
	});
}

function prepareServer(config, afterPrepare) {
	users = {};
	usersCount = 0;
	polls = {};
	suggestionsPolls = {};
	suggestions = {};
	votes = {};

	sql = new MySQL(config.mysqlConfig);
	sql.createDB(function createDBCB() {
		setupPolls(afterPrepare);
	});

	expServer = new ExpressServer(config, Session, sql.getUser);
	expServer.setup();
}

function startServer(port) {
	server = http.Server(expServer.getApp());
	server.listen(port);

	io = socketio(server);

	var session = expServer.getSession();
	io.use(function(socket, next) {
		session(socket.handshake, {}, next);
	});

	Log.info('Server started at 0.0.0.0:%s', port);

	io.on('connection', onConnection)
}

function onConnection(socket) {	
	var session = socket.handshake.session;

	if(session.logged) {
		users[socket.id] = session.user;

		socket.once('disconnect', onDisconnect);

		socket.on('get suggestions', getSuggestions);
		socket.on('vote', onVote);

		socket.on('add suggestion', addSuggestion);
		
		// TODO LATER
		// this.on('delete suggestion');
		// this.on('undo delete suggestion');

		sendPolls(socket);

		usersCount++;
		socket.emit('users', cleanUsers(users), usersCount);
		socket.broadcast.emit('new user', {
			id: cleanId(socket.id),
			name: session.user.name
		}, usersCount);
	} else {		
		socket.disconnect(); // On kick le client
	}
}

function onDisconnect() {
	usersCount--;
	io.emit('quit user', cleanId(this.id), usersCount);
	delete users[this.id];
}

function cleanUsers(users) {
	var newList = [];
	for(var id in users) {
		newList.push({
			id: id,
			name: users[id].name,
		})
	}
	return newList;
}

function sendPolls(socket) {
	socket.emit('polls', polls);
}

function room(pollId) {
	return 'poll_' + pollId;
}

function getSuggestions(pollId) {
	var suggestionsObj = {};
	if(pollId in suggestions)
		suggestionsObj = suggestions[pollId];

	if(users[this.id].poll != pollId) {
		// Leave room
		if(users[this.id].poll != null) {
			this.leave(room(users[this.id].poll));
		}

		// Join room
		this.join(room(pollId));
		users[this.id].poll = pollId;
	}

	this.emit('suggestions', pollId, suggestionsObj);
}

function onVote(suggestionId, newValue) {
	if(newValue != 1 && newValue != -1) {
		this.emit('modal', 'Erreur', 'Modifier le code pour tenter de voter plus que 1, c\'est mal.<br><br><b>Vous avez été déconnecté.</b>');
		this.disconnect();
		return;
	}

	var userId = users[this.id].id;

	if(suggestionId in suggestionsPolls) {
		var oldValue = 0;
			
		if(suggestionId in votes && userId in votes[suggestionId]) 
			oldValue = votes[suggestionId][userId];

		if(oldValue != newValue) {
			var ok = updateScore(suggestionId, newValue - oldValue);

			if(ok) {
				sql.vote(suggestionId, userId, newValue);

				setVote(suggestionId, userId, newValue);
				Log.debug('[Vote] S%s: %d by U%s', suggestionId, newValue, userId);
			}
		} else {
			this.emit('console', 'Erreur: Vous avez déjà voté la même chose pour cette suggestion !');
		}
	}
}

function setVote(suggestionId, userId, value) {
	if(!(suggestionId in votes))
		votes[suggestionId] = {};

	votes[suggestionId][userId] = value;
}

function updateScore(suggestionId, value) {
	if(!(suggestionId in suggestionsPolls))
		return false;

	var pollId = suggestionsPolls[suggestionId];
	if(!(pollId in suggestions) || !(suggestionId in suggestions[pollId]))
		return false;

	var newValue = suggestions[pollId][suggestionId].score += value;

	io.to(room(pollId)).emit('update vote', suggestionId, newValue);

	return true;
}

function createSuggestion(id, title, desc, userId) {
	return {
		id: id,
		title: title,
		description: desc,
		author: users[userId].name,
		score: 0
	}
}

function addSuggestion(title, desc) {
	var userId = this.id;
	var pollId = users[userId].poll;
	var authorId = users[userId].id;

	if(!pollId in polls || typeof title != 'string' || typeof desc != 'string') {
		this.emit('modal', 'Erreur', 'Impossible d\'ajouter une suggestion.<br><br><b>Vous avez été déconnecté.</b>');
		this.disconnect();
		return;
	}

	if(!polls[pollId].type_big && desc.length != 0) {
		this.emit('modal', 'Erreur', 'Il n\'est pas possible de mettre une description pour cette suggestion.<br><br><b>Vous avez été déconnecté.</b>');
		this.disconnect();
		return;
	}

	if(title.length > 20 || desc.length > 150) {
		this.emit('modal', 'Erreur', 'Votre titre ou votre description dépasse la taille maximale autorisée.<br><br><b>Vous avez été déconnecté.</b>');
		this.disconnect();
		return;
	}

	sql.addSuggestion(title, desc, pollId, authorId, function addSuggestionCB(insertedId) {
		if(insertedId != -1) {
			var suggestion = createSuggestion(insertedId, title, desc, userId);

			suggestionsPolls[insertedId] = pollId;

			if(!(pollId in suggestions))
				suggestions[pollId] = {};

			suggestions[pollId][insertedId] = suggestion;

			io.to(room(pollId)).emit('suggestion', pollId, suggestion);
		}
	});
}

function cleanId(id) {
	return id.replace(cleanIdRegex, '');
}

INIT();