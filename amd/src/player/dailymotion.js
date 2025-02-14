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
 * DailyMotion Player class
 * Documented at https://developers.dailymotion.com/sdk/player-sdk/web/
 * @module     mod_interactivevideo/player/dailymotion
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
import {dispatchEvent} from 'core/event_dispatcher';
import $ from 'jquery';
import allowAutoplay from 'mod_interactivevideo/player/checkautoplay';
let player;
class DailyMotion {
    /**
     * Construct a new DailyMotion player instance.
     */
    constructor() {
        this.type = 'dailymotion';
        this.frequency = 0.27;
        this.support = {
            playbackrate: true,
            quality: true,
            password: true,
        };
        this.useAnimationFrame = false;
    }
    /**
     * Loads a new Dailymotion player instance.
     *
     * @param {string} url - The URL of the Dailymotion video.
     * @param {number} start - The start time of the video in seconds.
     * @param {number} end - The end time of the video in seconds.
     * @param {object} opts - The options for the player.
     */
    async load(url, start, end, opts = {}) {
        const showControls = opts.showControls || false;
        const customStart = opts.customStart || false;
        const node = opts.node || 'player';
        this.start = start;

        this.allowAutoplay = await allowAutoplay(document.getElementById(node));
        if (!this.allowAutoplay) {
            dispatchEvent('iv:autoplayBlocked');
        }
        const reg = /(?:https?:\/\/)?(?:www\.)?(?:dai\.ly|dailymotion\.com)\/(?:embed\/video\/|video\/|)([^/]+)/g;
        const match = reg.exec(url);
        const videoId = match[1];
        this.videoId = videoId;
        var self = this;
        self.aspectratio = 16 / 9; //
        self.posterImage = '';
        if (opts.editform) {
            fetch(`https://api.dailymotion.com/video/${videoId}?fields=thumbnail_720_url`)
                .then(response => response.json())
                .then(data => {
                    self.posterImage = data.thumbnail_720_url;
                    return;
                })
                .catch(() => {
                    return;
                });
        }
        var ready = false;
        var dmOptions = {
            video: videoId,
            params: {
                startTime: start,
                mute: true,
            },
        };
        let dailymotion;
        const dailymotionEvents = async(player) => {
            const state = await player.getState();
            if (state.playerIsViewable === false && state.videoDuration == 0) {
                dispatchEvent('iv:playerError', {error: 'Video is not viewable.'});
                return;
            }

            player.off(dailymotion.events.VIDEO_DURATIONCHANGE);
            if ((state.videoIsPasswordRequired && state.videoDuration == 0) || state.videoDuration == 0) {
                player.on(dailymotion.events.VIDEO_DURATIONCHANGE, function() {
                    dailymotionEvents(player);
                });
                return;
            }
            self.aspectratio = await self.ratio();
            const totaltime = Number(state.videoDuration.toFixed(2)) - self.frequency;
            end = !end ? totaltime : Math.min(end, totaltime);
            end = Number(end.toFixed(2));
            self.end = end;
            self.totaltime = totaltime;
            self.duration = self.end - self.start;
            self.title = state.videoTitle;

            // Get the available captions.
            // Unset the captions.
            player.setSubtitles(null);
            let tracks = state.videoSubtitlesList;
            if (tracks && tracks.length > 0) {
                tracks = tracks.map(track => {
                    const locale = track.split('-')[0];
                    const country = track.split('-')[1];
                    let displayNames;
                    try {
                        displayNames = new Intl.DisplayNames([`${M.cfg.language}`], {type: 'language'});
                    } catch (e) {
                        displayNames = new Intl.DisplayNames(['en'], {type: 'language'});
                    }
                    let label;
                    if (country == 'auto') {
                        label = displayNames.of(locale) + ' (Auto)';
                    } else {
                        label = displayNames.of(track) ?? track.toUpperCase();
                    }
                    return {
                        label,
                        code: track,
                    };
                });
                self.captions = tracks;
            }

            // Fire iv:playerLoaded event
            dispatchEvent('iv:playerLoaded', {
                tracks: tracks, qualities: self.getQualities(),
            });

            // If the browser blocks autoplay, we need to show the play button.
            if (!state.playerIsPlaybackAllowed && !ready) {
                dispatchEvent('iv:playerReady', null, document.getElementById(node));
                $('#start-screen #play').removeClass('d-none');
                $('#start-screen #spinner').remove();
                $('.video-block, #video-block').addClass('no-pointer bg-transparent');
                // $('#start-screen').addClass('no-pointer');
                $('#annotation-canvas').removeClass('d-none');
            }

            // Handle Dailymotion behavior. Video always start from the start time,
            // So if you seek before starting the video, it will just start from the beginning.
            // So, to deal with this, we have to start the video as soon as the player is ready.
            // Let it play on mute which sometimes include ads. When the ad is done, the VIDEO_START event will fire.
            // That's when we let user know, player is ready.
            const playerEvents = () => {
                player.on(dailymotion.events.VIDEO_END, function() {
                    self.ended = true;
                    dispatchEvent('iv:playerEnded');
                });

                player.off(dailymotion.events.VIDEO_TIMECHANGE);
                player.on(dailymotion.events.VIDEO_TIMECHANGE, async function(e) {
                    if (!ready) {
                        return;
                    }
                    if (e.videoTime < start) {
                        player.seek(start);
                    }
                    if (e.videoTime > end + self.frequency) {
                        player.seek(end - 1);
                    }
                    if (self.ended) {
                        dispatchEvent('iv:playerEnded');
                        self.ended = false;
                    } else {
                        if (e.playerIsPlaying === true) {
                            dispatchEvent('iv:playerPlaying');
                            self.ended = false;
                            self.paused = false;
                        }
                        if (e.videoTime >= end) {
                            dispatchEvent('iv:playerEnded');
                            self.ended = true;
                        }
                    }
                });

                player.on(dailymotion.events.VIDEO_PLAY, async function(e) {
                    if (!ready) {
                        return;
                    }
                    if (self.ended || e.videoTime >= end) {
                        self.ended = false;
                        player.seek(start);
                    }
                    self.paused = false;
                    dispatchEvent('iv:playerPlaying');
                });

                player.on(dailymotion.events.VIDEO_PAUSE, async function() {
                    if (!ready) {
                        return;
                    }
                    self.paused = true;
                    if (player.getState().videoTime >= end) {
                        self.ended = true;
                        dispatchEvent('iv:playerEnded');
                    } else {
                        dispatchEvent('iv:playerPaused');
                    }
                });

                player.on(dailymotion.events.PLAYER_ERROR, function(e) {
                    dispatchEvent('iv:playerError', {error: e});
                });

                player.on(dailymotion.events.PLAYER_PLAYBACKSPEEDCHANGE, function(e) {
                    dispatchEvent('iv:playerRateChange', {rate: e.playerPlaybackSpeed});
                });

                player.on(dailymotion.events.VIDEO_QUALITYCHANGE, function(e) {
                    dispatchEvent('iv:playerQualityChange', {quality: e.videoQuality});
                });
            };

            if (customStart) {
                player.setMute(true);
                player.play(); // Start the video to get the ad out of the way.
                player.on(dailymotion.events.VIDEO_TIMECHANGE, function() {
                    $("#start-screen").removeClass('bg-transparent');
                    if (ready == true) { // When the video is replayed, it will fire VIDEO_START event again.
                        player.setMute(true);
                    }
                    setTimeout(async() => {
                        if (state.playerIsPlaybackAllowed) {
                            player.pause();
                        }
                        player.seek(start);
                        player.setMute(false);
                        if (!ready) {
                            playerEvents();
                            ready = true;
                            if (state.playerIsPlaybackAllowed) {
                                dispatchEvent('iv:playerReady');
                            }
                        }
                    }, state.playerIsPlaybackAllowed ? 1000 : 0);
                });
            } else {
                playerEvents();
                ready = true;
                if (state.playerIsPlaybackAllowed) {
                    dispatchEvent('iv:playerReady');
                }
            }

            // Show ads to user so they know ad is playing, not because something is wrong.
            player.on(dailymotion.events.AD_START, function() {
                $(".video-block, #video-block").addClass('d-none');
                $("#start-screen").addClass('d-none');
                $('#annotation-canvas').removeClass('d-none');
            });

            player.on(dailymotion.events.AD_END, function() {
                $(".video-block, #video-block").removeClass('d-none');
                $("#start-screen").removeClass('d-none');
            });
        };

        if (!window.dailymotion) {
            // Add dailymotion script.
            // At the time of writing this, the dailymotion player script is not generally available.
            // Developers must set up the players and get the script from the dailymotion website.
            var tag = document.createElement('script');
            if (showControls || opts.passwordprotected) {
                // If password protected, show controls; otherwise, users can't enter the password.
                // (Possible bug on Dailymotion side)
                // If you fork this, change this to your own dailymotion player.
                tag.src = "https://geo.dailymotion.com/libs/player/xsyje.js";
            } else {
                // If you fork this, change this to your own dailymotion player.
                tag.src = "https://geo.dailymotion.com/libs/player/xsyj8.js";
            }
            var firstScriptTag = document.getElementsByTagName('script')[0];
            firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

            window.dailymotion = {
                onScriptLoaded: async() => {
                    dailymotion = window.dailymotion;
                    player = await dailymotion.createPlayer(node, dmOptions);
                    dailymotionEvents(player);
                }
            };
        } else {
            player = await window.dailymotion.createPlayer(node, dmOptions);
            dailymotionEvents(player);
            dailymotion = window.dailymotion;
        }
    }
    /**
     * Plays the Dailymotion video using the player instance.
     */
    play() {
        player.play();
        this.paused = false;
    }
    /**
     * Pauses the Dailymotion player.
     *
     * This method calls the `pause` function on the `player` object to halt video playback.
     */
    async pause() {
        if (this.paused) {
            return false;
        }
        await player.pause();
        this.paused = true;
        return true;
    }
    /**
     * Stops the video playback and seeks to the specified start time.
     *
     * @param {number} starttime - The time (in seconds) to seek to before pausing the video.
     */
    stop(starttime) {
        player.seek(starttime);
        player.pause();
    }
    /**
     * Seeks the video player to a specified time.
     *
     * @param {number} time - The time in seconds to seek to.
     * @returns {Promise<void>} A promise that resolves when the seek operation is complete.
     */
    async seek(time) {
        await player.seek(time);
        this.ended = false;
        dispatchEvent('iv:playerSeek', {time: time});
    }
    /**
     * Retrieves the current playback time of the video.
     *
     * @returns {Promise<number>} A promise that resolves to the current video time in seconds.
     */
    async getCurrentTime() {
        const state = await player.getState();
        return state.videoTime;
    }
    /**
     * Asynchronously retrieves the duration of the video.
     *
     * @returns {Promise<number>} A promise that resolves to the duration of the video in seconds.
     */
    async getDuration() {
        const state = await player.getState();
        return state.videoDuration;
    }
    /**
     * Checks if the Dailymotion player is paused.
     *
     * @async
     * @function isPaused
     * @returns {Promise<boolean>} A promise that resolves to a boolean indicating whether the player is paused.
     */
    async isPaused() {
        if (this.paused) {
            return true;
        }
        const state = await player.getState();
        return !state.playerIsPlaying;
    }
    /**
     * Checks if the Dailymotion player is currently playing.
     *
     * @returns {Promise<boolean>} A promise that resolves to a boolean indicating if the player is playing.
     */
    async isPlaying() {
        if (this.paused) {
            return false;
        }
        const state = await player.getState();
        return state.playerIsPlaying;
    }

