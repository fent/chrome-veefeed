/* global chrome */

chrome.options.opts.autoSave = false;
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
	{ name: 'play_sound', type: 'checkbox-predefined_sound',
		defaultValue: 'Hero', desc: 'Play sound on new videos' },
	{ type: 'h3', desc: 'Ignore Rules' },
	{ name: 'ignore', type: 'list', sortable: true, head: true,
		desc: 'Ignore videos matching the following ' +
			    '(Use * to match any string)', fields: [
			{ type: 'select', name: 'source', desc: 'Source', options: [
				{ value: '', desc: 'Select' },
				{ value: 'youtube', desc: 'YouTube' },
				{ value: 'twitch', desc: 'Twitch' },
			] },
			{ type: 'text', name: 'user', desc: 'User' },
			{ type: 'text', name: 'title', desc: 'Title' },
			{ type: 'text', name: 'game', desc: 'Game',
				bindTo: { field: 'source', value: 'twitch' } },
		]},
	{ name: 'show_ignored_tab', preview: 'png',
		desc: 'Show tab for ignored videos' },
]);
