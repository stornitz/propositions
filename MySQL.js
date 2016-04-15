var mysql = require('mysql');

exports.MySQL = function MySQL(mysqlConfig) {
	// config auth
	mysqlConfig.waitForConnections = false;

	// Permet de bind :value => value
	mysqlConfig.queryFormat = function (query, values) {
			if (!values) return query;
			return query.replace(/\:(\w+)/g, function (txt, key) {
				if (values.hasOwnProperty(key)) {
					return this.escape(values[key]);
				}
				return txt;
			}.bind(this));
		};

	var pool = mysql.createPool(mysqlConfig);

	function getConnection(callback, finishedCallback) {
		pool.getConnection(function getPoolConnection(err, connection) {
			if (err) {
				Log.error('[SQL] CANNOT CONNECT TO DATABASE => ' + err);
				return;
			}

			callback(connection, function getConnectionCallback() {
				connection.release();
				finishedCallback.apply(this, arguments)
			});
		});
	}

	function error(error) {
		return function(err) {
			if(err) {
				Log.error('[SQL] ' + error, err);
			}
		}
	}

	var createDB = function createDB(callback) {
		Log.debug('Creating DB...');

		pool.query(
			'CREATE TABLE IF NOT EXISTS `polls` (' +
				'`id` int(11) NOT NULL AUTO_INCREMENT,' +
				'`name` varchar(25) NOT NULL,' +
				'`type_big` tinyint(1) NOT NULL,' +
				'PRIMARY KEY (`id`)' +
			') ENGINE=InnoDB DEFAULT CHARSET=latin1;'
		, error('Cannot create table polls'));

		pool.query(
			'CREATE TABLE IF NOT EXISTS `suggestions` (' +
				'`id` int(11) NOT NULL AUTO_INCREMENT,' +
				'`poll_id` int(11) NOT NULL,' +
				'`title` varchar(20) NOT NULL,' +
				'`description` varchar(150) NOT NULL,' +
				'`author_id` int(11) NOT NULL,' +
				'PRIMARY KEY (`id`)' +
			') ENGINE=InnoDB DEFAULT CHARSET=latin1;'
		, error('Cannot create table suggestions'));

		pool.query(
			'CREATE TABLE IF NOT EXISTS `users` (' +
				'`id` int(11) NOT NULL AUTO_INCREMENT AUTO_INCREMENT,' +
				'`email` varchar(19) NOT NULL,' +
				'`name` varchar(25) NOT NULL,' +
				'PRIMARY KEY (`id`)' +
			') ENGINE=InnoDB DEFAULT CHARSET=latin1;'
		, error('Cannot create table users'));

		pool.query(
			'CREATE TABLE IF NOT EXISTS `votes` (' +
				'`id` int(11) NOT NULL AUTO_INCREMENT,' +
				'`suggestion_id` int(11) NOT NULL,' +
				'`value` int(11) NOT NULL,' +
				'`voter_id` int(11) NOT NULL,' +
				'PRIMARY KEY (`id`),' +
				'UNIQUE KEY `suggestion_id` (`suggestion_id`,`voter_id`)' +
			') ENGINE=InnoDB DEFAULT CHARSET=latin1;'
		, error('Cannot create table votes'));

		Log.debug('DB created.');
		callback();
	}

	var getUser = function getUser(email, callback) {
		pool.query('SELECT id, name FROM users WHERE email = :email', {
			email: email
		}, function(err, res) {
			if(err) {
				Log.error('[SQL] Error getting user "%s": %s', email, err);
			}

			callback((res != null && res.length > 0) ? res[0] : null);
		});
	}

	var getPolls = function getPolls(callback) {
		pool.query('SELECT id, name, type_big FROM polls', function(err, res) {
			if(err) {
				Log.error('[SQL] Error getting polls', err);
			}

			callback(res != null ? res : []);
		});
	}

	var getSuggestions = function getSuggestions(callback) {
		var query = 'SELECT suggestions.id, suggestions.poll_id, suggestions.description, suggestions.title, users.name AS author, COALESCE(SUM(votes.value),0) AS score ' +
					'FROM suggestions ' +
					'LEFT JOIN users ON suggestions.author_id = users.id ' +
					'LEFT JOIN votes ON votes.suggestion_id = suggestions.id ' +
					'GROUP BY suggestions.id';

		pool.query(query, function(err, res) {
			if(err) {
				Log.error('[SQL] Error getting suggestions', err);
			}

			callback(res != null ? res : []);
		});
	}

	var addSuggestion = function addSuggestion(title, desc, pollId, authorId, callback) {
		var query = 'INSERT INTO suggestions (title, description, poll_id, author_id) VALUES (:title, :description, :poll_id, :author_id)';

		pool.query(query, {
			title: title,
			description: desc,
			poll_id: pollId,
			author_id: authorId
		}, function(err, res) {
			if(err) {
				Log.error('[SQL] Error adding suggestions ', err);
			}

			callback(res != null ? res.insertId : -1);
		});
	};

	var getVotes = function getVotes(callback) {
		pool.query('SELECT suggestion_id, voter_id, value FROM votes', function(err, res) {
			if(err) {
				Log.error('[SQL] Error getting votes', err);
			}

			callback(res != null ? res : []);
		});
	}

	var vote = function vote(suggestionId, userId, value) {
		var query = 'INSERT INTO votes (suggestion_id, value, voter_id) VALUES (:suggestion_id, :value, :user_id) ON DUPLICATE KEY UPDATE value = :value;'
	
		pool.query(query, {
			suggestion_id: suggestionId,
			value: value,
			user_id: userId
		}, function(err, res) {
			if(err) {
				Log.error('[SQL] Error vote U%sS%s (%s) : %s', userId, suggestionId, value, err);
			}
		});
	}

	return {
		createDB: createDB,
		getPolls: getPolls,
		getSuggestions: getSuggestions,
		getVotes: getVotes,

		getUser: getUser,
		vote: vote,
		addSuggestion: addSuggestion
	}
}