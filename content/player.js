window.getPlayer = function(callback) {
  var isTwitch = window.location.hostname === 'www.twitch.tv';
  var isCorrectPlayer = isTwitch ?
    function(player) { return player.getVideoTime; } :
    function(player) { return player.playVideo || player.play; } ;

  function getElement(byId, name) {
    var player = byId ?
      document.getElementById(name) : document.getElementsByTagName(name)[0];
    return player && isCorrectPlayer(player) ? player : null;
  }

  function searchPlayer() {
    return getElement(true, 'movie_player') ||
      getElement(true, 'player1') ||
      getElement(false, 'video') ||
      getElement(false, 'object') ||
      getElement(false, 'embed');
  }

  var player = searchPlayer();
  if (player) {
    callback(player);
  } else {
    // If there is no video initially, check for one every sec.
    var maxAttempts = 10;
    var iid = setInterval(function() {
      player = searchPlayer();
      if (player) {
        callback(player);
      }
      if (player || --maxAttempts === 0) {
        clearInterval(iid);
      }
    }, 1000);
  }
};
