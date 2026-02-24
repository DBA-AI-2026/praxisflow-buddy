<?php
/**
 * Plugin Name: HFX Honorarfuchs – CF7 Webhook
 * Plugin URI: https://www.honorarfuchs.de
 * Description: Sendet Contact Form 7 Formulardaten automatisch an die Honorarfuchs Lead-API.
 * Version: 1.0.0
 * Author: Honorarfuchs / MCC Medical CareCapital GmbH
 * Author URI: https://www.honorarfuchs.de
 * License: GPL v2 or later
 * Text Domain: hfx-cf7-webhook
 */

if (!defined('ABSPATH')) {
    exit;
}

/**
 * ============================================================
 * KONFIGURATION
 * ============================================================
 * 
 * 1. CF7-Formular-ID: Die ID des Contact Form 7 Formulars,
 *    das an die API gesendet werden soll.
 *    → Unter Kontakt → Kontaktformulare in WordPress zu finden.
 *
 * 2. Feld-Mapping: Die CF7-Feldnamen werden auf die API-Felder
 *    gemappt. Passen Sie die linken Werte (CF7-Feldnamen) an
 *    Ihr Formular an.
 * ============================================================
 */

// ── Einstellungsseite registrieren ──────────────────────────

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
    register_setting('hfx_webhook', 'hfx_webhook_options', [
        'sanitize_callback' => 'hfx_webhook_sanitize',
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
}

function hfx_webhook_sanitize($input) {
    $sanitized = [];
    $sanitized['api_url'] = esc_url_raw($input['api_url'] ?? '');
    $sanitized['cf7_form_id'] = absint($input['cf7_form_id'] ?? 0);
    $sanitized['enable_logging'] = !empty($input['enable_logging']) ? 1 : 0;
    return $sanitized;
}

function hfx_get_option($key, $default = '') {
    $options = get_option('hfx_webhook_options', []);
    return $options[$key] ?? $default;
}

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

function hfx_webhook_settings_page() {
    if (!current_user_can('manage_options')) {
        return;
    }
    ?>
    <div class="wrap">
        <h1>HFX Honorarfuchs – CF7 Webhook</h1>
        <form action="options.php" method="post">
            <?php
            settings_fields('hfx_webhook');
            do_settings_sections('hfx-cf7-webhook');
            submit_button('Einstellungen speichern');
            ?>
        </form>

        <hr />
        <h2>Feld-Mapping (CF7 → API)</h2>
        <p>Stellen Sie sicher, dass Ihr CF7-Formular folgende Feldnamen verwendet:</p>
        <table class="widefat fixed" style="max-width: 600px;">
            <thead>
                <tr>
                    <th>CF7-Feld</th>
                    <th>API-Feld</th>
                    <th>Pflicht</th>
                </tr>
            </thead>
            <tbody>
                <tr><td><code>praxis-name</code></td><td>praxis_name</td><td>✅ Ja</td></tr>
                <tr><td><code>vorname</code></td><td>vorname</td><td>✅ Ja</td></tr>
                <tr><td><code>nachname</code></td><td>nachname</td><td>✅ Ja</td></tr>
                <tr><td><code>your-email</code></td><td>email</td><td>✅ Ja</td></tr>
                <tr><td><code>plz</code></td><td>plz</td><td>✅ Ja</td></tr>
                <tr><td><code>mobilnummer</code></td><td>mobilnummer</td><td>✅ Ja</td></tr>
                <tr><td><code>abrechnungszentrum</code></td><td>abrechnungszentrum</td><td>✅ Ja</td></tr>
                <tr><td><code>mp-nummer</code></td><td>mp_nummer</td><td>Bei CC/privadis</td></tr>
                <tr><td><code>your-message</code></td><td>nachricht</td><td>Nein</td></tr>
            </tbody>
        </table>

        <hr />
        <h2>CF7 Formular-Vorlage</h2>
        <p>Kopieren Sie folgendes Template in Ihr Contact Form 7 Formular:</p>
        <textarea readonly rows="20" style="width:100%; max-width:700px; font-family:monospace; font-size:12px;">
<label>Praxisname *
    [text* praxis-name]</label>

<label>Vorname *
    [text* vorname]</label>

<label>Nachname *
    [text* nachname]</label>

<label>E-Mail-Adresse *
    [email* your-email]</label>

<label>PLZ *
    [text* plz]</label>

<label>Mobilnummer *
    [tel* mobilnummer]</label>

<label>Nutzen Sie ein Abrechnungszentrum? *
    [select* abrechnungszentrum "nein" "CareCapital" "privadis" "anderes"]</label>

<label>Medizinpartner-Nummer (falls bekannt)
    [text mp-nummer]</label>

<label>Ihre Nachricht
    [textarea your-message]</label>

[submit "Absenden"]
        </textarea>

        <?php hfx_webhook_render_log_viewer(); ?>
    </div>
    <?php
}

// ── Letzte Webhook-Aufrufe anzeigen ─────────────────────────

function hfx_webhook_render_log_viewer() {
    $logs = get_option('hfx_webhook_logs', []);
    if (empty($logs)) {
        return;
    }
    ?>
    <hr />
    <h2>Letzte Webhook-Aufrufe</h2>
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
                        <span style="color:green;">✅ OK</span>
                    <?php else: ?>
                        <span style="color:red;">❌ Fehler</span>
                    <?php endif; ?>
                </td>
                <td><?php echo esc_html($log['email'] ?? '–'); ?></td>
                <td><?php echo esc_html($log['hfx_number'] ?? '–'); ?></td>
                <td><code style="font-size:11px;"><?php echo esc_html(wp_trim_words($log['response'] ?? '', 20)); ?></code></td>
            </tr>
            <?php endforeach; ?>
        </tbody>
    </table>
    <?php
}

// ── CF7 Hook: Nach erfolgreicher Validierung senden ─────────

add_action('wpcf7_before_send_mail', 'hfx_cf7_send_to_api', 10, 3);

function hfx_cf7_send_to_api($contact_form, &$abort, $submission) {
    $api_url = hfx_get_option('api_url');
    if (empty($api_url)) {
        return;
    }

    // Formular-ID-Filter prüfen
    $target_form_id = (int) hfx_get_option('cf7_form_id', 0);
    if ($target_form_id > 0 && $contact_form->id() !== $target_form_id) {
        return;
    }

    $posted = $submission->get_posted_data();

    // CF7-Felder auf API-Format mappen
    $payload = [
        'praxis_name'       => sanitize_text_field($posted['praxis-name'] ?? $posted['praxis_name'] ?? ''),
        'vorname'           => sanitize_text_field($posted['vorname'] ?? $posted['first-name'] ?? ''),
        'nachname'          => sanitize_text_field($posted['nachname'] ?? $posted['last-name'] ?? $posted['your-name'] ?? ''),
        'email'             => sanitize_email($posted['your-email'] ?? $posted['email'] ?? ''),
        'plz'               => sanitize_text_field($posted['plz'] ?? $posted['postleitzahl'] ?? ''),
        'mobilnummer'       => sanitize_text_field($posted['mobilnummer'] ?? $posted['your-tel'] ?? $posted['telefon'] ?? ''),
        'abrechnungszentrum' => sanitize_text_field(is_array($posted['abrechnungszentrum'] ?? null) ? ($posted['abrechnungszentrum'][0] ?? 'nein') : ($posted['abrechnungszentrum'] ?? 'nein')),
        'mp_nummer'         => sanitize_text_field($posted['mp-nummer'] ?? $posted['mp_nummer'] ?? ''),
        'nachricht'         => sanitize_textarea_field($posted['your-message'] ?? $posted['nachricht'] ?? ''),
    ];

    // Leere optionale Felder entfernen
    if (empty($payload['mp_nummer'])) {
        $payload['mp_nummer'] = null;
    }
    if (empty($payload['nachricht'])) {
        $payload['nachricht'] = null;
    }

    $logging = (bool) hfx_get_option('enable_logging', 0);

    if ($logging) {
        error_log('[HFX Webhook] Sending payload: ' . wp_json_encode($payload));
    }

    // API-Request senden (Server-to-Server, kein CORS)
    $response = wp_remote_post($api_url, [
        'timeout'   => 15,
        'headers'   => [
            'Content-Type' => 'application/json',
        ],
        'body'      => wp_json_encode($payload),
    ]);

    // Ergebnis loggen
    $log_entry = [
        'time'    => current_time('Y-m-d H:i:s'),
        'email'   => $payload['email'],
        'success' => false,
        'response' => '',
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

        $log_entry['response'] = $body;
        $log_entry['success']  = $status_code === 200 && !empty($data['success']);
        $log_entry['hfx_number'] = $data['hfx_customer_number'] ?? '';

        if ($logging) {
            error_log('[HFX Webhook] Response (' . $status_code . '): ' . $body);
        }
    }

    // Letzten 20 Log-Einträge speichern
    $logs = get_option('hfx_webhook_logs', []);
    $logs[] = $log_entry;
    $logs = array_slice($logs, -20);
    update_option('hfx_webhook_logs', $logs, false);
}
