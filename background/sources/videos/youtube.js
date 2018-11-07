import * as util from '../../util.js';
import SizedMap from '../../SizedMap.js';

import ytdl from '../../../lib/ytdl-core.min.js';
const ytdlCache = new SizedMap(100, 'cache-youtube', 1000 * 60 * 60); // 1hr


// ytdl-core requires the User-Agent header to be empty to scrape the watch
// page correctly. XMLHttpRequest doesn't allow removing this header,
// so we have to use the `webRequest` API.
// Removing the header from the list of headers doesn't work either,
// we have to set it to a blank value.
chrome.webRequest.onBeforeSendHeaders.addListener((details) => {
  let header = details.requestHeaders.find(h => h.name === 'User-Agent');
  if (header) { header.value = ''; }
  return { requestHeaders: details.requestHeaders };
}, {
  urls: [
    'https://www.youtube.com/watch?v=*',
    'https://www.youtube.com/get_video_info*'
  ],
  types: ['xmlhttprequest'],
}, ['blocking', 'requestHeaders']);

export default {
  patterns: [
    '*://www.youtube.com/watch?v=*',
    '*://m.youtube.com/watch?v=*',
    '*://youtu.be/*',
    '*://music.youtube.com/watch?v=*',
    '*://gaming.youtube.com/watch?v=*',
  ],
  getVideo: async (url) => {
    const id = ytdl.getURLVideoID(url);
    if (ytdlCache.has(id)) {
      return ytdlCache.get(id);
    }
    const info = await ytdl.getBasicInfo(url);
    const meta = {
      // Canonical YouTube URL.
      url: info.video_url,
      length: parseInt(info.length_seconds),
      title: info.title,
      views: parseInt(info.view_count),
      user: {
        url: info.author.channel_url,
        name: info.author.name,
        image: info.author.avatar,
        verified: info.author.verified,
      },

      // Using medium quality gives a screenshot without black bars.
      thumbnail: 'https://i.ytimg.com/vi/' + info.video_id +
        '/mqdefault.jpg?custom=true&w=196&h=110&stc=true&jpg444=true&' +
        'jpgq=90&sp=68',

      game: info.media && info.media.game ? {
        name: info.media.game,
        url: info.media.game_url,
        image: info.media.image,
      } : null,
    };
    ytdlCache.push(id, meta);
    return meta;
  },
  getAllVideos: async () => {
    const body = await util.ajax('https://www.youtube.com/feed/subscriptions', {
      data: { 'flow': 2 },
      responseType: 'text',
    });
    const key = 'window["ytInitialData"] = ';
    let response = body;
    response = response.slice(response.indexOf(key) + key.length);
    response = response.slice(0, response.indexOf('}}};') + 3);
    try {
      response = JSON.parse(response);
    } catch (err) {
      throw Error('Error parsing videos: ' + err.message);
    }

    return response
      .contents
      .twoColumnBrowseResultsRenderer
      .tabs[0]
      .tabRenderer
      .content
      .sectionListRenderer
      .contents.map((item) => {
        item = item
          .itemSectionRenderer
          .contents[0]
          .shelfRenderer
          .content
          .expandedShelfContentsRenderer
          .items[0]
          .videoRenderer;

        const user = item.ownerText.runs[0];
        const userUrl = 'https://www.youtube.com' +
          (user.navigationEndpoint.browseEndpoint.canonicalBaseUrl ||
           user.navigationEndpoint.commandMetadata.webCommandMetadata.url);
        const videoUrl = 'https://www.youtube.com/watch?v=' + item.videoId;

        // YouTube videos sometimes don't have thumbnails loaded until
        // the page is scrolled down.
        const thumbnail = 'https://i.ytimg.com/vi/' + item.videoId +
          '/mqdefault.jpg?custom=true&w=196&h=110&stc=true&jpg444=true&' +
          'jpgq=90&sp=68';

        const length = item.lengthText;
        const timestamp = item.publishedTimeText ?
          util.relativeToTimestamp(item.publishedTimeText.simpleText) :
          item.upcomingEventData ?
            parseInt(item.upcomingEventData.startTime) * 1000 : null;
        let views = item.viewCountText;
        views = views && views.simpleText ?  views.simpleText :
          views && views.runs ? views.runs[0].text : null;

        return {
          user: {
            url: userUrl,
            image: item.channelThumbnailSupportedRenderers
              .channelThumbnailWithLinkRenderer.thumbnail.thumbnails[0].url,
            name: user.text,
            verified: item.ownerBadges && item.ownerBadges.some((badge) => {
              badge.tooltip == 'Verified';
            }),
          },
          url: videoUrl,
          thumbnail,
          title: item.title.simpleText,
          desc: item.descriptionSnippet && item.descriptionSnippet.simpleText,
          length: length ? util.timeToSeconds(length.simpleText) : null,
          views: views ?  parseInt(views.replace(/,/g, '')) : null,
          timestamp,
          live: item.badges && timestamp < Date.now() &&
            item.badges.some((badge) => {
              const label = badge.metadataBadgeRenderer.label;
              if (label) {
                return label == 'LIVE NOW';
              } else {
                return false;
              }
            }),
          watched: item.isWatched,
        };
      });
  },
};
