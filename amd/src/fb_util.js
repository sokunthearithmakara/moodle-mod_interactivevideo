// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Moodle is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Moodle.  If not, see <http://www.gnu.org/licenses/>.

/**
 * Utility functions for interactive video flexbook content type.
 *
 * @module     mod_interactivevideo/fb_util
 * @copyright  2025 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
import $ from 'jquery';

const videoTypeRegexes = [
        {
            'type': 'yt',
            'regex': new RegExp(
                '(?:https?:\\/\\/)?' +
                '(?:www\\.)?' +
                '(?:youtube\\.com|youtu\\.be|youtube-nocookie\\.com)' +
                '(?:\\/embed\\/|\\/shorts\\/|\\/live\\/|\\/watch\\?v=|\\/)([^\\/?&#]+)',
                'i'
            ),
        },
        {
            'type': 'vimeo',
            'regex': /(?:https?:\/\/)?(?:(?:www\.)?vimeo\.com\/(?:video\/)?\d+|player\.vimeo\.com\/video\/\d+)/i,
        },
        {
            'type': 'panopto',
            'regex': /(?:https?:\/\/)?(?:www\.)?(?:[^/]*panopto\.[^/]+)\/Panopto\/.+\?id=([^/]+)/i,
        },
        {
            'type': 'dailymotion',
            'regex': /(?:https?:\/\/)?(?:www\.)?(?:dai\.ly|dailymotion\.com)\/(?:embed\/video\/|video\/|)([^/]+)/i,
        },
        {
            'type': 'wistia',
            'regex': new RegExp(
                '(?:https?:\\/\\/)?' +
                '(?:[^\\/]+\\.)?' +
                '(?:wistia\\.(?:com|net)|fast\\.wistia\\.(?:com|net))' +
                '\\/(?:medias|embed\\/iframe)\\/([^\\/?&#]+)',
                'i'
            ),
        },
        {
            'type': 'rumble',
            'regex': /https?:\/\/(?:www\.)?rumble\.com\/(?:embed\/)?([a-zA-Z0-9]+)/i,
        },
        {
            'type': 'sproutvideo',
            'regex': /(?:https?:\/\/)?(?:[^.]+\.)*(?:sproutvideo\.com\/(?:videos|embed)|vids\.io\/videos)\/([^/]+)/i,
        },
        {
            'type': 'kinescope',
            'regex': /https?:\/\/kinescope\.io\/([^/?#]+)/i,
        },
        {
            'type': 'rutube',
            'regex': /https?:\/\/rutube\.ru\/video\/(?:private\/)?(.+)/i,
        },
        {
            'type': 'spotify',
            'regex': /https?:\/\/open\.spotify\.com\/(episode|track)\/([^/]+)/i,
        },
        {
            'type': 'soundcloud',
            'regex': /https?:\/\/soundcloud\.com\/([^/]+)\/([^/]+)/i,
        },
        {
            'type': 'peertube',
            'regex': /https?:\/\/([^/]+)\/w\/([^/]+)/i,
        },
        {
            'type': 'bunnystream',
            'regex': /(?:https?:\/\/)?(?:iframe|player)\.mediadelivery\.net\/(?:embed|watch|play)\/\d+\/([a-zA-Z0-9-]+)/i,
        },
        {
            'type': 'dyntube',
            'regex': /(?:https?:\/\/)?(videos\.dyntube\.com|dyntube\.com)\/(videos|iframes)\/([^/]+)/i,
        },
        {
            'type': 'vdocipher',
            'regex': /(?:https?:\/\/)?(?:www\.)?(?:[^.]+\.)*(?:vdocipher\.com)\/dashboard\/video\/([^/]+)/i,
        },
        {
            'type': 'vidyard',
            'regex': /(?:https?:\/\/)?(?:share\.vidyard\.com)\/watch\/([a-zA-Z0-9]+)/i,
        },
        {
            'type': 'viostream',
            'regex': /(?:https?:\/\/)?(?:share\.viostream\.com)\/([a-zA-Z0-9]+)/i,
        }
    ];

const checkVideo = (url) => new Promise((resolve) => {
    // Check if URL appears to be an HLS or DASH stream.
    if (url.includes('.m3u8') || url.includes('.mpd')) {
        let video = document.createElement('video');
        let type = url.includes('.m3u8') ? 'application/vnd.apple.mpegurl' : 'application/dash+xml';
        if (video.canPlayType(type)) {
            resolve(true);
        } else {
            if (url.includes('.m3u8')) {
                require(['mod_interactivevideo/player/hls'], function(Hls) {
                    resolve(Hls.isSupported());
                });
            } else if (url.includes('.mpd')) {
                require(['mod_interactivevideo/player/dash'], function(dashjs) {
                    resolve(Boolean(dashjs.MediaPlayer()));
                });
            } else {
                resolve(false);
            }
        }
        return;
    }

    let settled = false;
    let video = document.createElement('video');
    const finish = (result) => {
        if (settled) {
            return;
        }
        settled = true;
        video.removeAttribute('src');
        video.load();
        resolve(result);
    };
    video.preload = 'metadata';
    video.src = url;
    video.addEventListener('loadedmetadata', function() {
        finish(true);
    });
    video.addEventListener('canplay', function() {
        finish(true);
    });
    video.addEventListener('error', function() {
        finish(false);
    });
    setTimeout(() => finish(false), 3000);
    video.load();
});

const getVideoType = async(url) => {
    const trimmed = (url || '').trim();
    if (!trimmed) {
        return null;
    }

    for (const regex of videoTypeRegexes) {
        let match = regex.regex.exec(trimmed);
        if (match) {
            return regex.type;
        }
    }

    if (await checkVideo(trimmed)) {
        return 'html5video';
    }

    return null;
};

const getVideoInfo = async(url) => {
    const type = await getVideoType(url);

    if (!type) {
        return null;
    }

    // Now get the info from the video: duration, title, poster image.
    let info;
    let player;
    await new Promise((resolve) => {
        require(['mod_interactivevideo/player/' + type], function(VP) {
            resolve(VP);
        });
    }).then(async(VP) => {
        player = new VP();
        let id = 'video-info-' + new Date().getTime();
        let $wrapper = $('#video-info-wrapper');
        let temporaryWrapper = false;
        if (!$wrapper.length) {
            $wrapper = $('<div id="video-info-wrapper" class="d-none"></div>').appendTo(document.body);
            temporaryWrapper = true;
        }
        if (type == 'html5video') {
            $wrapper.html(`<video id="${id}" class="w-100" controls></video>`);
        } else {
            $wrapper.html('<div id="' + id + '" class="w-100"></div>');
        }
        try {
            info = await player.getInfo(url, id);
        } catch (e) {
            info = null;
        } finally {
            if (temporaryWrapper) {
                $wrapper.remove();
            }
        }
        return info;
    });

    if (!info) {
        return null;
    }

    info.player = player;
    info.type = type;

    return info;
};

export {getVideoInfo, getVideoType};
