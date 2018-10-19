import * as util from '../../util.js';


export default {
  patterns: [
    '*://www.youtube.com/watch?v=*',
    '*://m.youtube.com/watch?v=*',
    '*://youtu.be/*',
  ],
  getVideo: (url, callback) => {
    const r = /(?:v=|youtu\.be\/)([^?&$]+)/.exec(url);
    let id;
    if (r) {
      id = r[1];
    } else {
      console.warn('Could not get video ID of URL: ' + url);
      return callback();
    }
    util.ajax('https://www.youtube.com/get_video_info' +
    '?ps=default&gl=US&hl=en&video_id=' + id, {
      cache: {
        transform: (response) => {
          if (response.status === 'fail') {
            return callback();
          }
          return {
            length: parseInt(response.length_seconds, 10),
            title: response.title,
            views: parseInt(response.view_count, 10),
            user: { name: response.author },
          };
        },
        ttl: 1800000,
      },
    }, (xhr, meta) => {
      if (!meta) { return callback(); }
      callback({
        // Canonical form of URL.
        url: 'https://www.youtube.com/watch?v=' + id,

        // Using medium quality gives a screenshot without black bars.
        thumbnail: 'https://i.ytimg.com/vi/' + id +
          '/mqdefault.jpg?custom=true&w=196&h=110&stc=true&jpg444=true&' +
          'jpgq=90&sp=68',

        length: meta.length,
        title: meta.title,
        views: meta.views,
        user: meta.user,
        game: null,
      });
    });
  },
  getAllVideos: (callback) => {
    util.ajax('https://www.youtube.com/feed/subscriptions?flow=2',
      { responseType: 'text' }, (xhr, body) => {
        if (!body) { return callback(); }
        const key = 'window["ytInitialData"] = ';
        let response = body;
        response = response.slice(response.indexOf(key) + key.length);
        response = response.slice(0, response.indexOf('}}};') + 3);
        try {
          response = JSON.parse(response);
        } catch (err) {
          console.error('Error parsing videos ' + err.message);
        }

        callback(response
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
            // the page is scrolle down.
            const thumbnail = 'https://i.ytimg.com/vi/' + item.videoId +
              '/mqdefault.jpg?custom=true&w=196&h=110&stc=true&jpg444=true&' +
              'jpgq=90&sp=68';

            const length = item.lengthText;
            const timestamp = item.publishedTimeText ?
              util.relativeToTimestamp(item.publishedTimeText.simpleText) :
              item.upcomingEventData ?
                parseInt(item.upcomingEventData.startTime, 10) * 1000 : null;
            let views = item.viewCountText;
            views = views && views.simpleText ?  views.simpleText :
              views && views.runs ? views.runs[0].text : null;

            return {
              user: {
                url: userUrl,
                thumbnail: item.channelThumbnail.thumbnails[0].url,
                name: user.text,
                verified: item.ownerBadges && item.ownerBadges.some((badge) => {
                  badge.tooltip == 'Verified';
                }),
              },
              url: videoUrl,
              thumbnail,
              title: item.title.simpleText,
              desc:
                item.descriptionSnippet && item.descriptionSnippet.simpleText,
              length: length ? util.timeToSeconds(length.simpleText) : null,
              views: views ?  parseInt(views.replace(/,/g, ''), 10) : null,
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
          }));
      });
  },
};
