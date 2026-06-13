CREATE TABLE email_template (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id VARCHAR(100) NOT NULL,
    code VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT NULL,
    subject_template TEXT NOT NULL,
    html_template LONGTEXT NOT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY idx_template_tenant_code (tenant_id, code),
    KEY idx_template_tenant (tenant_id),
    KEY idx_template_active (tenant_id, is_active)
);

CREATE TABLE email (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id VARCHAR(100) NOT NULL,
    email_code CHAR(36) NOT NULL,
    template_id BIGINT UNSIGNED NULL,
    template_code VARCHAR(100) NULL,

    delivery_mode ENUM('sync','async') NOT NULL,
    provider_name VARCHAR(100) NOT NULL,

    sender_name VARCHAR(255) NOT NULL,
    sender_email VARCHAR(320) NOT NULL,

    subject TEXT NOT NULL,
    html_body LONGTEXT NOT NULL,

    status ENUM(
        'queued',
        'processing',
        'sent',
        'failed',
        'cancelled'
    ) NOT NULL DEFAULT 'queued',

    source_hostname VARCHAR(255) NOT NULL,
    source_apikey VARCHAR(255) NULL,

    provider_message_id VARCHAR(255) NULL,
    provider_response LONGTEXT NULL,
    error_message LONGTEXT NULL,

    queued_at DATETIME NULL,
    processing_at DATETIME NULL,
    sent_at DATETIME NULL,
    failed_at DATETIME NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY idx_email_code (email_code),

    KEY idx_email_tenant (tenant_id),
    KEY idx_email_status (status),
    KEY idx_email_provider (provider_name),
    KEY idx_email_created (created_at),
    KEY idx_email_tenant_status (tenant_id, status),
    KEY idx_email_tenant_created (tenant_id, created_at),
    KEY idx_email_template (template_code)
);

CREATE TABLE email_recipient (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    email_id BIGINT UNSIGNED NOT NULL,

    recipient_type ENUM('to','cc','bcc') NOT NULL,

    recipient_source ENUM('email','user') NOT NULL,

    user_id VARCHAR(100) NULL,
    email_address VARCHAR(320) NOT NULL,
    display_name VARCHAR(255) NULL,

    delivery_status ENUM(
        'pending',
        'sent',
        'failed'
    ) NOT NULL DEFAULT 'pending',

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    KEY idx_recipient_email (email_id),
    KEY idx_recipient_user (user_id),
    KEY idx_recipient_address (email_address),
    KEY idx_recipient_type (recipient_type)
);

CREATE TABLE email_attachment (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    email_id BIGINT UNSIGNED NOT NULL,

    attachment_source ENUM(
        'upload',
        'file_service'
    ) NOT NULL,

    file_code VARCHAR(255) NULL,

    filename VARCHAR(255) NOT NULL,
    content_type VARCHAR(255) NOT NULL,
    file_size BIGINT UNSIGNED NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    KEY idx_attachment_email (email_id),
    KEY idx_attachment_file_code (file_code)
);

CREATE TABLE email_image (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    email_id BIGINT UNSIGNED NOT NULL,

    image_source ENUM(
        'upload',
        'imaginary'
    ) NOT NULL,

    image_code VARCHAR(255) NULL,

    filename VARCHAR(255) NULL,
    content_type VARCHAR(255) NULL,

    content_id VARCHAR(255) NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    KEY idx_image_email (email_id),
    KEY idx_image_code (image_code)
);

CREATE TABLE email_template_render (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    email_id BIGINT UNSIGNED NOT NULL,

    template_code VARCHAR(100) NOT NULL,

    render_data_json LONGTEXT NOT NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    KEY idx_render_email (email_id),
    KEY idx_render_template (template_code)
);

CREATE TABLE email_event (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    email_id BIGINT UNSIGNED NOT NULL,

    event_type VARCHAR(100) NOT NULL,

    event_message TEXT NULL,

    metadata_json LONGTEXT NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    KEY idx_event_email (email_id),
    KEY idx_event_type (event_type),
    KEY idx_event_created (created_at)
);

CREATE TABLE email_queue (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    email_id BIGINT UNSIGNED NOT NULL,

    status ENUM(
        'queued',
        'processing',
        'completed',
        'failed'
    ) NOT NULL DEFAULT 'queued',

    attempt_count INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 3,

    next_attempt_at DATETIME NULL,
    last_attempt_at DATETIME NULL,

    worker_id VARCHAR(255) NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    UNIQUE KEY idx_queue_email (email_id),

    KEY idx_queue_status (status),
    KEY idx_queue_next_attempt (next_attempt_at),
    KEY idx_queue_status_attempt (status, next_attempt_at)
);