/* global chrome */

chrome.options.opts.autoSave = false;
chrome.options.set([
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
		transform: function(value) { return parseInt(value, 10); },
	  desc: 'How often to check for updates' },
	{ name: 'use_same_tab', default: true,
		desc: 'Open videos in the same tab when from the same window' },
]);
