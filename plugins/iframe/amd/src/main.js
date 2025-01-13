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
 * Main class for the iframe plugin
 *
 * @module     ivplugin_iframe/main
 * @copyright  2024 Sokunthearith Makara <sokunthearithmakara@gmail.com>
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
import $ from 'jquery';
import Base from 'mod_interactivevideo/type/base';
export default class Iframe extends Base {
    /**
     * Called when the edit form is loaded.
     * @param {Object} form The form object
     * @param {Event} event The event object
     * @return {void}
     */
    onEditFormLoaded(form, event) {
        const preview = (embed, ratio) => {
            $('.preview-iframe').html(embed);
            $('.preview-iframe').css('padding-bottom', ratio);
        };
        $(document).off('input', '[name="iframeurl"]').on('input', '[name="iframeurl"]', function(e) {
            e.preventDefault();
            e.stopPropagation();
            $('.preview-iframe').html('').css('padding-bottom', '0');
            $('[name="char1"], [name="content"]').val('');
            if ($('[name="iframeurl"]').val() === '') {
                return;
            }
            const fallback = (url) => {
                $('[name="char1"]').val('56.25%');
                $('[name="content"]').val(`<iframe src="${url}" frameborder="0" allowfullscreen></iframe>`);
                preview(`<iframe src="${url}" frameborder="0" allowfullscreen></iframe>`, '56.25%');
            };
            $.ajax({
                url: M.cfg.wwwroot + '/mod/interactivevideo/plugins/iframe/ajax.php',
                type: 'GET',
                data: {
                    action: 'getproviders',
                    sesskey: M.cfg.sesskey,
                    contextid: M.cfg.contextid,
                },
                success: function(data) {
                    const providers = data;
                    let url = $('[name="iframeurl"]').val();
                    // Format the url to match the provider_url.
                    let providerUrl = url.split('/')[2];
                    const domain = providerUrl.split('.');
                    if (domain.length > 2) {
                        providerUrl = domain[1] + '.' + domain[2];
                    } else {
                        providerUrl = domain[0] + '.' + domain[1];
                    }
                    const provider = providers.find(function(provider) {
                        return provider.provider_url.includes(providerUrl);
                    });
                    if (!provider) {
                        fallback(url);
                        return;
                    }
                    if (provider) {
                        // Reformat the url to match the endpoints scheme.
                        let urlendpoint = provider.endpoints[0].url.replace('{format}', 'json');
                        if (urlendpoint.includes('?')) {
                            urlendpoint = urlendpoint + '&url=' + url;
                        } else {
                            urlendpoint = urlendpoint + '?url=' + url;
                        }
                        if (!urlendpoint.includes('format=json')) {
                            urlendpoint = urlendpoint + '&format=json';
                        }
                        $.ajax({
                            url: M.cfg.wwwroot + '/mod/interactivevideo/plugins/iframe/ajax.php',
                            data: {
                                url: urlendpoint,
                                sesskey: M.cfg.sesskey,
                                action: 'getoembedinfo',
                                contextid: M.cfg.contextid,
                            },
                            method: "POST",
                            dataType: "text",
                            success: function(res) {
                                let data;
                                try {
                                    data = JSON.parse(res);
                                } catch (e) {
                                    fallback(url);
                                    return;
                                }

                                if (!data.html) {
                                    fallback(url);
                                    return;
                                }

                                let ratio = '56.25%';

                                if (!data.width || data.width == 0 || data.width == '100%') {
                                    if (data.height && data.height !== 0) {
                                        ratio = data.height + 'px';
                                    }
                                } else {
                                    ratio = (data.height / data.width * 100) + '%';
                                }

                                $('[name="char1"]').val(ratio);
                                // Remove any script tags from the html to avoid errors with requirejs from data.html using regex.
                                data.html = data.html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
                                let embed = $(data.html);
                                $('[name="content"]').val(data.html);
                                preview(embed, ratio);
                            },
                            error: function() {
                                fallback(url);
                            }
                        });
                    }
                }
            });
        });

        $(document).off('input', '[name=content]').on('input', '[name=content]', function(e) {
            e.preventDefault();
            if ($(this).val() === '') {
                $('.preview-iframe').html('').css('padding-bottom', '0');
                return;
            }
            preview($(this).val(), '100%');
        });
        return {form, event};
    }

    /**
     * Override the renderContainer method
     * @param {Object} annotation The annotation object
     * @return {void}
     */
    renderContainer(annotation) {
        $(`#message[data-id='${annotation.id}']`).addClass('hasiframe');
        super.renderContainer(annotation);
    }

    /**
     * Override the postContentRender method
     * @param {Object} annotation The annotation object
     * @return {void}
     */
    postContentRender(annotation) {
        const checkIframe = () => {
            if ($(`#message[data-id='${annotation.id}'] iframe`).length > 0) {
                // Remove the loading background because some iframe has transparent content
                setTimeout(() => {
                    $(`#message[data-id='${annotation.id}'] iframe`).css('background', 'none');
                }, 1000);
            } else {
                requestAnimationFrame(checkIframe);
            }
        };
        requestAnimationFrame(checkIframe);
    }

    /**
     * Override the displayReportView method
     * @param {Object} annotation The annotation object
     * @return {void}
     */
    async displayReportView(annotation) {
        const data = await this.render(annotation, 'html');
        let $message = $(`#message[data-id='${annotation.id}']`);
        $message.addClass('hasiframe');
        $message.find(`.modal-body`).html(data);
        $message.find(`.modal-body`).attr('id', 'content');
        this.postContentRender(annotation);
    }
}