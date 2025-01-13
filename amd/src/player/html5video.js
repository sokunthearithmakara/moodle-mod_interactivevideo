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
 * HTML5 Video Player class
 *
 * @module     mod_interactivevideo/player/html5video
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
import {dispatchEvent} from 'core/event_dispatcher';

class Html5Video {
    /**
     * Constructor for the HTML5 video player.
     */
    constructor() {
        this.type = "html5video";
        this.frequency = 0.5;
        this.useAnimationFrame = false;
        this.support = {
            playbackrate: true,
            quality: false,
        };
    }
    /**
     * Loads an instance of an HTML5 video player.
     *
     * @param {string} url - The URL of the video to be played.
     * @param {number} start - The start time of the video in seconds.
     * @param {number} [end] - The end time of the video in seconds. If not provided, defaults to the video's duration.
     * @param {object} opts - The options for the player.
     */
    load(url, start, end, opts = {}) {
        const showControls = opts.showControls || false;
        const node = opts.node || 'player';
        const autoplay = opts.autoplay || false;
        this.start = start;
        this.end = end;
        var player = document.getElementById(node);
        this.posterImage = player.poster;
        // Check if the url is for video or audio.
        const video = ['fmp4', 'm4v', 'mov', 'mp4', 'ogv', 'webm'];
        const ext = url.split('.').pop();
        if (video.indexOf(ext) === -1) {
            // Change the player to an audio player.
            this.audio = true;
            // Append a canvas element to the video.
            const canvas = '<canvas id="visualizer"></canvas>';
            player.insertAdjacentHTML('afterend', canvas);
        }
        player.src = url;
        player.controls = showControls;
        player.currentTime = start;
        if (document.body.classList.contains('mobiletheme') || autoplay) {
            // Preload video on mobile app. Must mute to avoid browser restriction.
            player.muted = true;
            player.autoplay = true;
        }
        // Disable keyboard controls.
        player.tabIndex = -1;

        let self = this;
        if (!showControls) {
            document.body.classList.add('no-original-controls');
        }

        // Play inline.
        player.setAttribute('playsinline', '');

        // Disable picture-in-picture.
        player.setAttribute('disablePictureInPicture', '');

        // Disable picture-in-picture.
        player.setAttribute('disablePictureInPicture', '');

        player.addEventListener('loadedmetadata', function() {
            self.aspectratio = self.ratio();
            let totaltime = Number((player.duration).toFixed(2)) - self.frequency;
            end = !end ? totaltime : Math.min(end, totaltime);
            end = Number(end.toFixed(2));
            self.end = end;
            self.totaltime = totaltime;
            self.duration = self.end - self.start;
            player.pause();
            dispatchEvent('iv:playerLoaded', {
                tracks: null
            });
            dispatchEvent('iv:playerReady');
        });

        player.addEventListener('seeked', function() {
            dispatchEvent('iv:playerSeek', {time: player.currentTime});
        });

        player.addEventListener('pause', function() {
            self.paused = true;
            dispatchEvent('iv:playerPaused');
        });

        player.addEventListener('timeupdate', function() {
            if (self.paused) {
                dispatchEvent('iv:playerPaused');
                return;
            }
            if (player.currentTime < self.start) {
                player.currentTime = self.start;
            }
            if (player.currentTime >= self.end + self.frequency) {
                player.currentTime = self.end - self.frequency;
            }
            self.paused = false;
            dispatchEvent('iv:playerPlaying');
            if (self.ended) {
                self.ended = false;
            } else {
                if (!self.ended && player.currentTime >= self.end) {
                    self.ended = true;
                    self.paused = true;
                    player.pause();
                    dispatchEvent('iv:playerEnded');
                }
            }
        });

        player.addEventListener('error', function(e) {
            dispatchEvent('iv:playerError', {error: e});
        });

        player.addEventListener('ratechange', function() {
            dispatchEvent('iv:playerRateChange', {rate: player.playbackRate});
        });

        this.player = player;
    }

