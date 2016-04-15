var socket;
var $navbar;
var $sidenav;
var $suggestions;
var $title;
var $description;
var $addButton;
var $addModalButton;
var $onlineCount;
var $onlineUsers;
var $onlineDisplays;
var $offlineDisplays;

var pollsType = {};
var type_big;

function init() {
	$navbar = $('#navbar');
	$sidenav = $('#sidenav-content');
	$suggestions = $('#suggestions');
	$title = $('#title');
	$description = $('#description');
	$addButton = $('#add-button');
	$addModalButton = $('#add-modal-button');
	$onlineCount = $('.online-count');
	$onlineUsers = $('#online-users-list');
	$onlineDisplays = $('.online-only-display');
	$offlineDisplays = $('.offline-only-display');
}

function connect() {
	console.log('Connecting...')
	socket = io(HOST);
	socket.once('connect', onConnect);
}

function onConnect() {
	console.log('Connected');
	$onlineDisplays.show();
	$offlineDisplays.hide();

	socket.on('update vote', updateVote);
	socket.on('suggestions', onSuggestions);
	socket.on('suggestion', onSuggestion);
	socket.on('polls', onPolls);
	socket.on('modal', openModal);
	socket.on('console', onConsole);
	socket.on('new user', onNewUser);
	socket.on('users', onUsers);
	socket.on('quit user', onUserQuit);

	socket.once('disconnect', onDisconnect);
}

function onUsers(users, newCount) {
	$onlineUsers.empty();
	updateOnlineCount(newCount)

	for(i in users) {
		addUser(users[i]);
	}
}

function addUser(user) {
	var html = copy('online-user', user);
	$onlineUsers.append(html);
}

function onNewUser(newUser, newCount) {
	addUser(newUser);
	updateOnlineCount(newCount)
}

function onUserQuit(oldUserId, newCount) {
	$('#u' + oldUserId).remove();

	updateOnlineCount(newCount)
}

function updateOnlineCount(count) {
	$onlineCount.text(count);
}

function onConsole(msg) {
	console.log(msg);
}

function openModal(title, text) {
	var $modal = $('#msg-modal');
	$modal.find('.title').html(title);
	$modal.find('.text').html(text);
	$modal.openModal();
}

function updateVote(suggestionId, newScore) {
	var $suggestion = $('#s' + suggestionId);

	if($suggestion === null) {
		console.log('suggestion not found');
		return;
	}

	// on change le score
	var oldScore = $suggestion[0].dataset.score;
	$suggestion[0].dataset.score = newScore;
	$suggestion.find('.score').html(newScore);

	if(newScore < 0) {
		$suggestion.addClass('card-disabled');
	} else if($suggestion.hasClass('card-disabled')) {
		$suggestion.removeClass('card-disabled');
	}

	moveSuggestion($suggestion, oldScore, newScore);
}

function moveSuggestion($suggestion, oldScore, newScore) {
	var children = $suggestions.children();
	var index = $suggestion.index();
	if(oldScore < newScore && index > 0) {
		var newIndex = index;
		while(newIndex > 0 && newScore > children[newIndex-1].dataset.score) {
			newIndex--;
		}
		$suggestion.insertBefore($(children[newIndex]))
	} else if(oldScore > newScore && index < children.length-1) {
		var newIndex = index;
		while(newIndex < children.length-1 && newScore < children[newIndex+1].dataset.score) {
			newIndex++;
		}
		$suggestion.insertAfter($(children[newIndex]))
	}		
}

function onSuggestions(pollId, suggestions) {
	$suggestions.empty();

	for(i in suggestions) {
		onSuggestion(pollId, suggestions[i]);
	}
}

function copy(modelId, data) {
	var model = $('#' + modelId);
	var html = model.html();

	for(var key in data) {
		var value = data[key];
		html = html.replace(new RegExp('%' + key + '%', 'gi'), value);
	}

	return html;
}

// ajoute une suggestion au bon endroit
function addSuggestion(suggestionHTML, score) {
	var children = $suggestions.children();

	var i = 0;
	var added = false;
	while(i < children.length && !added) {
		var element = children[i];

		if(element.dataset.score < score) {
			added = true;
			$(suggestionHTML).insertBefore(element);
		}

		i++;
	}

	if(!added) {
		$suggestions.append(suggestionHTML);
	}
}

function vote(suggestionId, value) {
	setVote(suggestionId, value);
	socket.emit('vote', suggestionId, value)
}

function setVote(suggestionId, value) {
	var suggestion = $('#s' + suggestionId);
	suggestion.removeClass('vote_1').removeClass('vote_-1');
	suggestion.addClass('vote_' + value);
}

function onSuggestion(pollId, suggestion) {
	var type = pollsType[pollId];

	if(type === undefined) {
		console.log('Poll not found');
		type = true;
		return;
	}

	var type = type ? 'big' : 'small';

	type += '-suggestion';

	var html = copy(type, suggestion);
	addSuggestion(html, suggestion.score);
	updateVote(suggestion.id, suggestion.score);
}

function onPolls(polls) {
	// On enlève ce qu'il y avait avant
	$navbar.empty();
	$sidenav.empty();

	for(i in polls) {
		var poll = polls[i];

		pollsType[poll.id] = poll.type_big;

		var html = copy('navbar-model', {
			id: poll.id,
			name: poll.name
		});

		$navbar.append(html);
		$sidenav.append(html);
	}

	var keys = Object.keys(polls);
	if(keys.length > 0)
		getSuggestions(keys[0]);
}

function getSuggestions(pollId) {
	$navbar.find('.active').removeClass('active');
	$sidenav.find('.active').removeClass('active');
	$('.poll' + pollId).addClass('active');

	socket.emit('get suggestions', pollId);
	type_big = pollsType[pollId];
}

function onDisconnect() {
	console.log('Disconnected');
	$navbar.empty();
	$sidenav.empty();
	$suggestions.empty();
	$onlineUsers.empty();

	$offlineDisplays.show();
	$onlineDisplays.hide();

	socket.removeAllListeners('update vote');
	socket.removeAllListeners('suggestions');
	socket.removeAllListeners('suggestion');
	socket.removeAllListeners('polls');
	socket.removeAllListeners('modal');
	socket.removeAllListeners('new user');
	socket.removeAllListeners('quit user');
	socket.removeAllListeners('users');
	socket.once('connect', onConnect);

}

function sendSuggestion() {
	if(!formValid())
		return;

	socket.emit('add suggestion', $title.val(), $description.val());
	eraseSuggestion();
}

function eraseSuggestion() {
	$title.val('');
	$description.val('');
}

/* #### HTML #### */
function onModalReady() {
	$description.prop('disabled', !type_big);
}
function formValid() {
	var titleLength = $title.val().trim().length;
	var descLength = $description.val().trim().length;
	return (0 < titleLength && titleLength <= 20) && (0 <= descLength && descLength <= 150) && (type_big || descLength == 0);
}

function enableButton() {
	if(formValid()) {
		if($addButton.hasClass('disabled'))
			$addButton.removeClass('disabled');
	} else {
		if(!$addButton.hasClass('disabled'))
			$addButton.addClass('disabled');
	}
}
/* ############## */

$(document).ready(function(){
	init();
	connect();


	$title.keyup(enableButton);
	$description.keyup(enableButton);

	$('.modal-trigger').leanModal({
		ready: onModalReady
	});
	$('input, textarea').characterCounter();
	$('.button-collapse').sideNav({
		closeOnClick: true
	});
});