    /**
     * Checks if the Dailymotion player has ended and is on the replay screen.
     *
     * @returns {Promise<boolean>} A promise that resolves to a boolean indicating if the player is on the replay screen.
     */
    async isEnded() {
        if (this.ended) {
            return true;
        }
        const state = await player.getState();
        return state.playerIsReplayScreen;
    }
    /**
     * Calculates the aspect ratio of the player and compares it to 16:9.
     * If the player's aspect ratio is greater than 16:9, it returns the player's aspect ratio.
     * Otherwise, it returns 16:9.
     *
     * @returns {Promise<number>} The aspect ratio of the player or 16:9.
     */
    async ratio() {
        const state = await player.getState();
        const ratio = state.playerAspectRatio.split(':');
        return ratio[0] / ratio[1];
    }
    /**
     * Destroys the Dailymotion player instance.
     *
     * This method calls the `destroy` method on the `player` object to clean up
     * and release any resources held by the player.
     */
    destroy() {
        player.off();
        player.destroy();
    }
    /**
     * Asynchronously retrieves the current state of the player.
     *
     * @returns {Promise<Object>} A promise that resolves to the current state of the player.
     */
    async getState() {
        const state = await player.getState();
        return state;
    }
    /**
     * Sets the playback speed of the Dailymotion player.
     *
     * @param {number} rate - The playback rate to set.
     */
    setRate(rate) {
        player.setPlaybackSpeed(rate);
    }
    /**
     * Mutes the Dailymotion player.
     *
     * This method sets the player's mute state to true, effectively silencing any audio.
     */
    mute() {
        player.setMute(true);
    }
    /**
     * Unmutes the Dailymotion player.
     */
    unMute() {
        player.setMute(false);
        player.setVolume(1);
    }
    /**
     * Returns the original Dailymotion player instance.
     *
     * @returns {Object} The Dailymotion player instance.
     */
    originalPlayer() {
        return player;
    }
    /**
     * Sets the quality of the video player.
     *
     * @param {string} quality - The desired quality level for the video player.
     */
    setQuality(quality) {
        player.setQuality(quality);
    }
    /**
     * Retrieves the available video qualities and the current quality setting.
     *
     * @returns {Promise<Object>} An object containing:
     * - `qualities` {Array<string>}: A list of available video qualities including 'default'.
     * - `qualitiesLabel` {Array<string>}: A list of video quality labels including 'Auto'.
     * - `currentQuality` {string}: The current video quality setting, 'default' if set to 'Auto'.
     */
    async getQualities() {
        let states = await this.getState();
        return {
            qualities: ['default', ...states.videoQualitiesList],
            qualitiesLabel: ['Auto', ...states.videoQualitiesList],
            currentQuality: states.videoQuality == 'Auto' ? 'default' : states.videoQuality,
        };
    }

    /**
     * Sets the caption track for the video player.
     * @param {string} track - The caption track to set.
     */
    setCaption(track) {
        player.setSubtitles(track);
    }
}

export default DailyMotion;