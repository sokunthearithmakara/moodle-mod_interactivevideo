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
const getVideoInfo = async(url) => {
    let type = 'unknown';

    const checkVideo = (url) => new Promise((resolve) => {
        // Check if URL appears to be an HLS or DASH stream.
        if (url.includes('.m3u8') || url.includes('.mpd')) {
            // First check if the file is accessible.
            let video = document.createElement('video');
            // For HLS (m3u8) and DASH (mpd), use appropriate MIME types.
            let type = url.includes('.m3u8') ? 'application/vnd.apple.mpegurl' : 'application/dash+xml';
            // Check if the browser can play the stream type.
            if (video.canPlayType(type)) {
                resolve(true);
            } else {
                if (url.includes('.m3u8')) {
                    require(['mod_interactivevideo/player/hls'], function(Hls) {
                        if (Hls.isSupported()) {
                            resolve(true);
                        } else {
                            resolve(false);
                        }
                    });
                } else if (url.includes('.mpd')) {
                    require(['mod_interactivevideo/player/dash'], function(dashjs) {
                        if (dashjs.MediaPlayer()) {
                            resolve(true);
                        } else {
                            resolve(false);
                        }
                    });
                } else {
                    resolve(false);
                }
            }
            return;
        }

        // Remove video element if it exists.
        const existingVideo = document.querySelector('video');
        if (existingVideo) {
            existingVideo.remove();
        }
        let video = document.createElement('video');
        video.src = url;
        video.addEventListener('canplay', function() {
            resolve(true);
        });
        video.addEventListener('error', function() {
            resolve(false);
        });
    });

    let regexes = [
        {
            'type': 'yt',
            'regex': new RegExp(
                '(?:https?:\\/\\/)?' +
                '(?:www\\.)?' +
                '(?:youtube\\.com|youtu\\.be|youtube-nocookie\\.com)' +
                '(?:\\/embed\\/|\\/watch\\?v=|\\/)([^\\/]+)',
                'g'
            ),
        },
        {
            'type': 'vimeo',
            'regex': /(?:https?:\/\/)?(?:www\.)?(?:vimeo\.com)\/([^/]+)/g,
        },
        {
            'type': 'panopto',
            'regex': /(?:https?:\/\/)?(?:www\.)?(?:[^/]*panopto\.[^/]+)\/Panopto\/.+\?id=([^/]+)/g,
        },
        {
            'type': 'dailymotion',
            'regex': /(?:https?:\/\/)?(?:www\.)?(?:dai\.ly|dailymotion\.com)\/(?:embed\/video\/|video\/|)([^/]+)/g,
        },
        {
            'type': 'wistia',
            'regex': new RegExp(
                '(?:https?:\\/\\/)?' +
                '(?:www\\.)?' +
                '(?:wistia\\.com)\\/medias\\/([^\\/]+)',
                'g'
            ),
        },
        {
            'type': 'rumble',
            'regex': /https:\/\/rumble.com\/([a-zA-Z0-9]+)/,
        },
        {
            'type': 'sproutvideo',
            'regex': /(?:https?:\/\/)?(?:[^.]+\.)*(?:sproutvideo\.com\/(?:videos|embed)|vids\.io\/videos)\/([^/]+)/,
        },
        {
            'type': 'kinescope',
            'regex': /https:\/\/kinescope.io\/(.+)/,
        },
        {
            'type': 'rutube',
            'regex': /https:\/\/rutube.ru\/video\/(?:private\/)?(.+)/,
        },
        {
            'type': 'spotify',
            'regex': /https:\/\/open.spotify.com\/(episode|track)\/([^/]+)/,
        },
        {
            'type': 'soundcloud',
            'regex': /https:\/\/soundcloud.com\/([^/]+)\/([^/]+)/,
        },
        {
            'type': 'peertube',
            'regex': /https:\/\/([^/]+)\/w\/([^/]+)/,
        },
        {
            'type': 'bunnystream',
            'regex': /https?:\/\/iframe|player\.mediadelivery\.net\/(?:embed|watch|play)\/\d+\/([a-zA-Z0-9-]+)/,
        },
        {
            'type': 'dyntube',
            'regex': /(?:https?:\/\/)?(videos\.dyntube\.com|dyntube\.com)\/(videos|iframes)\/([^/]+)/,
        },
        {
            'type': 'vdocipher',
            'regex': /(?:https?:\/\/)?(?:www\.)?(?:[^.]+\.)*(?:vdocipher\.com)\/dashboard\/video\/([^/]+)/,
        },
        {
            'type': 'vidyard',
            'regex': /(?:https?:\/\/)?(?:share\.vidyard\.com)\/watch\/([a-zA-Z0-9]+)/,
        },
        {
            'type': 'viostream',
            'regex': /(?:https?:\/\/)?(?:share\.viostream\.com)\/([a-zA-Z0-9]+)/,
        }
    ];

    for (const regex of regexes) {
        let match = regex.regex.exec(url);
        if (match) {
            type = regex.type;
            break;
        }
    }

    if (type == 'unknown') {
        if (await checkVideo(url)) {
            type = 'html5video';
        }
    }

    if (type == 'unknown') {
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
        if (type == 'html5video') {
            $('#video-info-wrapper')
                .html(`<video id="${id}" class="w-100" controls></video>`);
        } else {
            $('#video-info-wrapper')
                .html('<div id="' + id + '" class="w-100"></div>');
        }
        info = await player.getInfo(url, id);
        return info;
    });

    if (!info) {
        return null;
    }

    info.player = player;
    info.type = type;

    return info;
};

export {getVideoInfo};
