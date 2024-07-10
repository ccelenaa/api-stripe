echo 'migrate:start'

sshpass -p "K5b9g0M0D2B6m2m" ssh root@31.207.38.168 << EOF
cd /var/www/viecitoyenne/api/back
psql postgresql://postgres:myPassword@localhost:5432
CREATE DATABASE bleme1;
CREATE USER bleme_1 WITH ENCRYPTED PASSWORD 'bleme_1';
GRANT ALL PRIVILEGES ON DATABASE bleme1 to bleme_1;
EOF

sshpass -p "K5b9g0M0D2B6m2m" ssh root@31.207.38.168 << EOF
npm run migrate
EOF

# sshpass -p "K5b9g0M0D2B6m2m" ssh root@31.207.38.168 << EOF
# cd /var/www/viecitoyenne/api/back
# psql postgresql://bleme_1:bleme_1@localhost:5432/bleme1;
# \dp
# EOF

echo 'migrate:done'