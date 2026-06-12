#!/bin/bash
set -euxo pipefail

# Etag (purely so a new dist version forces user_data to differ): ${dist_etag}

# Add 1GB swap so a Go build can't OOM-kill us
fallocate -l 1G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

dnf install -y unzip awscli golang

# Pull dist from S3 (instance role grants s3:GetObject on this bucket only)
mkdir -p /var/www/quiz
cd /tmp
aws s3 cp "s3://${dist_bucket}/${dist_key}" dist.zip --region "${aws_region}"
unzip -o dist.zip -d /var/www/quiz

# Build a custom Caddy with the Route53 DNS plugin (needed for DNS-01 ACME).
# Versions pinned so a fresh boot is reproducible and not at the mercy of
# upstream master. Bump intentionally when refreshing.
XCADDY_VERSION=v0.4.5
CADDY_VERSION=v2.8.4
ROUTE53_PLUGIN_VERSION=v1.5.0

# Cloud-init runs user_data with no $HOME set; Go refuses to build without a cache dir.
# Keep GOPATH/GOCACHE off /tmp (which is a small tmpfs on AL2023 and fills up
# during the build) — put them on the real disk instead.
export HOME=/root
export GOPATH=/var/lib/go
export GOCACHE=/var/lib/go/cache
export GOBIN=/usr/local/bin
mkdir -p $GOPATH $GOCACHE

go install github.com/caddyserver/xcaddy/cmd/xcaddy@$XCADDY_VERSION
cd /tmp
/usr/local/bin/xcaddy build $CADDY_VERSION \
  --with github.com/caddy-dns/route53@$ROUTE53_PLUGIN_VERSION \
  --output /usr/local/bin/caddy

# Caddy user + dirs
useradd --system --home /var/lib/caddy --shell /usr/sbin/nologin caddy || true
mkdir -p /var/lib/caddy /etc/caddy
chown -R caddy:caddy /var/lib/caddy /var/www/quiz

cat > /etc/caddy/Caddyfile <<'CADDY'
${hostname} {
    root * /var/www/quiz
    encode gzip

    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Frame-Options "SAMEORIGIN"
        X-Content-Type-Options "nosniff"
        Referrer-Policy "no-referrer"
        -Server
    }

    # Pretty URLs: /linux-sysadmin-security -> /linux-sysadmin-security.html
    try_files {path} {path}.html {path}/ =404

    file_server

    tls ${acme_email} {
        dns route53
    }

    log {
        output file /var/log/caddy/access.log
    }
}
CADDY

mkdir -p /var/log/caddy
chown caddy:caddy /var/log/caddy

cat > /etc/systemd/system/caddy.service <<'UNIT'
[Unit]
Description=Caddy
Documentation=https://caddyserver.com/docs/
After=network-online.target
Wants=network-online.target

[Service]
Type=notify
User=caddy
Group=caddy
ExecStart=/usr/local/bin/caddy run --environ --config /etc/caddy/Caddyfile
ExecReload=/usr/local/bin/caddy reload --config /etc/caddy/Caddyfile --force
Restart=on-failure
RestartSec=5s
LimitNOFILE=1048576
AmbientCapabilities=CAP_NET_BIND_SERVICE
Environment=AWS_REGION=${aws_region}

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now caddy

echo "✅ Quiz host ready at https://${hostname}"
