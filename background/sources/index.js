import * as util from '../util.js';
import SizedMap from '../SizedMap.js';
import shorteners from './shorteners.js';


// Keep a local cache of videos, since some collections link to host sites,
// but will often not contain enough metainfo of the videos, such
// as the thumbnail, views, even the user.
//
// Note that this is different from ajax cache.
const cachedVideos = new SizedMap(200, 'cachedVideos');

// Keep an in memory cache in case there are errors retrieving videos
// in the future. If that happens, it will use the last successful result
// from that source.
const cachedResults = { videos: {}, collections: {} };

import youtube from './videos/youtube.js';
import twitch from './videos/twitch.js';
import haloruns from './collections/haloruns.js';
import speedrundotcom from './collections/speedrundotcom.js';

const sources = {
  // Sources which directly host videos.
  videos: {
    youtube,
    twitch,
  },

  // Sources that link to other websites' videos.
  collections: {
    haloruns,
    speedrundotcom,
  },

  getVideos: async (options) => {
    const fetchEnabledSources = async (type, isHost) => {
      return await Promise.all(Object.keys(sources[type])
        .filter(source => options[source])
        .map(async (source) => {
          let fn = sources[type][source];
          if (isHost) {
            fn = fn.getAllVideos;
          }
          let videos;
          try {
            videos = await fn();
            cachedResults[type][source] = videos;
          } catch (err) {
            console.warn(`Failed to get videos for ${source}: ${err.message}`);
            console.error(err);

            // Fallback to cached videos from this source if getting videos fails.
            videos = cachedResults[type][source] || [];
          }
          if (isHost) {
            return { source, videos };
          } else {
            videos = await util.parallelFilter(videos, sources.addMetaToVideo);
            return { source, videos };
          }
        }));
    };

    const [sourceResults, colResults] = await Promise.all([
      fetchEnabledSources('videos', true),
      fetchEnabledSources('collections', false)
    ]);

    // First, collect videos directly from where they're hosted,
    // in case any of them are included in collection sites.
    // And if they are, that's one less API request we have to make to
    // get that video's metadata.
    const videos = [].concat(...sourceResults.map((result) => {
      result.videos.forEach((video, i) => {
        video.source = result.source;
        video.index = i;
      });
      return result.videos;
    }));
    const videosMap = new Map();
    videos.forEach((video) => {
      videosMap.set(video.url, video);
      cachedVideos.push(video.url, video, true);
    });

    const colVideos = [].concat(...colResults.map((result) => {
      result.videos.forEach((video, i) => {
        const col = video.col || {};
        delete video.col;
        col.source = result.source;
        video.collections = [col];
        video.index = i;
      });
      return result.videos;
    }));

    // If anything from a collection site is already in the list of
    // videos directly gathered from a hosting site, then merge them.
    // But give preference to the site hosting the video, in case
    // the user is following those channels.
    // That way, direct channel subscriptions get priority.
    colVideos.forEach((colVideo) => {
      const video = videosMap.get(colVideo.url);
      if (video) {
        // Keep a reference of the collection title for filtering,
        // since the video will have its own title.
        colVideo.collections[0].title = colVideo.title;
        if (video.collections) {
          // It's possible that the same video could be posted in
          // many collectioin sites.
          video.collections.push(colVideo.collections[0]);
        } else {
          video.collections = colVideo.collections.slice();
        }
        video.desc = video.desc || colVideo.desc;
        video.game = video.game || colVideo.game;
      } else {
        colVideo.source = sources.sourceFromURL(colVideo.url);
        videosMap.set(colVideo.url, colVideo);
      }
    });

    return Array.from(videosMap.values());
  },

  getMetaForVideo: async (url) => {
    if (shorteners.isShortened(url)) {
      const realurl = await shorteners.getRealURL(url);
      if (realurl) {
        return sources.getMetaForVideo(realurl);
      }

    } else if (cachedVideos.has(url)) {
      return cachedVideos.get(url);

    } else {
      const source = sources.sourceFromURL(url);
      if (source) {
        return sources.videos[source].getVideo(url);
      } else {
        console.warn('Could not find source for URL: ' + url);
      }
    }
  },

  addMetaToVideo: async (video) => {
    let meta;
    try {
      meta = await sources.getMetaForVideo(video.url);
      if (!meta) { return false; }
    } catch (err) {
      console.warn('Failed to get meta for video: ' + video.url);
      console.error(err);
      return false;
    }
    video.url = meta.url;
    video.thumbnail = meta.thumbnail;
    video.length = meta.length;

    // Views and title can update later, so don't include these when getting
    // metainfo from cache.
    ['game', 'title', 'views', 'user'].forEach((field) => {
      if (meta[field] && !video[field]) {
        video[field] = meta[field];
      }
    });
    return true;
  },

  sourceFromURL: (url) => {
    for (const source in sources.videos) {
      if (sources.videos[source]._patterns.some(p => p.test(url))) {
        return source;
      }
    }
    return null;
  },

  isVideoPage: url => !!sources.sourceFromURL(url),
};

sources.patterns = [];
for (let [, videos] of Object.entries(sources.videos)) {
  videos._patterns = videos.patterns.map(util.minimatch);

  // Gather all video page patterns for context menus.
  sources.patterns = sources.patterns.concat(videos.patterns);
}

export default sources;
