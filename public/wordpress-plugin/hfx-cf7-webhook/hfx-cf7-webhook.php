<?php // -*- coding: utf-8 -*-
/**
 * Plugin Name: HFX Honorarfuchs - CF7 Webhook
 * Plugin URI: https://www.honorarfuchs.de
 * Description: Sendet Contact Form 7 Formulardaten automatisch an die Honorarfuchs Lead-API.
 * Version: 1.2.0
 * Author: Honorarfuchs / MCC Medical CareCapital GmbH
 * Author URI: https://www.honorarfuchs.de
 * License: GPL v2 or later
 * Text Domain: hfx-cf7-webhook
 */

if (!defined('ABSPATH')) {
    exit;
}

// -- Standard-Feldnamen --

function hfx_default_field_mapping() {
    return [
        'praxis_name'               => 'praxis-name',
        'vorname'                    => 'vorname',
        'nachname'                   => 'nachname',
        'email'                      => 'your-email',
        'plz'                        => 'plz',
        'mobilnummer'                => 'mobilnummer',
        'mpartner'                   => 'MPartner',
        'anderes_abrechnungszentrum' => 'AnderesAbrechnungszentrum',
        'mp_nummer'                  => 'MPNummer',
        'nachricht'                  => 'your-message',
    ];
}

function hfx_api_field_labels() {
    return [
        'praxis_name'               => 'Praxisname',
        'vorname'                    => 'Vorname',
        'nachname'                   => 'Nachname',
        'email'                      => 'E-Mail',
        'plz'                        => 'PLZ',
        'mobilnummer'                => 'Mobilnummer',
        'mpartner'                   => 'MPartner (careCapital/privadis)',
        'anderes_abrechnungszentrum' => 'Anderes Abrechnungszentrum',
        'mp_nummer'                  => 'MP-Nummer (Kundennr. MPartner)',
        'nachricht'                  => 'Nachricht',
    ];
}

function hfx_required_fields() {
    return ['praxis_name', 'vorname', 'nachname', 'email', 'plz'];
}

// -- Hilfsfunktionen --

function hfx_get_option($key, $default = '') {
    $options = get_option('hfx_webhook_options', []);
    return $options[$key] ?? $default;
}

function hfx_get_field_mapping() {
    $saved = get_option('hfx_webhook_field_mapping', []);
    $defaults = hfx_default_field_mapping();
    return array_merge($defaults, array_filter($saved));
}

// -- Einstellungsseite registrieren --

add_action('admin_menu', 'hfx_webhook_admin_menu');
add_action('admin_init', 'hfx_webhook_settings_init');

function hfx_webhook_admin_menu() {
    add_options_page(
        'HFX CF7 Webhook',
        'HFX CF7 Webhook',
        'manage_options',
        'hfx-cf7-webhook',
        'hfx_webhook_settings_page'
    );
}

