/* global getPlayer, chrome */

getPlayer(function(player) {
  player.addEventListener('ended', function onEnded() {
    chrome.runtime.sendMessage({ ended: true });
    player.removeEventListener('ended', onEnded);
  });
});
