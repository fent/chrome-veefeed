import * as util from '../../util.js';
import SizedMap from '../../SizedMap.js';

import ytdl from '../../../lib/ytdl-core.min.js';
const ytdlCache = new SizedMap(100, 'cache-youtube', 1000 * 60 * 60); // 1hr

export default {
  patterns: [
    '*://www.youtube.com/watch?*v=*',
    '*://m.youtube.com/watch?*v=*',
    '*://youtu.be/*',
    '*://music.youtube.com/watch?*v=*',
    '*://gaming.youtube.com/watch?*v=*',
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
      length: parseInt(info.videoDetails.lengthSeconds),
      title: info.videoDetails.title,
      views: info.videoDetails.viewCount,
      user: {
        url: info.author.channel_url,
        name: info.author.name,
        image: info.author.avatar,
        verified: info.author.verified,
      },

      // Using medium quality gives a screenshot without black bars.
      thumbnail: 'https://i.ytimg.com/vi/' + info.videoDetails.videoId +
        '/mqdefault.jpg?custom=true&w=196&h=110&stc=true&jpg444=true&' +
        'jpgq=90&sp=68',

      game: info.media && info.media.game ? {
        name: info.media.game,
        url: info.media.game_url,
        image: info.media.thumbnails[0],
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
    let match = /window\["ytInitialData"\] = (JSON\.parse\(")?(.+?)(?:"\))?;\n/
      .exec(body);
    if (!match) {
      throw Error('Unable to find youtube data');
    }
    let response = match[2];
    if (match[1]) {
      response = response.replace(/\\([\\"])/g, '$1');
    }
    try {
      response = JSON.parse(response);
    } catch (err) {
      throw Error('Error parsing videos: ' + err.message);
    }

    const getItemText = item => {
      return item && (item.simpleText || item.runs && item.runs[0] && item.runs[0].text) || null;
    };

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

        const timestamp = item.publishedTimeText ?
          util.relativeToTimestamp(getItemText(item.publishedTimeText)) :
          item.upcomingEventData ?
            parseInt(item.upcomingEventData.startTime) * 1000 : null;
        let views = getItemText(item.viewCountText);

        const parsedItem = {
          user: {
            url: userUrl,
            image: (
              item.channelThumbnail ||
              item.channelThumbnailSupportedRenderers
                .channelThumbnailWithLinkRenderer.thumbnail
            ).thumbnails[0].url,
            name: user.text,
            verified: item.ownerBadges && item.ownerBadges.some((badge) => {
              return badge.tooltip == 'Verified';
            }),
          },
          url: videoUrl,
          thumbnail,
          title: getItemText(item.title),
          desc: getItemText(item.descriptionSnippet),
          length: util.timeToSeconds(getItemText(item.lengthText)),
          views: views ? parseInt(views.replace(/,/g, '')) : null,
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
        return parsedItem;
      });
  },
};