function hfx_webhook_settings_init() {
    // Allgemeine Einstellungen - eigene Gruppe
    register_setting('hfx_webhook_general', 'hfx_webhook_options', [
        'sanitize_callback' => 'hfx_webhook_sanitize',
    ]);

    // Feld-Mapping - eigene Gruppe
    register_setting('hfx_webhook_mapping', 'hfx_webhook_field_mapping', [
        'sanitize_callback' => 'hfx_webhook_sanitize_mapping',
    ]);

    add_settings_section(
        'hfx_webhook_section',
        'API-Konfiguration',
        function () {
            echo '<p>Konfigurieren Sie die Verbindung zum Honorarfuchs Lead-System.</p>';
        },
        'hfx-cf7-webhook'
    );

    add_settings_field('api_url', 'API-URL', 'hfx_field_api_url', 'hfx-cf7-webhook', 'hfx_webhook_section');
    add_settings_field('cf7_form_id', 'CF7 Formular-ID', 'hfx_field_cf7_form_id', 'hfx-cf7-webhook', 'hfx_webhook_section');
    add_settings_field('enable_logging', 'Logging aktivieren', 'hfx_field_enable_logging', 'hfx-cf7-webhook', 'hfx_webhook_section');

    // Feld-Mapping Sektion
    add_settings_section(
        'hfx_webhook_mapping_section',
        'Feld-Mapping (CF7-Feldnamen)',
        function () {
            echo '<p>Tragen Sie hier die CF7-Feldnamen ein, die in Ihrem Formular verwendet werden.</p>';
            echo '<p><strong>Abrechnungszentrum-Logik:</strong> Das Plugin kombiniert die drei Felder ';
            echo '<em>MPartner</em>, <em>AnderesAbrechnungszentrum</em> und <em>MPNummer</em> ';
            echo 'automatisch zum API-Feld <code>abrechnungszentrum</code> bzw. <code>mp_nummer</code>.</p>';
        },
        'hfx-cf7-webhook-mapping'
    );

    $labels = hfx_api_field_labels();
    $required = hfx_required_fields();
    foreach (array_keys(hfx_default_field_mapping()) as $api_field) {
        $is_required = in_array($api_field, $required);
        $label = $labels[$api_field] . ($is_required ? ' *' : '');
        add_settings_field(
            'mapping_' . $api_field,
            $label,
            'hfx_field_mapping_render',
            'hfx-cf7-webhook-mapping',
            'hfx_webhook_mapping_section',
            ['api_field' => $api_field]
        );
    }
}

function hfx_webhook_sanitize($input) {
    $sanitized = [];
    $sanitized['api_url'] = esc_url_raw($input['api_url'] ?? '');
    $sanitized['cf7_form_id'] = absint($input['cf7_form_id'] ?? 0);
    $sanitized['enable_logging'] = !empty($input['enable_logging']) ? 1 : 0;
    return $sanitized;
}

function hfx_webhook_sanitize_mapping($input) {
    $sanitized = [];
    $defaults = hfx_default_field_mapping();
    foreach (array_keys($defaults) as $api_field) {
        $val = trim(sanitize_text_field($input[$api_field] ?? ''));
        $sanitized[$api_field] = !empty($val) ? $val : $defaults[$api_field];
    }
    return $sanitized;
}

// -- Feld-Render-Funktionen --

function hfx_field_api_url() {
    $val = hfx_get_option('api_url', 'https://gvsxentbbzuyanqbqvea.supabase.co/functions/v1/capture-lead');
    echo '<input type="url" name="hfx_webhook_options[api_url]" value="' . esc_attr($val) . '" class="regular-text" />';
    echo '<p class="description">Die Endpoint-URL der Honorarfuchs Lead-API.</p>';
}

function hfx_field_cf7_form_id() {
    $val = hfx_get_option('cf7_form_id', 0);
    echo '<input type="number" name="hfx_webhook_options[cf7_form_id]" value="' . esc_attr($val) . '" min="0" />';
    echo '<p class="description">Lassen Sie 0, um alle CF7-Formulare zu senden, oder geben Sie eine bestimmte Formular-ID ein.</p>';
}

function hfx_field_enable_logging() {
    $val = hfx_get_option('enable_logging', 0);
    echo '<label><input type="checkbox" name="hfx_webhook_options[enable_logging]" value="1" ' . checked($val, 1, false) . ' /> Debug-Logs in wp-content/debug.log schreiben</label>';
}

function hfx_field_mapping_render($args) {
    $api_field = $args['api_field'];
    $mapping = hfx_get_field_mapping();
    $val = $mapping[$api_field] ?? '';
    $default = hfx_default_field_mapping()[$api_field];

    // Beschreibungen je Feld
    $descriptions = [
        'mpartner'                   => 'CF7-Feld fuer careCapital/privadis Auswahl. Wird zum API-Feld <code>abrechnungszentrum</code> zusammengefuehrt.',
        'anderes_abrechnungszentrum' => 'CF7-Feld fuer andere Abrechnungszentren (Freitext). Wird zum API-Feld <code>abrechnungszentrum</code> zusammengefuehrt.',
        'mp_nummer'                  => 'Kundennummer von careCapital/privadis. Wird nur gesendet wenn MPartner gesetzt ist.',
    ];

    echo '<input type="text" name="hfx_webhook_field_mapping[' . esc_attr($api_field) . ']" value="' . esc_attr($val) . '" class="regular-text" />';

    if (isset($descriptions[$api_field])) {
        echo '<p class="description">' . $descriptions[$api_field] . ' Standard-CF7-Feld: <code>' . esc_html($default) . '</code></p>';
    } else {
        echo '<p class="description">Standard-CF7-Feld: <code>' . esc_html($default) . '</code></p>';
    }
}

