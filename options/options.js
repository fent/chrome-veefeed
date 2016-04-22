/* global chrome */

chrome.options.opts.autoSave = false;
var sources = [
  { value: 'youtube', desc: 'YouTube' },
  { value: 'twitch', desc: 'Twitch' },
];

// Used for ignore and group rules.
var rules = [
  { type: 'select', name: 'source', desc: 'Source',
    options: [{ value: '', desc: 'Any' }].concat(sources) },
  { type: 'text', name: 'user', desc: 'User' },
  { type: 'text', name: 'title', desc: 'Title' },
  { type: 'text', name: 'game', desc: 'Game',
    bindTo: { field: 'source', value: 'twitch' } },
];

chrome.options.fields.group = function(value, save) {
  if (value == null || typeof value !== 'object') {
    value = {};
  }

  function saveField(fieldName) {
    return function(newValue) {
      value[fieldName] = newValue;
      save(value);
    };
  }

  var $container = $('<div class="group"></div>');
  var $name = $('<div></div>').appendTo($container);
  $('<label>').text('Name: ').appendTo($name);
  chrome.options.fields.text(value.name, saveField('name'))
    .appendTo($name);
  chrome.options.base.list(value.rules, saveField('rules'), {
    sortable: true,
    head: true,
    fields: rules,
  }).appendTo($container);

  return $container;
};

var mergeSources = [{ value: '', desc: 'Select' }].concat(sources);

chrome.options.set([
  { name: 'sources', type: 'object', options: [
    { name: 'youtube', default: true, desc: 'Enable YouTube' },
    { name: 'twitch', default: false, desc: 'Enable Twitch' },
    ],
    desc: 'Must be logged in to be able to retrieve videos' },
  { name: 'interval', type: 'select', default: 15, options: [
    { value: 5,  desc: '5 minutes' },
    { value: 10, desc: '10 minutes' },
    { value: 15, desc: '15 minutes' },
    { value: 20, desc: '20 minutes' },
    { value: 30, desc: '30 minutes' },
    { value: 45, desc: '45 minutes' },
    { value: 60, desc: '1 hour' },
    { value: 180, desc: '3 hours' },
    { value: 360, desc: '6 hours' },
    { value: 720, desc: '12 hours' },
    { value: 1440, desc: '1 day' },
    ],
    desc: 'How often to check for updates' },
  { name: 'use_same_tab', default: true,
    desc: 'Open videos in the same tab when from the same window' },
  { name: 'show_notifications', desc: 'Show notifications on new videos' },
  { name: 'play_sound', type: 'predefined_sound', allowNoSound: true,
    desc: 'Play sound on new videos' },
  { name: 'show_watched', desc: 'Show watched videos too' },
  { type: 'h3', desc: 'Ignore Rules' },
  { name: 'ignore', type: 'list',
    sortable: true, head: true, collapsible: true, fields: rules,
    desc: 'Ignore videos matching the following ' +
          '(Use * to match any string)' },
  { name: 'show_ignored_tab', preview: 'png',
    desc: 'Show tab for ignored videos' },
  { type: 'h3', desc: 'Groups' },
  { name: 'groups', type: 'group-list', sortable: true, preview: 'png',
    desc: 'Categorize videos and group them into tabs ' +
          '(Use * to match any string)',
    filter: function(row) {
      return row.name && row.rules && row.rules.length;
    }},
  { name: 'show_ungrouped',
    desc: 'Show tab for ungrouped videos instead of All videos tab' },
  { type: 'h3', desc: 'Merge Videos' },
  { name:'merge', type: 'list', sortable: true, head: true, fields: [
      { type: 'select', name: 'source1', required: true,
        options: mergeSources, desc: 'Preferred Source' },
      { type: 'text', name: 'username1', required: true, desc: 'Username' },
      { type: 'select', name: 'source2', required: true,
        options: mergeSources, desc: 'Other Source' },
      { type: 'text', name: 'username2', required: true, desc: 'Username' },
    ],
    desc: 'If you\'re following a user who uploads videos on more ' +
          'than one site, they may sometimes upload the same ' +
          'video on both accounts. ' +
          'Merged videos will have two source icons next to the username.',
    preview: 'png'}
]);
