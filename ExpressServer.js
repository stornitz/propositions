var express = require('express');
var SessionFileStore = require('session-file-store');
var GoogleAuth = require('./GoogleAuth').GoogleAuth;
var helmet = require('helmet');

exports.ExpressServer = function ExpressServer(config, Session, getUser) {
	var app = express();

	var gapi = new GoogleAuth(config);
	var session;

	var setup = function setup() {	
		// HTML template with variables 
		app.set('view engine', 'ejs');  

		// Protection vulnerabilities
		app.use(helmet());

		// Sessions
		var FileStore = SessionFileStore(Session);

		var sessionCfg = {
			store: new FileStore({logFn: function(){}}),
			secret: config.sessionSecret,
			resave: false,
			saveUninitialized: false,
			name: 'SESSION_ID',
			proxy: true,
			cookie: {
				maxAge: 24*3600000,
				httpOnly: true
			}
		};

		if (app.get('env') === 'production') {
			Log.info('[Express] PRODUCTION MODE')
			app.set('trust proxy', 'loopback') // trust first proxy
			sessionCfg.cookie.secure = true // serve secure cookies
		} else {
			Log.info('[Express] DEV MODE')
		}

		session = Session(sessionCfg);
		app.use(session);

		setupRoutes();

		// Use directory to serve files
		app.use(express.static('public'));
	}

	var getSession = function getSession() {
		return session;
	}

	function setupRoutes() {
		app.get('/login', onLogin);
		app.get('/', onIndex);
		app.get('/js/client.js', onClientJs);
		app.get('/callback', onCallback);
		app.get('/disconnect', onDisconnect);
	}

	function onDisconnect(req, res, next) {
		req.session.destroy();
		res.redirect('/login');
	}

	function onIndex(req, res, next) {
		if(req.session.logged) {
			res.render('pages/index', {host: config.serverUrl, name: req.session.user.name})
		} else {
			res.redirect('/login');
		}
	}

	function onClientJs(req, res, next) {
		if(!req.session.logged) {
			res.sendStatus(403);
		} else {
			next();
		}
	}

	function onLogin(req, res, next) {
		if(req.session.refused) {
			res.render('pages/login', { href: gapi.getAuthUrl(), classes: 'refused tooltipped', msg: 'Accès refusé' });
		} else if(!req.session.logged) {
			res.render('pages/login', { href: gapi.getAuthUrl(), classes: '', msg: 'Se connecter avec Google' });
		} else {
			res.redirect('/');
		}
	}

	function onCallback(req, res, next) {
		var code = req.query.code;
		gapi.getEmail(code, function getEmailCB(email) {
			if(email == null) {
				res.sendStatus(400);
			} else {
				getUser(email, function getUserCB(user) {
					if(user != null) {
						req.session.logged = true;
						req.session.user = user;

						if(req.session.refused)
							req.session.refused = false;
						
						res.redirect('/');

						Log.info('[ACCEPTED] %s', email);
					} else {
						req.session.refused = true;
						res.redirect('/login');

						Log.info('[DENIED] %s', email);
					}
				});
			}
		});
	}

	var getApp = function getApp() {
		return app;
	}

	/* RETURN */
	return {
		getApp: getApp,
		setup: setup,
		getSession: getSession
	}
}