// -- Einstellungsseite rendern --

function hfx_webhook_settings_page() {
    if (!current_user_can('manage_options')) {
        return;
    }
    ?>
    <div class="wrap">
        <h1>HFX Honorarfuchs - CF7 Webhook</h1>

        <h2 class="nav-tab-wrapper">
            <a href="#tab-general" class="nav-tab nav-tab-active" onclick="hfxSwitchTab(event,'tab-general')">Allgemein</a>
            <a href="#tab-mapping" class="nav-tab" onclick="hfxSwitchTab(event,'tab-mapping')">Feld-Mapping</a>
            <a href="#tab-logs" class="nav-tab" onclick="hfxSwitchTab(event,'tab-logs')">Logs</a>
        </h2>

        <!-- Tab: Allgemein -->
        <div id="tab-general" class="hfx-tab-content">
            <form action="options.php" method="post">
                <?php
                settings_fields('hfx_webhook_general');
                do_settings_sections('hfx-cf7-webhook');
                submit_button('Einstellungen speichern');
                ?>
            </form>
        </div>

        <!-- Tab: Feld-Mapping -->
        <div id="tab-mapping" class="hfx-tab-content" style="display:none;">
            <form action="options.php" method="post">
                <?php
                settings_fields('hfx_webhook_mapping');
                do_settings_sections('hfx-cf7-webhook-mapping');
                submit_button('Mapping speichern');
                ?>
            </form>

            <hr />
            <h3>Abrechnungszentrum-Logik</h3>
            <div style="background:#f0f0f1; padding:12px 16px; border-left:4px solid #2271b1; margin-bottom:20px;">
                <p style="margin:0 0 8px 0;"><strong>So werden die CF7-Felder zur API zusammengefuehrt:</strong></p>
                <ul style="margin:0; padding-left:20px;">
                    <li><strong>MPartner</strong> = careCapital oder privadis -> API-Feld <code>abrechnungszentrum</code> erhaelt den Wert (z.B. "CareCapital")</li>
                    <li><strong>AnderesAbrechnungszentrum</strong> = Freitext -> API-Feld <code>abrechnungszentrum</code> erhaelt diesen Wert</li>
                    <li>Keines gesetzt -> API-Feld <code>abrechnungszentrum</code> = "nein"</li>
                    <li><strong>MPNummer</strong> wird nur gesendet, wenn MPartner (careCapital/privadis) ausgewaehlt ist</li>
                </ul>
            </div>

            <h3>CF7 Formular-Vorlage</h3>
            <p>Kopieren Sie folgendes Template in Ihr Contact Form 7 Formular (passen Sie die Feldnamen ggf. an):</p>
            <?php hfx_render_cf7_template(); ?>
        </div>

        <!-- Tab: Logs -->
        <div id="tab-logs" class="hfx-tab-content" style="display:none;">
            <?php hfx_webhook_render_log_viewer(); ?>
        </div>

        <script>
        function hfxSwitchTab(e, tabId) {
            e.preventDefault();
            var tabs = document.querySelectorAll('.hfx-tab-content');
            for (var i = 0; i < tabs.length; i++) { tabs[i].style.display = 'none'; }
            document.getElementById(tabId).style.display = 'block';
            var links = document.querySelectorAll('.nav-tab');
            for (var i = 0; i < links.length; i++) { links[i].className = 'nav-tab'; }
            e.target.className = 'nav-tab nav-tab-active';
        }
        </script>
    </div>
    <?php
}

