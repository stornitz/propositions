var google = require('googleapis');
var plus = google.plus('v1');
var OAuth2Client = google.auth.OAuth2;

exports.GoogleAuth = function GoogleAuth(config) {
	var client = config.CLIENT_ID;
	var secret = config.CLIENT_SECRET;
	var redirect = config.serverUrl + '/callback';

	var oauth2Client = new OAuth2Client(client, secret, redirect);

	var authUrl = oauth2Client.generateAuthUrl({
			scope: 'email'
		});

	var getAuthUrl = function getAuthUrl() {
		return authUrl;
	}

	var getAccessToken = function getAccessToken(code, callback) {
		oauth2Client.getToken(code, function(err, tokens) {
			if(tokens == null) {
				callback(true);
			} else {
				// set tokens to the client
				oauth2Client.setCredentials(tokens);
				callback(false);
			}
		});
	}

	var getEmail = function getEmail(code, callback) {
		getAccessToken(code, function getAccessTokenDB(err) {
			if(err) {
				callback(null);
				return;
			}

			plus.people.get({ userId: 'me', auth: oauth2Client }, function peopleGetCB(err, profile) {
			    if(!err && 'emails' in profile && profile.emails.length > 0 && 'value' in profile.emails[0]) {
			    	callback(profile.emails[0].value);
			    } else {
			    	callback(null);
			    }
			});
		});
	}

	return {
		getAuthUrl: getAuthUrl,
		getEmail: getEmail
	}
}