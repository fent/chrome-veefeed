/* global chrome */

chrome.options.opts.autoSave = false;
var sources = [
  { value: 'youtube', desc: 'YouTube', default: true },
  { value: 'twitch', desc: 'Twitch', default: false },
  { value: 'haloruns', desc: 'HaloRuns', default: false, col: true },
  { value: 'speedrundotcom', desc: 'speedrun.com', default: false, col: true },
];

// Used for ignore and group rules.
var rules = [
  { type: 'select', name: 'source', desc: 'Source',
    options: [{ value: '', desc: 'Any' }].concat(sources) },
  { type: 'text', name: 'user', desc: 'User' },
  { type: 'text', name: 'title', desc: 'Title' },
  { type: 'text', name: 'game', desc: 'Game',
    bindTo: { field: 'source', value: ['twitch', 'haloruns', ''] } },
];

var mergeSources = [{ value: '', desc: 'Select' }]
  .concat(sources.filter(function(source) { return !source.col; }));

chrome.options.set([
  { name: 'sources', type: 'object', options: sources.map(function(source) {
    return {
      name: source.value,
      desc: 'Enable ' + source.desc,
      default: source.default,
    };
  }),
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
    desc: 'Open videos in the same tab' },
  { name: 'pause_other_tabs', default: true,
    desc: 'Pause other video tabs from the same window ' +
          'when opening a new tab'},
  { name: 'show_notifications', desc: 'Show notifications on new videos' },
  { name: 'play_sound', type: 'predefined_sound', allowNoSound: true,
    desc: 'Play sound on new videos' },
  { name: 'show_watched', desc: 'Show watched videos too' },
  { name: 'only_play_queued_at_top', default: true,
    desc: 'Only play next queued video if at the top of the page' },
  { type: 'h3', desc: 'Ignore Rules' },
  { name: 'ignore', type: 'list',
    sortable: true, head: true, collapsible: true, fields: rules,
    desc: 'Ignore videos matching the following ' +
          '(Use * to match any string)' },
  { name: 'ignore_live', desc: 'Ignore live videos' },
  { name: 'ignore_future', desc: 'Ignore future videos' },
  { name: 'show_ignored_tab', preview: 'png',
    desc: 'Show tab for ignored videos' },
  { type: 'h3', desc: 'Groups' },
  { name: 'groups', type: 'list', sortable: true, preview: 'png',
    desc: 'Categorize videos and group them into tabs ' +
          '(Use * to match any string)',
    filter: function(row) {
      return row.name && row.rules && row.rules.length;
    }, fields: [{
      type: 'column', options: [
        { type: 'row', options: [
          { type: 'text', name: 'name', desc: 'Name', singleline: true },
          { type: 'checkbox', name: 'only',
            desc: 'Don\'t match additional groups' }
        ]},
        { type: 'list', name: 'rules',
          sortable: true, head: true, fields: rules }
      ]
    }]},
  { name: 'show_ungrouped',
    desc: 'Show tab for ungrouped videos instead of All videos tab' },
  { name: 'hide_empty_tabs', desc: 'Hide tabs without videos' },
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
          'Merged videos will have multiple accounts listed.',
    preview: 'png'}
]);