// -- CF7 Template anzeigen --

function hfx_render_cf7_template() {
    $mapping = hfx_get_field_mapping();
    ?>
    <textarea readonly rows="28" style="width:100%; max-width:700px; font-family:monospace; font-size:12px;">
<label>Praxisname *
    [text* <?php echo esc_html($mapping['praxis_name']); ?>]</label>

<label>Vorname *
    [text* <?php echo esc_html($mapping['vorname']); ?>]</label>

<label>Nachname *
    [text* <?php echo esc_html($mapping['nachname']); ?>]</label>

<label>E-Mail-Adresse *
    [email* <?php echo esc_html($mapping['email']); ?>]</label>

<label>PLZ *
    [text* <?php echo esc_html($mapping['plz']); ?>]</label>

<label>Mobilnummer
    [tel <?php echo esc_html($mapping['mobilnummer']); ?>]</label>

<label>Medizinpartner (careCapital/privadis)
    [select <?php echo esc_html($mapping['mpartner']); ?> "" "CareCapital" "privadis"]</label>

<label>MP-Nummer (Kundennummer)
    [text <?php echo esc_html($mapping['mp_nummer']); ?>]</label>

<label>Anderes Abrechnungszentrum
    [text <?php echo esc_html($mapping['anderes_abrechnungszentrum']); ?>]</label>

<label>Ihre Nachricht
    [textarea <?php echo esc_html($mapping['nachricht']); ?>]</label>

[submit "Absenden"]
    </textarea>
    <?php
}

// -- Letzte Webhook-Aufrufe anzeigen --

function hfx_webhook_render_log_viewer() {
    $logs = get_option('hfx_webhook_logs', []);
    if (empty($logs)) {
        echo '<p>Noch keine Webhook-Aufrufe protokolliert.</p>';
        return;
    }
    ?>
    <h3>Letzte Webhook-Aufrufe</h3>
    <table class="widefat fixed striped">
        <thead>
            <tr>
                <th style="width:160px;">Zeitpunkt</th>
                <th style="width:80px;">Status</th>
                <th>E-Mail</th>
                <th>HFX-Nr.</th>
                <th>Antwort</th>
            </tr>
        </thead>
        <tbody>
            <?php foreach (array_reverse($logs) as $log): ?>
            <tr>
                <td><?php echo esc_html($log['time']); ?></td>
                <td>
                    <?php if ($log['success']): ?>
                        <span style="color:green;">OK</span>
                    <?php else: ?>
                        <span style="color:red;">Fehler</span>
                    <?php endif; ?>
                </td>
                <td><?php echo esc_html($log['email'] ?? '-'); ?></td>
                <td><?php echo esc_html($log['hfx_number'] ?? '-'); ?></td>
                <td><code style="font-size:11px;"><?php echo esc_html(wp_trim_words($log['response'] ?? '', 20)); ?></code></td>
            </tr>
            <?php endforeach; ?>
        </tbody>
    </table>
    <?php
}

// -- CF7 Hook: Nach erfolgreicher Validierung senden --

add_action('wpcf7_before_send_mail', 'hfx_cf7_send_to_api', 10, 3);