    /**
     * Visualizes the audio frequency data of the HTML5 video player using a canvas element.
     * Credit: https://codepen.io/nfj525/pen/rVBaab by Nick Jones
     * This method creates an audio context and connects it to the video player's audio source.
     * It then sets up an analyser to get the frequency data and renders a bar graph visualization
     * on a canvas element with the id "visualizer".
     *
     * The visualization is updated in real-time using the `requestAnimationFrame` method.
     *
     * @method visualizer
     */
    visualizer() {
        var context = new AudioContext();
        var src = context.createMediaElementSource(this.player);
        var analyser = context.createAnalyser();
        var canvas = document.getElementById("visualizer");
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        var ctx = canvas.getContext("2d");
        src.connect(analyser);
        analyser.connect(context.destination);

        analyser.fftSize = 256;

        var bufferLength = analyser.frequencyBinCount;
        var dataArray = new Uint8Array(bufferLength);

        var WIDTH = canvas.width;
        var HEIGHT = canvas.height;

        var barWidth = (WIDTH / bufferLength) * 2.5;
        var barHeight;
        var x = 0;

        const renderFrame = () => {
            requestAnimationFrame(renderFrame);
            x = 0;
            analyser.getByteFrequencyData(dataArray);
            ctx.fillStyle = "#000";
            ctx.fillRect(0, 0, WIDTH, HEIGHT);

            for (var i = 0; i < bufferLength; i++) {
                barHeight = dataArray[i];
                var r = barHeight + (25 * (i / bufferLength));
                var g = 250 * (i / bufferLength);
                var b = 50;

                ctx.fillStyle = "rgb(" + r + "," + g + "," + b + ")";
                ctx.fillRect(x, HEIGHT - barHeight, barWidth, barHeight);

                x += barWidth + 1;
            }
        };
        renderFrame();
    }

    /**
     * Plays the HTML5 video using the player instance.
     *
     * @method play
     */
    play() {
        this.player.play();
        this.paused = false;
    }
    /**
     * Pauses the video playback.
     *
     * This method calls the pause function on the player instance to stop the video.
     */
    async pause() {
        await this.player.pause();
        this.paused = true;
        return true;
    }
    /**
     * Stops the video playback and sets the current time to the specified start time.
     *
     * @param {number} starttime - The time (in seconds) to set the video's current time to.
     */
    stop(starttime) {
        this.player.pause();
        this.player.currentTime = starttime;
    }
    /**
     * Seeks the video to a specified time.
     *
     * @param {number} time - The time in seconds to seek to.
     * @returns {boolean} Returns true when the seek operation is initiated.
     */
    seek(time) {
        this.player.currentTime = time;
        return true;
    }
    /**
     * Retrieves the current playback time of the video.
     *
     * @returns {number} The current time of the video in seconds.
     */
    getCurrentTime() {
        return this.player.currentTime;
    }
    /**
     * Retrieves the duration of the video.
     *
     * @returns {number} The duration of the video in seconds.
     */
    getDuration() {
        return this.player.duration;
    }
    /**
     * Checks if the video player is currently paused.
     *
     * @returns {boolean} True if the player is paused, false otherwise.
     */
    isPaused() {
        if (this.paused) {
            return true;
        }
        return this.player.paused;
    }
    /**
     * Checks if the video player is currently playing.
     *
     * @returns {boolean} True if the video is playing, false if it is paused.
     */
    isPlaying() {
        if (this.paused) {
            return false;
        }
        return !this.player.paused;
    }

    /**
     * Checks if the video has ended.
     *
     * @returns {boolean} True if the video has ended, otherwise false.
     */
    isEnded() {
        return this.player.ended || this.player.currentTime >= this.end;
    }
    /**
     * Calculates the aspect ratio of the video.
     * If the video is wider than a 16:9 ratio, it returns the actual video ratio.
     * Otherwise, it returns the 16:9 ratio.
     *
     * @returns {number} The aspect ratio of the video.
     */
    ratio() {
        if (this.audio) {
            return 16 / 9;
        }
        return this.player.videoWidth / this.player.videoHeight;
    }
    /**
     * Destroys the HTML5 video player instance.
     *
     * This method pauses the video, removes the source attribute, and reloads the player.
     * It is used to clean up the player instance and release any resources it may be holding.
     */
    destroy() {
        document.getElementById('video-wrapper').innerHTML = '<div id="player" style="width:100%; max-width: 100%"></div>';
        this.player.pause();
        this.player.removeAttribute('src');
        this.player.load();
    }
    /**
     * Retrieves the current state of the video player.
     *
     * @returns {string} - Returns 'paused' if the player is paused, otherwise 'playing'.
     */
    getState() {
        return this.player.paused ? 'paused' : 'playing';
    }

    /**
     * Sets the playback rate of the video player.
     *
     * @param {number} rate - The desired playback rate. A value of 1.0 represents normal speed.
     */
    setRate(rate) {
        this.player.playbackRate = rate;
    }

    /**
     * Mutes the HTML5 video player.
     */
    mute() {
        this.player.muted = true;
    }
    /**
     * Unmutes the video player.
     */
    unMute() {
        this.player.muted = false;
    }

    /**
     * Returns the original video player instance.
     *
     * @returns {Object} The video player instance.
     */
    originalPlayer() {
        return this.player;
    }

    /**
     * Sets the video quality.
     *
     * Note: This functionality is not supported.
     *
     * @param {string} quality - The desired quality setting.
     * @returns {string} The quality setting that was passed in.
     */
    setQuality(quality) {
        return quality;
    }
}

export default Html5Video;