function hfx_cf7_send_to_api($contact_form, &$abort, $submission) {
    $api_url = hfx_get_option('api_url');
    if (empty($api_url)) {
        return;
    }

    // Formular-ID-Filter pruefen
    $target_form_id = (int) hfx_get_option('cf7_form_id', 0);
    if ($target_form_id > 0 && $contact_form->id() !== $target_form_id) {
        return;
    }

    $posted = $submission->get_posted_data();
    $mapping = hfx_get_field_mapping();

    // Wert aus geposteten Daten anhand des konfigurierten Feldnamens lesen
    $get = function($field_key) use ($posted, $mapping) {
        $cf7_field = $mapping[$field_key] ?? '';
        if (empty($cf7_field)) return '';
        $val = $posted[$cf7_field] ?? '';
        return is_array($val) ? ($val[0] ?? '') : $val;
    };

    // -- Abrechnungszentrum-Logik: 3 CF7-Felder -> 1 API-Feld --
    $mpartner       = sanitize_text_field($get('mpartner'));
    $anderes_az     = sanitize_text_field($get('anderes_abrechnungszentrum'));
    $mp_nummer_raw  = sanitize_text_field($get('mp_nummer'));

    // Zusammenfuehrung: MPartner hat Vorrang, dann AnderesAbrechnungszentrum, sonst "nein"
    $abrechnungszentrum = 'nein';
    $mp_nummer_final    = null;

    if (!empty($mpartner)) {
        // careCapital oder privadis ausgewaehlt
        $abrechnungszentrum = $mpartner;
        // MP-Nummer nur senden wenn MPartner gesetzt
        $mp_nummer_final = !empty($mp_nummer_raw) ? $mp_nummer_raw : null;
    } elseif (!empty($anderes_az)) {
        // Anderes Abrechnungszentrum (Freitext)
        $abrechnungszentrum = $anderes_az;
        // MP-Nummer bei fremdem Zentrum nicht relevant
        $mp_nummer_final = null;
    }

    $payload = [
        'praxis_name'        => sanitize_text_field($get('praxis_name')),
        'vorname'            => sanitize_text_field($get('vorname')),
        'nachname'           => sanitize_text_field($get('nachname')),
        'email'              => sanitize_email($get('email')),
        'plz'                => sanitize_text_field($get('plz')),
        'mobilnummer'        => sanitize_text_field($get('mobilnummer')),
        'abrechnungszentrum' => $abrechnungszentrum,
        'mp_nummer'          => $mp_nummer_final,
        'nachricht'          => sanitize_textarea_field($get('nachricht')),
    ];

    // Leere optionale Felder auf null setzen
    foreach (['mobilnummer', 'nachricht'] as $optional) {
        if (empty($payload[$optional])) {
            $payload[$optional] = null;
        }
    }

    $logging = (bool) hfx_get_option('enable_logging', 0);

    if ($logging) {
        error_log('[HFX Webhook] MPartner: "' . $mpartner . '", AnderesAZ: "' . $anderes_az . '", MPNummer: "' . $mp_nummer_raw . '"');
        error_log('[HFX Webhook] -> abrechnungszentrum: "' . $abrechnungszentrum . '", mp_nummer: "' . ($mp_nummer_final ?? 'null') . '"');
        error_log('[HFX Webhook] Sending payload: ' . wp_json_encode($payload));
    }

    $response = wp_remote_post($api_url, [
        'timeout'   => 15,
        'headers'   => [
            'Content-Type' => 'application/json',
        ],
        'body'      => wp_json_encode($payload),
    ]);

    // Ergebnis loggen
    $log_entry = [
        'time'       => current_time('Y-m-d H:i:s'),
        'email'      => $payload['email'],
        'success'    => false,
        'response'   => '',
        'hfx_number' => '',
    ];

    if (is_wp_error($response)) {
        $log_entry['response'] = $response->get_error_message();
        if ($logging) {
            error_log('[HFX Webhook] Error: ' . $response->get_error_message());
        }
    } else {
        $status_code = wp_remote_retrieve_response_code($response);
        $body        = wp_remote_retrieve_body($response);
        $data        = json_decode($body, true);

        $log_entry['response']   = $body;
        $log_entry['success']    = $status_code === 200 && !empty($data['success']);
        $log_entry['hfx_number'] = $data['hfx_customer_number'] ?? '';

        if ($logging) {
            error_log('[HFX Webhook] Response (' . $status_code . '): ' . $body);
        }
    }

    // Letzte 20 Log-Eintraege speichern
    $logs = get_option('hfx_webhook_logs', []);
    $logs[] = $log_entry;
    $logs = array_slice($logs, -20);
    update_option('hfx_webhook_logs', $logs, false);
}
